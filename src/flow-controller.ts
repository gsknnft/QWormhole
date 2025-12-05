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

import {
  performance,
  monitorEventLoopDelay,
  PerformanceObserver,
} from "node:perf_hooks";
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
  /** Negentropic index from handshake */
  nIndex?: number;
  /** Burst budget in bytes (from entropy/token bucket policy) */
  burstBudgetBytes: number;
  /** Rate limit in bytes per second */
  rateBytesPerSec: number;
  /** Whether peer is native (allows larger batches) */
  peerIsNative: boolean;
}

export type AdaptiveMode = "off" | "guarded" | "aggressive";

export interface PolicyBounds {
  minSlice: number;
  maxSlice: number;
}

export interface PeerProfile {
  isNative: boolean;
  nIndex: number;
  coherence: number;
}

interface AdaptiveState {
  sliceSize: number;
  mode: AdaptiveMode;
  bounds: PolicyBounds;
  flushIntervalAvgMs: number;
  bytesPerFlushAvg: number;
  eluIdleRatioAvg: number;
  gcPauseMaxMs: number;
  backpressureCount: number;
  lastFlushAt: number;
}

interface AdaptiveInternals {
  state: AdaptiveState;
  peer: PeerProfile;
  config: AdaptiveConfig;
  flushCounter: number;
  cooldownRemaining: number;
}

interface AdaptiveConfig {
  mode: AdaptiveMode;
  idleTarget: number;
  gcBudgetMs: number;
  sampleEvery: number;
  adaptEvery: number;
  driftStep: number;
  lerpFactor: number;
  backpressureCooldown: number;
}

interface FlowControllerInitOptions {
  adaptiveMode?: AdaptiveMode;
  peerProfile?: PeerProfile;
  bounds?: PolicyBounds;
  adaptiveConfig?: Partial<AdaptiveConfig>;
  forceSliceSize?: number;
  forceRateBytesPerSec?: number;
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
  /** TS peer max slice clamp (to reduce GC pressure) - low trust */
  TS_PEER_MAX_SLICE: 16,
  /** TS peer max slice for high-trust peers (negIndex >= 0.85) */
  TS_PEER_HIGH_TRUST_MAX_SLICE: 32,
  /** Upper bound on token bucket induced delay */
  MAX_RESERVE_DELAY_MS: 200,
} as const;

const ADAPTIVE_DEFAULTS: AdaptiveConfig = {
  mode: "off",
  idleTarget: 0.2,
  gcBudgetMs: 4,
  sampleEvery: 64,
  adaptEvery: 64,
  driftStep: FLOW_DEFAULTS.DRIFT_STEP,
  lerpFactor: 0.25,
  backpressureCooldown: 64,
};

const loopDelayMonitor =
  typeof monitorEventLoopDelay === "function"
    ? monitorEventLoopDelay({ resolution: 20 })
    : undefined;
if (loopDelayMonitor) {
  loopDelayMonitor.enable();
}

let recentGcPauseMs = 0;
if (typeof PerformanceObserver !== "undefined") {
  try {
    const gcObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        recentGcPauseMs = Math.max(recentGcPauseMs, entry.duration);
      }
    });
    gcObserver.observe({ entryTypes: ["gc"], buffered: false });
  } catch {
    // No-op if GC observer is unavailable
  }
}

function readEventLoopIdleRatio(): number {
  if (!loopDelayMonitor) return 0;
  const max = loopDelayMonitor.max || 0;
  if (max <= 0) return 0;
  const mean = loopDelayMonitor.mean || 0;
  const normalized = Math.min(mean / max, 1);
  return Math.max(0, 1 - normalized);
}

function readRecentGcPause(): number {
  const value = recentGcPauseMs;
  recentGcPauseMs *= 0.5;
  return value;
}

function tuneAdaptiveConfig(config: AdaptiveConfig, peer: PeerProfile): void {
  if (peer.isNative) {
    config.sampleEvery = Math.min(config.sampleEvery, 16);
    config.adaptEvery = Math.min(config.adaptEvery, 16);
    config.driftStep = Math.max(config.driftStep, 8);
    config.idleTarget = Math.min(config.idleTarget, 0.15);
    return;
  }
  if (peer.nIndex >= 0.85) {
    config.sampleEvery = Math.min(config.sampleEvery, 24);
    config.adaptEvery = Math.min(config.adaptEvery, 24);
    config.driftStep = Math.max(config.driftStep, 4);
    return;
  }
  config.sampleEvery = Math.min(config.sampleEvery, 48);
  config.adaptEvery = Math.min(config.adaptEvery, 48);
}

function ewma(prev: number, sample: number, alpha = 0.2): number {
  if (!Number.isFinite(prev) || prev === 0) {
    return sample;
  }
  return prev * (1 - alpha) + sample * alpha;
}

