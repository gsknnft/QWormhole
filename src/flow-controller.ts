/**
 * FlowController - Adaptive Slicer for QWormhole Transport
 *
 * Implements entropy-aware flow control that adapts batch sizes based on:
 * - Negentropic index (coherence level)
 * - Entropy velocity
 * - Backpressure telemetry
 * - Token bucket rate limiting
 *
 * Design rationale:
 * - High coherence, native-native → slice drifts up toward macro batches (writev efficiency)
 * - Low coherence or TS peers → slice contracts, yielding frequent small flushes (low GC pressure)
 *
 * This enables the "stack of boxes vs stack of paper" behavior automatically.
 */

import type { BatchFramer } from "./batch-framer";
import type {
  EntropyMetrics,
  EntropyVelocity,
  CoherenceLevel,
} from "./handshake/entropy-policy";
import { deriveEntropyPolicy } from "./handshake/entropy-policy";
import { TypedEventEmitter } from "./typedEmitter";

/**
 * Session flow policy derived during handshake negotiation
 */
export interface SessionFlowPolicy {
  /** Coherence level (0..1) */
  coherence: number;
  /** Entropy velocity (0..1, derived from velocity indicator) */
  entropyVelocity: number;
  /** Preferred batch size from entropy policy table */
  preferredBatchSize: number;
  /** Minimum slice size (frames) */
  minSlice: number;
  /** Maximum slice size (frames) */
  maxSlice: number;
  /** Burst budget in bytes (from entropy/token bucket policy) */
  burstBudgetBytes: number;
  /** Rate limit in bytes per second */
  rateBytesPerSec: number;
  /** Whether peer is native (allows larger batches) */
  peerIsNative: boolean;
}

/**
 * Default policy constants
 */
export const FLOW_DEFAULTS = {
  /** Minimum slice size for micro-batching */
  MIN_SLICE: 4,
  /** Maximum slice size for macro-batching */
  MAX_SLICE: 64,
  /** Default burst budget (256 KB) */
  DEFAULT_BURST_BYTES: 256 * 1024,
  /** Default rate limit (10 MB/s) */
  DEFAULT_RATE_BYTES_PER_SEC: 10 * 1024 * 1024,
  /** Drift step when adjusting slice size */
  DRIFT_STEP: 2,
  /** TS peer max slice clamp (to reduce GC pressure) */
  TS_PEER_MAX_SLICE: 16,
  /** Upper bound on token bucket induced delay */
  MAX_RESERVE_DELAY_MS: 200,
} as const;

/**
 * Events emitted by FlowController
 */
interface FlowControllerEvents {
  /** Emitted when slice size changes */
  sliceDrift: { previousSize: number; newSize: number; reason: string };
  /** Emitted when a flush occurs */
  flush: { sliceSize: number; bytes: number; delayMs: number };
  /** Emitted when backpressure is detected */
  backpressure: { queuedBytes: number; sliceSize: number };
  /** Emitted when drain occurs */
  drain: { sliceSize: number };
}

/**
 * Simple token bucket rate limiter
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly rateBytes: number,
    private readonly burstBytes: number,
  ) {
    this.tokens = burstBytes;
    this.lastRefill = Date.now();
  }

  /**
   * Reserve bytes from the bucket.
   * Returns the delay in ms before the bytes can be sent (0 if immediate).
   */
  reserve(bytes: number): number {
    this.refill();

    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return 0;
    }

    // Calculate wait time until enough tokens are available
    const deficit = bytes - this.tokens;
    const waitMs = (deficit / this.rateBytes) * 1000;

    // Deduct what we can now, rest will be refilled
    this.tokens = 0;

    return Math.ceil(waitMs);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillAmount = (elapsed / 1000) * this.rateBytes;

    this.tokens = Math.min(this.burstBytes, this.tokens + refillAmount);
    this.lastRefill = now;
  }

  /**
   * Get current token count (for diagnostics)
   */
  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * FlowController manages adaptive batch sizing per connection
 */
export class FlowController extends TypedEventEmitter<FlowControllerEvents> {
  private sliceSize: number;
  private readonly bucket: TokenBucket;
  private readonly policy: SessionFlowPolicy;
  private flushing = false;
  private flushPromise: Promise<void> | null = null;
  private forceFlushQueued = false;
  private backpressureCount = 0;

  // Diagnostics
  private totalFlushes = 0;
  private totalBytes = 0;
  private sliceHistory: Array<{ timestamp: number; size: number }> = [];

  constructor(policy: SessionFlowPolicy) {
    super();
    this.policy = policy;

    // Initialize slice size as half of preferred, clamped to bounds
    this.sliceSize = this.clamp(
      Math.round(policy.preferredBatchSize / 2),
      policy.minSlice,
      this.getEffectiveMaxSlice(),
    );

    // Initialize token bucket for rate limiting
    this.bucket = new TokenBucket(
      policy.rateBytesPerSec,
      policy.burstBudgetBytes,
    );

    this.recordSliceChange("init");
  }

  async snapshot(
    framer?: BatchFramer,
    options?: { reset?: boolean },
  ): Promise<FlowControllerDiagnostics> {
    if (framer) {
      await this.flushPending(framer);
    }
    if (this.flushPromise) {
      await this.flushPromise;
    }
    const diagnostics = this.getDiagnostics();
    if (options?.reset) {
      this.resetDiagnostics();
    }
    return diagnostics;
  }

  /**
   * Get effective max slice (clamped for TS peers)
   */
  private getEffectiveMaxSlice(): number {
    if (!this.policy.peerIsNative) {
      return Math.min(this.policy.maxSlice, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
    }
    return this.policy.maxSlice;
  }

  /**
   * Handle backpressure event - contract slice size
   */
  onBackpressure(queuedBytes: number): void {
    const previousSize = this.sliceSize;
    this.sliceSize = Math.max(
      this.policy.minSlice,
      Math.floor(this.sliceSize / 2),
    );
    this.backpressureCount += 1;

    if (previousSize !== this.sliceSize) {
      this.recordSliceChange("backpressure");
      this.emit("sliceDrift", {
        previousSize,
        newSize: this.sliceSize,
        reason: "backpressure",
      });
    }

    this.emit("backpressure", { queuedBytes, sliceSize: this.sliceSize });
  }

  /**
   * Handle drain event - expand slice size
   */
  onDrain(): void {
    const previousSize = this.sliceSize;
    const maxSlice = this.getEffectiveMaxSlice();
    this.sliceSize = Math.min(
      maxSlice,
      this.sliceSize + FLOW_DEFAULTS.DRIFT_STEP,
    );

    if (previousSize !== this.sliceSize) {
      this.recordSliceChange("drain");
      this.emit("sliceDrift", {
        previousSize,
        newSize: this.sliceSize,
        reason: "drain",
      });
    }

    this.emit("drain", { sliceSize: this.sliceSize });
  }

  /**
   * Enqueue a payload for batched sending
   */
  async enqueue(payload: Buffer, framer: BatchFramer): Promise<void> {
    framer.encodeToBatch(payload);
    const pending = this.scheduleFlush(framer, false);
    if (pending) await pending;
  }

  async flushPending(framer: BatchFramer): Promise<void> {
    if (framer.pendingBatchSize === 0 || !framer.canFlush) return;
    const pending = this.scheduleFlush(framer, true);
    if (pending) await pending;
  }

  /**
   * Flush the current batch with rate limiting
   */
  async flush(framer: BatchFramer): Promise<void> {
    // Note: flushing state is managed by scheduleFlush, not here
    const projectedBytes = framer.pendingBatchBytes;
    const delayMs = this.bucket.reserve(projectedBytes);

    if (delayMs > 0) {
      await this.delay(delayMs);
    }

    await framer.flushBatch();

    this.totalFlushes++;
    this.totalBytes += projectedBytes;

    this.emit("flush", {
      sliceSize: this.sliceSize,
      bytes: projectedBytes,
      delayMs,
    });
  }

  /**
   * Get current slice size
   */
  get currentSliceSize(): number {
    return this.sliceSize;
  }

  /**
   * Get diagnostics snapshot
   */
  getDiagnostics(): FlowControllerDiagnostics {
    return {
      currentSliceSize: this.sliceSize,
      totalFlushes: this.totalFlushes,
      totalBytes: this.totalBytes,
      backpressureEvents: this.backpressureCount,
      availableTokens: this.bucket.availableTokens,
      policy: {
        coherence: this.policy.coherence,
        entropyVelocity: this.policy.entropyVelocity,
        preferredBatchSize: this.policy.preferredBatchSize,
        peerIsNative: this.policy.peerIsNative,
      },
      sliceHistory: this.sliceHistory.slice(-10), // Last 10 changes
    };
  }

  private resetDiagnostics(): void {
    this.totalFlushes = 0;
    this.totalBytes = 0;
    this.backpressureCount = 0;
    this.sliceHistory = [
      {
        timestamp: Date.now(),
        size: this.sliceSize,
      },
    ];
  }

  /**
   * Record slice size change for diagnostics
   */
  private recordSliceChange(_reason: string): void {
    this.sliceHistory.push({
      timestamp: Date.now(),
      size: this.sliceSize,
    });

    // Keep only last 100 entries
    if (this.sliceHistory.length > 100) {
      this.sliceHistory.shift();
    }
  }

  /**
   * Clamp value to bounds
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Async delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private scheduleFlush(
    framer: BatchFramer,
    force: boolean,
  ): Promise<void> | void {
    // If framer can't flush (no socket), don't schedule
    if (!framer.canFlush) {
      return;
    }

    if (!force && framer.pendingBatchSize < this.sliceSize) {
      return;
    }

    if (this.flushing) {
      if (force) {
        this.forceFlushQueued = true;
      }
      return this.flushPromise ?? Promise.resolve();
    }

    this.flushing = true;
    this.flushPromise = (async () => {
      try {
        await this.flush(framer);
      } finally {
        this.flushing = false;
        this.flushPromise = null;
        const shouldForce = this.forceFlushQueued;
        this.forceFlushQueued = false;
        // Only continue flushing if framer still has a connected socket
        if (framer.canFlush && (framer.pendingBatchSize >= this.sliceSize || shouldForce)) {
          await this.scheduleFlush(framer, shouldForce);
        }
      }
    })();

    return this.flushPromise;
  }
}

/**
 * Diagnostics snapshot for FlowController
 */
export interface FlowControllerDiagnostics {
  currentSliceSize: number;
  totalFlushes: number;
  totalBytes: number;
  backpressureEvents: number;
  availableTokens: number;
  policy: {
    coherence: number;
    entropyVelocity: number;
    preferredBatchSize: number;
    peerIsNative: boolean;
  };
  sliceHistory: Array<{ timestamp: number; size: number }>;
}

/**
 * Map entropy velocity indicator to numeric value (0..1)
 */
function entropyVelocityToNumeric(velocity: EntropyVelocity): number {
  switch (velocity) {
    case "low":
      return 0.1;
    case "stable":
      return 0.3;
    case "rising":
      return 0.6;
    case "spiking":
      return 1.0;
  }
}

/**
 * Map coherence level to numeric value (0..1)
 */
function coherenceLevelToNumeric(coherence: CoherenceLevel): number {
  switch (coherence) {
    case "high":
      return 0.9;
    case "medium":
      return 0.7;
    case "low":
      return 0.4;
    case "chaos":
      return 0.1;
  }
}

/**
 * Derive SessionFlowPolicy from entropy metrics and peer info
 */
export function deriveSessionFlowPolicy(
  metrics: EntropyMetrics,
  options?: {
    peerIsNative?: boolean;
    rateBytesPerSec?: number;
    burstBudgetBytes?: number;
  },
): SessionFlowPolicy {
  const policy = deriveEntropyPolicy(metrics);
  const peerIsNative = options?.peerIsNative ?? false;

  // Compute numeric coherence from metrics
  const coherence = metrics.coherence
    ? coherenceLevelToNumeric(metrics.coherence)
    : (metrics.negIndex ?? 0.5);

  // Compute numeric entropy velocity
  const entropyVelocity = metrics.entropyVelocity
    ? entropyVelocityToNumeric(metrics.entropyVelocity)
    : 0.3;

  // Derive rate based on trust level
  const baseRate =
    options?.rateBytesPerSec ?? FLOW_DEFAULTS.DEFAULT_RATE_BYTES_PER_SEC;
  const rateBytesPerSec = Math.round(baseRate * policy.trustLevel);

  // Derive burst budget based on trust level
  const baseBurst =
    options?.burstBudgetBytes ?? FLOW_DEFAULTS.DEFAULT_BURST_BYTES;
  const burstBudgetBytes = Math.round(baseBurst * policy.trustLevel);

  // Determine max slice - clamp for TS peers
  let maxSlice = policy.batchSize;
  if (!peerIsNative) {
    maxSlice = Math.min(maxSlice, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
  }

  return {
    coherence,
    entropyVelocity,
    preferredBatchSize: policy.batchSize,
    minSlice: FLOW_DEFAULTS.MIN_SLICE,
    maxSlice,
    burstBudgetBytes,
    rateBytesPerSec,
    peerIsNative,
  };
}

/**
 * Create a FlowController from entropy metrics
 */
export function createFlowController(
  metrics: EntropyMetrics,
  options?: {
    peerIsNative?: boolean;
    rateBytesPerSec?: number;
    burstBudgetBytes?: number;
  },
): FlowController {
  const policy = deriveSessionFlowPolicy(metrics, options);
  return new FlowController(policy);
}