function lerpInt(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function resolveAdaptiveMode(preferred?: AdaptiveMode | string): AdaptiveMode {
  if (!preferred) return "off";
  const value = `${preferred}`.toLowerCase();
  if (value === "auto") return "guarded";
  if (value === "guarded" || value === "aggressive" || value === "off") {
    return value as AdaptiveMode;
  }
  return "off";
}

function envAdaptiveMode(): string | undefined {
  const value = process.env.QWORMHOLE_ADAPTIVE_SLICES;
  if (!value) return undefined;
  return value;
}

function defaultAdaptiveModeForPeer(peer: PeerProfile): AdaptiveMode {
  if (peer.isNative) return "aggressive";
  if (peer.nIndex >= 0.8 || peer.coherence >= 0.75) return "guarded";
  return "guarded";
}

function parseForceSliceValue(
  value?: string | number | null,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric =
    typeof value === "string"
      ? Number.parseInt(value, 10)
      : typeof value === "number"
        ? value
        : undefined;
  if (numeric === undefined || Number.isNaN(numeric)) {
    return undefined;
  }
  const normalized = Math.floor(numeric);
  return normalized > 0 ? normalized : undefined;
}

function envForceSlice(): number | undefined {
  return parseForceSliceValue(process.env.QWORMHOLE_FORCE_SLICE);
}

function parseForceRateValue(
  value?: string | number | null,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric =
    typeof value === "string"
      ? Number.parseFloat(value)
      : typeof value === "number"
        ? value
        : undefined;
  if (numeric === undefined || !Number.isFinite(numeric)) {
    return undefined;
  }
  return numeric > 0 ? numeric : undefined;
}

function envForceRateBytes(): number | undefined {
  return parseForceRateValue(process.env.QWORMHOLE_FORCE_RATE_BYTES);
}

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
  private readonly forceSliceSize?: number;
  private readonly effectiveRateBytesPerSec: number;
  private flushing = false;
  private flushPromise: Promise<void> | null = null;
  private forceFlushQueued = false;
  private backpressureCount = 0;
  private adaptive?: AdaptiveInternals;

  // Diagnostics
  private totalFlushes = 0;
  private totalBytes = 0;
  private sliceHistory: Array<{ timestamp: number; size: number }> = [];

  constructor(
    policy: SessionFlowPolicy,
    initOptions?: FlowControllerInitOptions,
  ) {
    super();
    this.policy = policy;

    const peerProfile: PeerProfile =
      initOptions?.peerProfile ?? {
        isNative: policy.peerIsNative,
        nIndex: policy.nIndex ?? policy.coherence ?? 0.5,
        coherence: policy.coherence,
      };

    const forcedRateBytes = parseForceRateValue(
      initOptions?.forceRateBytesPerSec ?? envForceRateBytes(),
    );
    this.effectiveRateBytesPerSec = forcedRateBytes ?? policy.rateBytesPerSec;

    // Initialize slice size as half of preferred, clamped to bounds
    const preferredSlice = this.clamp(
      Math.round(policy.preferredBatchSize / 2),
      policy.minSlice,
      this.getEffectiveMaxSlice(),
    );
    const forcedSliceResolved = parseForceSliceValue(
      initOptions?.forceSliceSize ?? envForceSlice(),
    );
    if (forcedSliceResolved !== undefined) {
      this.forceSliceSize = this.clamp(
        forcedSliceResolved,
        policy.minSlice,
        this.getEffectiveMaxSlice(),
      );
      this.sliceSize = this.forceSliceSize;
    } else {
      this.sliceSize = preferredSlice;
    }

    // Initialize token bucket for rate limiting
    this.bucket = new TokenBucket(
      this.effectiveRateBytesPerSec,
      policy.burstBudgetBytes,
    );

    const adaptivePreference =
      initOptions?.adaptiveMode ??
      envAdaptiveMode() ??
      defaultAdaptiveModeForPeer(peerProfile);
    const adaptiveMode = resolveAdaptiveMode(adaptivePreference);
    if (adaptiveMode !== "off") {
      const bounds: PolicyBounds = initOptions?.bounds ?? {
        minSlice: policy.minSlice,
        maxSlice: this.getEffectiveMaxSlice(),
      };
      const config: AdaptiveConfig = {
        ...ADAPTIVE_DEFAULTS,
        ...initOptions?.adaptiveConfig,
        mode: adaptiveMode,
      };
      tuneAdaptiveConfig(config, peerProfile);
      this.adaptive = {
        state: {
          sliceSize: this.sliceSize,
          mode: adaptiveMode,
          bounds,
          flushIntervalAvgMs: 0,
          bytesPerFlushAvg: 0,
          eluIdleRatioAvg: 1,
          gcPauseMaxMs: 0,
          backpressureCount: 0,
          lastFlushAt: performance.now(),
        },
        peer: peerProfile,
        config,
        flushCounter: 0,
        cooldownRemaining: 0,
      };
    }

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
   * Get effective max slice (clamped for TS peers, relaxed for high-trust)
   */
  private getEffectiveMaxSlice(): number {
    if (!this.policy.peerIsNative) {
      // High-trust TS peers (negIndex >= 0.85) get higher slice cap
      const nIndex = this.policy.nIndex ?? this.policy.coherence ?? 0.5;
      if (nIndex >= 0.85) {
        return Math.min(this.policy.maxSlice, FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE);
      }
      return Math.min(this.policy.maxSlice, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
    }
    return this.policy.maxSlice;
  }

  /**
   * Handle backpressure event - contract slice size
   */
  onBackpressure(queuedBytes: number): void {
    this.backpressureCount += 1;
    if (this.adaptive) {
      this.adaptive.state.backpressureCount += 1;
      this.adaptive.cooldownRemaining = Math.max(
        this.adaptive.cooldownRemaining,
        this.adaptive.config.backpressureCooldown,
      );
    }

    if (this.forceSliceSize !== undefined) {
      this.sliceSize = this.forceSliceSize;
      this.emit("backpressure", { queuedBytes, sliceSize: this.sliceSize });
      return;
    }

    const previousSize = this.sliceSize;
    this.sliceSize = Math.max(
      this.policy.minSlice,
      Math.floor(this.sliceSize / 2),
    );

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
    const maxSlice = this.getEffectiveMaxSlice();
    if (this.adaptive && this.adaptive.state.backpressureCount > 0) {
      this.adaptive.state.backpressureCount = Math.max(
        0,
        this.adaptive.state.backpressureCount - 1,
      );
    }

    if (this.forceSliceSize !== undefined) {
      this.sliceSize = this.forceSliceSize;
      this.emit("drain", { sliceSize: this.sliceSize });
      return;
    }

    const previousSize = this.sliceSize;
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
    const frameCount = framer.pendingBatchSize;
    const projectedBytes = framer.pendingBatchBytes;
    const delayMs = this.bucket.reserve(projectedBytes);

    if (delayMs > 0) {
      await this.delay(delayMs);
    }

    await framer.flushBatch();

    this.handlePostFlushTelemetry(frameCount, projectedBytes, delayMs);

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
      forceSliceSize: this.forceSliceSize,
      effectiveRateBytesPerSec: this.effectiveRateBytesPerSec,
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
      adaptive: this.adaptive
        ? {
            mode: this.adaptive.state.mode,
            sliceSize: this.adaptive.state.sliceSize,
            flushIntervalAvgMs: this.adaptive.state.flushIntervalAvgMs,
            bytesPerFlushAvg: this.adaptive.state.bytesPerFlushAvg,
            eluIdleRatioAvg: this.adaptive.state.eluIdleRatioAvg,
            gcPauseMaxMs: this.adaptive.state.gcPauseMaxMs,
          }
        : undefined,
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

  private handlePostFlushTelemetry(
    frameCount: number,
    bytes: number,
    _reserveDelayMs: number,
  ): void {
    if (!this.adaptive || frameCount <= 0 || bytes <= 0) return;
    const { state, config } = this.adaptive;
    const now = performance.now();
    const dt = state.lastFlushAt ? now - state.lastFlushAt : 0;
    state.lastFlushAt = now;
    if (dt > 0) {
      state.flushIntervalAvgMs = ewma(state.flushIntervalAvgMs, dt);
    }
    state.bytesPerFlushAvg = ewma(state.bytesPerFlushAvg, bytes);
    state.sliceSize = this.sliceSize;
    this.adaptive.flushCounter += 1;

    if (this.adaptive.flushCounter % config.sampleEvery === 0) {
      state.eluIdleRatioAvg = ewma(
        state.eluIdleRatioAvg,
        readEventLoopIdleRatio(),
      );
      state.gcPauseMaxMs = Math.max(
        state.gcPauseMaxMs * 0.9,
        readRecentGcPause(),
      );
      if (state.backpressureCount > 0) {
        state.backpressureCount = Math.max(0, state.backpressureCount - 1);
      }
    }

    if (this.adaptive.flushCounter % config.adaptEvery === 0) {
      this.applyAdaptiveSlice();
    }
  }

  private applyAdaptiveSlice(): void {
    if (!this.adaptive) return;
    if (this.forceSliceSize !== undefined) {
      this.sliceSize = this.forceSliceSize;
      this.adaptive.state.sliceSize = this.forceSliceSize;
      return;
    }
    const { state, config, peer } = this.adaptive;
    const bounds = state.bounds;
    const peerMax =
      peer.isNative || peer.nIndex >= 0.85
        ? bounds.maxSlice
        : Math.min(bounds.maxSlice, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);

    const idleOK = state.eluIdleRatioAvg >= config.idleTarget;
    const gcOK = state.gcPauseMaxMs <= config.gcBudgetMs;
    const cooldownActive = this.adaptive.cooldownRemaining > 0;
    const bpOK = state.backpressureCount === 0 && !cooldownActive;

    const expansionBase =
      peer.isNative || peer.nIndex >= 0.9
        ? config.driftStep * 2
        : config.driftStep;
    let expansionStep = expansionBase;
    if (peer.nIndex >= 0.9 || peer.coherence >= 0.85) {
      expansionStep = Math.max(expansionStep, Math.ceil(peerMax / 3));
    } else if (peer.nIndex >= 0.8) {
      expansionStep = Math.max(expansionStep, Math.ceil(peerMax / 4));
    }
    if (peer.isNative) {
      expansionStep = Math.max(expansionStep, Math.ceil(peerMax / 4));
    }

    const contractionBase =
      !gcOK && state.gcPauseMaxMs > config.gcBudgetMs * 1.5
        ? config.driftStep * 2
        : config.driftStep;

    let desired = this.sliceSize;
    if (idleOK && gcOK && bpOK) {
      desired = Math.min(peerMax, this.sliceSize + expansionStep);
    } else {
      desired = Math.max(bounds.minSlice, this.sliceSize - contractionBase);
    }

    if (cooldownActive) {
      desired = bounds.minSlice;
      this.adaptive.cooldownRemaining = Math.max(
        0,
        this.adaptive.cooldownRemaining - config.adaptEvery,
      );
    }

    desired = this.clamp(desired, bounds.minSlice, peerMax);

    let nextSlice = desired;
    if (state.mode === "guarded") {
      nextSlice = lerpInt(this.sliceSize, desired, config.lerpFactor);
    }

    if (nextSlice !== this.sliceSize) {
      const previousSize = this.sliceSize;
      this.sliceSize = nextSlice;
      state.sliceSize = nextSlice;
      this.recordSliceChange("adaptive");
      this.emit("sliceDrift", {
        previousSize,
        newSize: nextSlice,
        reason: "adaptive",
      });
    }

    state.backpressureCount = 0;
    state.gcPauseMaxMs *= 0.9;
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
        if (
          framer.canFlush &&
          (framer.pendingBatchSize >= this.sliceSize || shouldForce)
        ) {
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
  forceSliceSize?: number;
  effectiveRateBytesPerSec: number;
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
  adaptive?: {
    mode: AdaptiveMode;
    sliceSize: number;
    flushIntervalAvgMs: number;
    bytesPerFlushAvg: number;
    eluIdleRatioAvg: number;
    gcPauseMaxMs: number;
  };
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

  const nIndex = metrics.negIndex ?? coherence;

  // Derive rate based on trust level
  const baseRate =
    options?.rateBytesPerSec ?? FLOW_DEFAULTS.DEFAULT_RATE_BYTES_PER_SEC;
  const rateBytesPerSec = Math.round(baseRate * policy.trustLevel);

  // Derive burst budget based on trust level
  const baseBurst =
    options?.burstBudgetBytes ?? FLOW_DEFAULTS.DEFAULT_BURST_BYTES;
  const burstBudgetBytes = Math.round(baseBurst * policy.trustLevel);

  // Determine max slice - clamp for TS peers, relaxed for high-trust
  let maxSlice = policy.batchSize;
  if (!peerIsNative) {
    // High-trust TS peers (negIndex >= 0.85) get higher slice cap
    if (nIndex >= 0.85) {
      maxSlice = Math.min(maxSlice, FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE);
    } else {
      maxSlice = Math.min(maxSlice, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
    }
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
    nIndex,
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
    adaptiveMode?: AdaptiveMode;
    forceSliceSize?: number;
    forceRateBytesPerSec?: number;
  },
): FlowController {
  const policy = deriveSessionFlowPolicy(metrics, options);
  const peerProfile: PeerProfile = {
    isNative: policy.peerIsNative,
    nIndex: policy.nIndex ?? metrics.negIndex ?? 0.5,
    coherence: policy.coherence,
  };
  const envMode = envAdaptiveMode();
  const adaptiveOverride =
    options?.adaptiveMode ??
    (envMode ? resolveAdaptiveMode(envMode) : undefined);
  return new FlowController(policy, {
    adaptiveMode: adaptiveOverride,
    peerProfile,
    forceSliceSize: options?.forceSliceSize,
    forceRateBytesPerSec: options?.forceRateBytesPerSec,
  });
}
