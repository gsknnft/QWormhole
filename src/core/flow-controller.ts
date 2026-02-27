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
} from "../handshake/entropy-policy";
import { deriveEntropyPolicy } from "../handshake/entropy-policy";
import { TypedEventEmitter } from "../utils/typedEmitter";
import {
  NegentropicDiagnostics,
  type NegentropicSnapshot,
} from "../utils/negentropic-diagnostics";
import { TransportMetrics } from "src/types/TransportMetrics";
import { CoherenceController } from "./CoherenceController";
import { TokenBucket } from "./qos";
import { CoherenceLevel, EntropyVelocity } from "src/schema/scp";
import type { TransportGovernancePolicy } from "./transport-governance-policy";
import {
  computeTransportCoherence,
  type TransportCoherenceSnapshot,
} from "./transport-coherence";

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
  flushBytes?: number;
  reserveDelayMs?: number;
  elu?: {
    lastIdleRatio: number;
    mean: number;
    max: number;
  };
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
  fastPath?: boolean;
}

/**
 * Default policy constants
 */
export const FLOW_DEFAULTS = {
  /** Minimum slice size for micro-batching */
  MIN_SLICE: 4,
  /** Maximum slice size for macro-batching */
  MAX_SLICE: 64,
  /** Default burst budget (512 KB) */
  DEFAULT_BURST_BYTES: 512 * 1024,
  /** Default rate limit (16 MB/s) */
  DEFAULT_RATE_BYTES_PER_SEC: 16 * 1024 * 1024,
  /** Drift step when adjusting slice size */
  DRIFT_STEP: 2,
  /** TS peer max slice clamp (to reduce GC pressure) - low trust */
  TS_PEER_MAX_SLICE: 24,
  /** TS peer max slice for high-trust peers (negIndex >= 0.85) */
  TS_PEER_HIGH_TRUST_MAX_SLICE: 64,
  /** Native-peer slice floor for TS senders under healthy conditions */
  NATIVE_PEER_MIN_SLICE: 11,
  /** Native-peer framer cap to keep writev batches dense */
  NATIVE_PEER_MAX_BUFFERS: 112,
  /** Native-peer framer byte budget */
  NATIVE_PEER_MAX_BYTES: 176 * 1024,
  /** Native-peer framer minimum bytes target */
  NATIVE_PEER_MIN_BYTES: 28 * 1024,
  /** TS framer caps to keep batching in the micro-batch envelope */
  TS_FRAMER_MAX_BUFFERS: (() => {
    const raw = process.env.QWORMHOLE_TS_FRAMER_MAX_BUFFERS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 32;
  })(),
  /** TS framer cap to avoid large buffer residency (bytes) */
  TS_FRAMER_MAX_BYTES: (() => {
    const raw = process.env.QWORMHOLE_TS_FRAMER_MAX_BYTES;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 32 * 1024;
  })(),
  /** TS framer minimum bytes target for writev */
  TS_FRAMER_MIN_BYTES: (() => {
    const raw = process.env.QWORMHOLE_TS_FRAMER_MIN_BYTES;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8 * 1024;
  })(),
  /** TS fast-path caps (bench throughput sanity) */
  TS_FAST_MAX_BUFFERS: (() => {
    const raw = process.env.QWORMHOLE_TS_FAST_MAX_BUFFERS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 64;
  })(),
  TS_FAST_MAX_BYTES: (() => {
    const raw = process.env.QWORMHOLE_TS_FAST_MAX_BYTES;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 96 * 1024;
  })(),
  /** Upper bound on token bucket induced delay */
  MAX_RESERVE_DELAY_MS: 200,
} as const;

type NativePeerTuneProfile = "stable" | "balanced" | "throughput";

const NATIVE_PEER_TUNE: NativePeerTuneProfile = (() => {
  const raw = (process.env.QWORMHOLE_NATIVE_PEER_TUNE ?? "balanced")
    .trim()
    .toLowerCase();
  if (raw === "stable" || raw === "balanced" || raw === "throughput") {
    return raw;
  }
  return "balanced";
})();

const nativePeerContractionRatio = (): number => {
  if (NATIVE_PEER_TUNE === "stable") return 0.88;
  if (NATIVE_PEER_TUNE === "throughput") return 0.9;
  return 0.89;
};

const nativePeerExpansionBufferRatio = (): number => {
  if (NATIVE_PEER_TUNE === "stable") return 1.1;
  if (NATIVE_PEER_TUNE === "throughput") return 1.2;
  return 1.15;
};

const nativePeerExpansionByteRatio = (): number => {
  if (NATIVE_PEER_TUNE === "stable") return 1.06;
  if (NATIVE_PEER_TUNE === "throughput") return 1.1;
  return 1.08;
};

const ADAPTIVE_DEFAULTS: AdaptiveConfig = {
  mode: "off",
  idleTarget: 0.15,
  gcBudgetMs: 4,
  sampleEvery: 32,
  adaptEvery: 32,
  driftStep: 4,
  lerpFactor: 0.25,
  backpressureCooldown: 64,
};

type LoopDelayHistogram =
  ReturnType<typeof monitorEventLoopDelay> | undefined;

const activeLoopMonitors = new Set<LoopDelayHistogram>();

const trackMonitor = (hist?: LoopDelayHistogram): void => {
  if (hist) activeLoopMonitors.add(hist);
};

const disableMonitors = (): void => {
  for (const hist of activeLoopMonitors) {
    try {
      hist?.disable();
    } catch {
      // ignore
    }
  }

  activeLoopMonitors.clear();
};

const loopDelayMonitor: LoopDelayHistogram =
  typeof monitorEventLoopDelay === "function"
    ? monitorEventLoopDelay({ resolution: 20 })
    : undefined;
if (loopDelayMonitor) {
  loopDelayMonitor.enable();
  trackMonitor(loopDelayMonitor);
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

const TS_FLUSH_INTERVAL_MS = (() => {
  const raw = process.env.QWORMHOLE_TS_FLUSH_INTERVAL_MS;
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
})();

const TRANSPORT_COHERENCE_ENABLED =
  process.env.QWORMHOLE_TRANSPORT_COHERENCE === "1";

function tuneAdaptiveConfig(config: AdaptiveConfig, peer: PeerProfile): void {
  if (peer.isNative) {
    config.sampleEvery = Math.min(config.sampleEvery, 8);
    config.adaptEvery = Math.min(config.adaptEvery, 8);
    config.driftStep = Math.max(config.driftStep, 10);
    config.idleTarget = Math.min(config.idleTarget, 0.1);
    return;
  }
  if (peer.nIndex >= 0.9) {
    config.sampleEvery = Math.min(config.sampleEvery, 24);
    config.adaptEvery = Math.min(config.adaptEvery, 24);
    config.driftStep = Math.max(config.driftStep, 6);
    config.idleTarget = Math.min(config.idleTarget, 0.12);
    return;
  }
  config.sampleEvery = Math.min(config.sampleEvery, 32);
  config.adaptEvery = Math.min(config.adaptEvery, 32);
  config.driftStep = Math.max(config.driftStep, 4);
  config.idleTarget = Math.min(config.idleTarget, 0.18);
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
 * FlowController manages adaptive batch sizing per connection
 */
export class FlowController extends TypedEventEmitter<FlowControllerEvents> {
  private sliceSize: number;
  private readonly bucket: TokenBucket;
  private readonly policy: SessionFlowPolicy;
  private readonly maxSliceBound: number;
  private readonly forceSliceSize?: number;
  private externalSliceSize?: number;
  private readonly effectiveRateBytesPerSec: number;
  private readonly fastPath: boolean;
  private flushing = false;
  public runtimeMetrics: Record<string, () => number> = {};
  private flushPromise: Promise<void> | null = null;
  private forceFlushQueued = false;
  private backpressureCount = 0;
  private adaptive?: AdaptiveInternals;
  private readonly negDiagnostics = new NegentropicDiagnostics();
  private lastEluBaseline?: ReturnType<typeof performance.eventLoopUtilization>;
  private governancePolicy?: TransportGovernancePolicy;

  // Diagnostics
  private totalFlushes = 0;
  private totalBytes = 0;
  private sliceHistory: Array<{ timestamp: number; size: number }> = [];
  private flushHistory: Array<{ timestamp: number; bytes: number; frames: number }> = [];
  private backpressureHistory: number[] = [];
  private flushHistoryCursor = 0;
  private backpressureHistoryCursor = 0;

  constructor(
    policy: SessionFlowPolicy,
    initOptions?: FlowControllerInitOptions,
  ) {
    super();
    this.policy = policy;
    this.maxSliceBound = initOptions?.bounds?.maxSlice ?? policy.maxSlice;

    const peerProfile: PeerProfile = initOptions?.peerProfile ?? {
      isNative: policy.peerIsNative,
      nIndex: policy.nIndex ?? policy.coherence ?? 0.5,
      coherence: policy.coherence,
    };

    const forcedRateBytes = parseForceRateValue(
      initOptions?.forceRateBytesPerSec ?? envForceRateBytes(),
    );
    this.effectiveRateBytesPerSec = forcedRateBytes ?? policy.rateBytesPerSec;
    this.fastPath = initOptions?.fastPath ?? false;
    this.runtimeMetrics.getELU = () => this.readEventLoopUtilization();
    // Initialize slice size as half of preferred, clamped to bounds
    const preferredSlice = this.clamp(
      Math.round(
        policy.preferredBatchSize * (policy.peerIsNative ? 0.75 : 0.5),
      ),
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
        return Math.min(this.maxSliceBound, FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE);
      }
      return Math.min(this.maxSliceBound, FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
    }
    return this.maxSliceBound;
  }

  /**
   * Handle backpressure event - contract slice size
   */
  onBackpressure(queuedBytes: number): void {
    this.backpressureCount += 1;
    if (TRANSPORT_COHERENCE_ENABLED) {
      this.recordBackpressureSample(Date.now());
    }
    if (this.adaptive) {
      this.adaptive.state.backpressureCount += 1;
      this.adaptive.cooldownRemaining = Math.max(
        this.adaptive.cooldownRemaining,
        this.adaptive.config.backpressureCooldown,
      );
    }

    const forced = this.resolveForcedSlice();
    if (forced !== undefined) {
      this.sliceSize = forced;
      this.emit("backpressure", { queuedBytes, sliceSize: this.sliceSize });
      return;
    }

    const previousSize = this.sliceSize;
    const contractionRatio = this.policy.peerIsNative ? 0.85 : 0.85;
    const minSlice = this.policy.peerIsNative
      ? Math.max(this.policy.minSlice, FLOW_DEFAULTS.NATIVE_PEER_MIN_SLICE)
      : this.policy.minSlice;
    this.sliceSize = Math.max(
      minSlice,
      Math.floor(this.sliceSize * contractionRatio),
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
    if (this.adaptive && this.adaptive.state.backpressureCount > 0) {
      this.adaptive.state.backpressureCount = Math.max(
        0,
        this.adaptive.state.backpressureCount - 1,
      );
    }

    const forced = this.resolveForcedSlice();
    if (forced !== undefined) {
      this.sliceSize = forced;
      this.emit("drain", { sliceSize: this.sliceSize });
      return;
    }

    const maxSlice = this.getEffectiveMaxSlice();
    const previousSize = this.sliceSize;
    const driftStep = this.policy.peerIsNative
      ? FLOW_DEFAULTS.DRIFT_STEP * 2
      : FLOW_DEFAULTS.DRIFT_STEP;
    this.sliceSize = Math.min(
      maxSlice,
      this.sliceSize + driftStep,
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
   * Closed-loop coherence control: update batch/flush policy based on CoherenceController decision.
   * Call after each flush or on a telemetry interval.
   * @param framer BatchFramer instance
   * @param coherenceController CoherenceController instance
   */
  updateCoherenceControl(framer: BatchFramer, coherenceController: CoherenceController): void {
    // Gather metrics from FlowController and BatchFramer
    const diag = this.getDiagnostics();
    const framerStats = framer.getStats();
    const now = Date.now();
    const avgFrameBytes =
      framerStats.totalFrames > 0
        ? framerStats.totalBytes / framerStats.totalFrames
        : framerStats.pendingFrames > 0
          ? framerStats.pendingBytes / framerStats.pendingFrames
          : diag.adaptive?.bytesPerFlushAvg && (diag.adaptive?.sliceSize ?? this.sliceSize) > 0
            ? diag.adaptive.bytesPerFlushAvg /
              Math.max(1, diag.adaptive?.sliceSize ?? this.sliceSize)
            : 1024;
    const frameBytes = Number.isFinite(avgFrameBytes)
      ? Math.max(1, avgFrameBytes)
      : 1024;
    const burstBudget = Math.max(1, this.policy.burstBudgetBytes);
    const availableTokens = this.bucket.availableTokens;
    const bufferedBytes = framerStats.pendingBytes;
    const reserveAvailable = Math.min(
      availableTokens,
      Math.max(0, burstBudget - bufferedBytes),
    );
    const reserveEstimate = Math.max(
      0,
      Math.min(1, reserveAvailable / burstBudget),
    );
    const eventLoopJitterMs = this.readEventLoopJitterMs();
    const eventLoopUtilization = this.readEventLoopUtilization();
    // Compose TransportMetrics
    const metrics = {
      bytesSent: diag.totalBytes,
      bytesAcked: 0, // Fill in from receiver if available
      messagesSent: framerStats.totalFrames,
      messagesAcked: 0, // Fill in from receiver if available
      batchSize: Math.round(frameBytes * this.sliceSize),
      batchMessages: this.sliceSize,
      batchIntervalMs: diag.adaptive?.flushIntervalAvgMs ?? 0,
      bufferedBytes,
      bufferedMessages: framerStats.pendingFrames,
      socketBackpressure: this.isPressureActive(),
      eventLoopJitterMs,
      eventLoopUtilization,
      gcPauseMs: diag.adaptive?.gcPauseMaxMs ?? 0,
      marginEstimate: diag.policy.coherence, // Use coherence as margin proxy
      reserveEstimate,
      rttMs: undefined,
      timestamp: now,
    };
    // Get decision from CoherenceController
    const decision = coherenceController.decide(metrics as TransportMetrics);
    // Apply recommendations
    const targetFrames = Math.max(1, Math.round(decision.batchTarget / frameBytes));
    this.setExternalSliceSize(targetFrames);
    framer.setBatchTiming(targetFrames, decision.flushIntervalMs);
    framer.setFlushCaps(undefined, decision.maxBufferedBytes);
    // Optionally: log or emit decision for diagnostics
    console.debug("[Coherence] mode=", decision.mode, decision.reason);
  }


  /**
   * Enqueue a payload for batched sending
   */
  enqueue(payload: Buffer, framer: BatchFramer): Promise<void> | void {
    framer.encodeToBatch(payload);
    if (this.isFastPathActive()) {
      return;
    }
    const caps = this.resolveFramerCaps(this.policy.peerIsNative);
    const backlogFrames = framer.pendingBatchSize;
    const backlogBytes = framer.pendingBatchBytes;
    const shouldForce =
      backlogFrames >= this.sliceSize || backlogBytes >= caps.maxBytes;
    let pending = this.scheduleFlush(framer, shouldForce);

    // Apply backpressure as soon as we exceed caps or a flush is already in flight.
    // This keeps backlog bounded instead of letting buffers pile up behind the token bucket.
    const needsWait =
      this.flushing ||
      backlogFrames >= caps.maxBuffers ||
      backlogBytes >= caps.maxBytes;
    if (needsWait && !pending) {
      pending = this.scheduleFlush(framer, true);
    }
    return needsWait ? pending : undefined;
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
    const preview =
      typeof framer.getFlushPreview === "function"
        ? framer.getFlushPreview()
        : undefined;
    const frameCount = preview?.bufferCount ?? framer.pendingBatchSize;
    const projectedBytes = preview?.totalBytes ?? framer.pendingBatchBytes;
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

  private isPressureActive(): boolean {
    if (this.backpressureCount > 0) return true;
    if (!this.adaptive) return false;
    const { state, config } = this.adaptive;
    if (state.backpressureCount > 0) return true;
    if (state.gcPauseMaxMs > config.gcBudgetMs) return true;
    if (state.eluIdleRatioAvg < config.idleTarget) return true;
    return false;
  }

  private isFastPathActive(): boolean {
    return this.fastPath && !this.isPressureActive();
  }

  private readEventLoopJitterMs(): number {
    if (!loopDelayMonitor) return 0;
    const jitterNs =
      typeof loopDelayMonitor.percentile === "function"
        ? loopDelayMonitor.percentile(99)
        : loopDelayMonitor.mean || 0;
    const jitterMs = jitterNs / 1e6;
    return Number.isFinite(jitterMs) ? jitterMs : 0;
  }

  private readEventLoopUtilization(): number {
    if (typeof performance.eventLoopUtilization !== "function") return 0;
    const current = performance.eventLoopUtilization();
    if (!this.lastEluBaseline) {
      this.lastEluBaseline = current;
      return 0;
    }
    const delta = performance.eventLoopUtilization(this.lastEluBaseline);
    this.lastEluBaseline = current;
    const utilization = delta.utilization ?? 0;
    if (!Number.isFinite(utilization)) return 0;
    return Math.max(0, Math.min(1, utilization));
  }

  /**
   * Apply an external slice size override (e.g., coherence loop).
   */
  setExternalSliceSize(size?: number): void {
    if (this.forceSliceSize !== undefined) return;
    if (size === undefined) {
      this.externalSliceSize = undefined;
      return;
    }
    if (!Number.isFinite(size) || size <= 0) return;
    const clamped = this.clamp(
      Math.floor(size),
      this.policy.minSlice,
      this.getEffectiveMaxSlice(),
    );
    const previousSize = this.sliceSize;
    this.externalSliceSize = clamped;
    this.sliceSize = clamped;
    if (this.adaptive) {
      this.adaptive.state.sliceSize = clamped;
    }
    if (previousSize !== this.sliceSize) {
      this.recordSliceChange("coherence");
      this.emit("sliceDrift", {
        previousSize,
        newSize: this.sliceSize,
        reason: "coherence",
      });
    }
  }

  /**
   * Ingest metrics from an external framer flush (buffers/bytes) to feed adaptive state.
   */
  handleFlushMetrics(bufferCount: number, bytes: number): void {
    // Treat bufferCount as frameCount for adaptive purposes
    this.handlePostFlushTelemetry(bufferCount, bytes, 0);
  }

  /**
   * Suggest writev caps and flush cadence based on current adaptive state and peer trust.
   */
  resolveFramerCaps(peerIsNative: boolean): {
    maxBuffers: number;
    maxBytes: number;
    flushMs: number;
  } {
    const fastPathActive = this.isFastPathActive();
    // Trust-scaled envelope: native peers get the widest caps, TS peers scale with negIndex/coherence.
    const trust = peerIsNative
      ? 1
      : Math.max(
          0.5,
          Math.min(1, this.policy.nIndex ?? this.policy.coherence ?? 0.5),
        );

    const bounds = peerIsNative
      ? {
          minBuf: 16,
          maxBuf: FLOW_DEFAULTS.NATIVE_PEER_MAX_BUFFERS,
          minBytes: FLOW_DEFAULTS.NATIVE_PEER_MIN_BYTES,
          maxBytes: FLOW_DEFAULTS.NATIVE_PEER_MAX_BYTES,
        }
      : fastPathActive
        ? {
            minBuf: 16,
            maxBuf: FLOW_DEFAULTS.TS_FAST_MAX_BUFFERS,
            minBytes: 16 * 1024,
            maxBytes: FLOW_DEFAULTS.TS_FAST_MAX_BYTES,
          }
        : {
          minBuf: 8,
          maxBuf: FLOW_DEFAULTS.TS_FRAMER_MAX_BUFFERS,
          minBytes: FLOW_DEFAULTS.TS_FRAMER_MIN_BYTES,
          maxBytes: FLOW_DEFAULTS.TS_FRAMER_MAX_BYTES,
        };

    // Start near slice*2, but allow expansion toward the trust envelope.
    let maxBuffers = Math.min(bounds.maxBuf, Math.max(bounds.minBuf, this.sliceSize * 2));
    let maxBytes = Math.min(bounds.maxBytes, Math.max(bounds.minBytes, bounds.maxBytes * trust));
    let flushMs = peerIsNative ? 1 : 1;
    if (!peerIsNative && TS_FLUSH_INTERVAL_MS !== undefined) {
      flushMs = TS_FLUSH_INTERVAL_MS;
    }

    const adaptive = this.adaptive;
    if (adaptive && !fastPathActive) {
      const { state, config } = adaptive;
      const idleOK = state.eluIdleRatioAvg >= config.idleTarget;
      const gcOK = state.gcPauseMaxMs <= config.gcBudgetMs;
      const bp = state.backpressureCount > 0 || this.backpressureCount > 0;

      // Only contract on real pressure (GC/backpressure); otherwise nudge caps upward.
      if (!idleOK || !gcOK || bp) {
        const contractionRatio = peerIsNative
          ? nativePeerContractionRatio()
          : 0.75;
        maxBuffers = Math.max(bounds.minBuf, Math.round(maxBuffers * contractionRatio));
        maxBytes = Math.max(bounds.minBytes, Math.round(maxBytes * contractionRatio));
        flushMs = peerIsNative
          ? Math.max(flushMs, 1 + (bp ? 1 : 0))
          : Math.max(flushMs, 2 + (bp ? 1 : 0));
      } else {
        maxBuffers = Math.min(
          bounds.maxBuf,
          Math.round(
            maxBuffers *
              (peerIsNative ? nativePeerExpansionBufferRatio() : 1.1),
          ),
        );
        maxBytes = Math.min(
          bounds.maxBytes,
          Math.round(
            maxBytes *
              (peerIsNative ? nativePeerExpansionByteRatio() : 1.05),
          ),
        );
        flushMs = Math.max(1, flushMs);
      }
    }

    const governance = this.governancePolicy;
    if (governance) {
      maxBuffers = Math.max(
        bounds.minBuf,
        Math.min(bounds.maxBuf, Math.round(maxBuffers * governance.batchScale)),
      );
      maxBytes = Math.max(
        bounds.minBytes,
        Math.min(bounds.maxBytes, Math.round(maxBytes * governance.bufferScale)),
      );
      flushMs = Math.max(1, Math.round(flushMs * governance.flushScale));
    }

    return { maxBuffers, maxBytes, flushMs };
  }

  resolveBatchSize(peerIsNative: boolean): number {
    if (!this.isFastPathActive()) {
      return this.sliceSize;
    }
    const caps = this.resolveFramerCaps(peerIsNative);
    const preferred = Math.max(this.sliceSize, this.policy.preferredBatchSize);
    const governanceScale = this.governancePolicy?.batchScale ?? 1;
    return Math.max(
      this.policy.minSlice,
      Math.min(Math.round(preferred * governanceScale), caps.maxBuffers),
    );
  }

  setGovernancePolicy(policy?: TransportGovernancePolicy): void {
    this.governancePolicy = policy;
  }

  /**
   * Get diagnostics snapshot
   */
  getDiagnostics(): FlowControllerDiagnostics {
    const negentropic = this.negDiagnostics.getSnapshot();
    const flushHistory = TRANSPORT_COHERENCE_ENABLED
      ? this.getOrderedFlushHistory()
      : [];
    const backpressureHistory = TRANSPORT_COHERENCE_ENABLED
      ? this.getOrderedBackpressureHistory()
      : [];
    const transportCoherence = TRANSPORT_COHERENCE_ENABLED
      ? computeTransportCoherence({
          sliceHistory: this.sliceHistory.slice(-32),
          flushHistory: flushHistory.slice(-64),
          backpressureHistory: backpressureHistory.slice(-64),
          eluIdleRatioAvg: this.adaptive?.state.eluIdleRatioAvg,
          gcPauseMaxMs: this.adaptive?.state.gcPauseMaxMs,
          payloadEntropy: negentropic.entropy,
          payloadNegentropy: negentropic.negentropy,
        })
      : undefined;
    return {
      currentSliceSize: this.sliceSize,
      forceSliceSize: this.forceSliceSize,
      externalSliceSize: this.externalSliceSize,
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
      flushHistory: TRANSPORT_COHERENCE_ENABLED ? flushHistory.slice(-16) : [],
      backpressureHistory: TRANSPORT_COHERENCE_ENABLED
        ? backpressureHistory.slice(-16)
        : [],
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
      transportCoherence,
      governance: this.governancePolicy
        ? {
            mode: this.governancePolicy.mode,
            reason: this.governancePolicy.reason,
          }
        : undefined,
      negentropic,
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
    this.flushHistory = [];
    this.backpressureHistory = [];
    this.flushHistoryCursor = 0;
    this.backpressureHistoryCursor = 0;
    this.negDiagnostics.reset();
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

  recordMessageType(messageType: string): void {
    this.negDiagnostics.recordMessageType(messageType);
  }

  private handlePostFlushTelemetry(
    frameCount: number,
    bytes: number,
    _reserveDelayMs: number,
  ): void {
    if (frameCount <= 0 || bytes <= 0) return;
    const now = performance.now();
    if (TRANSPORT_COHERENCE_ENABLED) {
      this.recordFlushSample({
        timestamp: Date.now(),
        bytes,
        frames: frameCount,
      });
    }
    if (!this.adaptive) return;
    const { state, config, peer } = this.adaptive;
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
        state.backpressureCount = peer.isNative
          ? Math.floor(state.backpressureCount * 0.5)
          : Math.max(0, state.backpressureCount - 1);
      }
    }

    if (this.adaptive.flushCounter % config.adaptEvery === 0) {
      this.applyAdaptiveSlice();
    }
  }

  private applyAdaptiveSlice(): void {
    if (!this.adaptive) return;
    const forced = this.resolveForcedSlice();
    if (forced !== undefined) {
      this.sliceSize = forced;
      this.adaptive.state.sliceSize = forced;
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
    const bpOK = peer.isNative
      ? state.backpressureCount <= 1 && !cooldownActive
      : state.backpressureCount === 0 && !cooldownActive;
    const allowExpansion = idleOK && gcOK && bpOK;

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
      peer.isNative
        ? Math.max(2, Math.floor(config.driftStep / 2))
        : !gcOK && state.gcPauseMaxMs > config.gcBudgetMs * 1.5
          ? Math.max(2, Math.floor(config.driftStep * 1.5))
          : Math.max(1, Math.floor(config.driftStep / 2));

    let desired = this.sliceSize;
    if (allowExpansion) {
      desired = Math.min(peerMax, this.sliceSize + expansionStep);
    } else {
      desired = Math.max(bounds.minSlice, this.sliceSize - contractionBase);
    }

    if (cooldownActive) {
      desired = Math.min(
        desired,
        Math.max(bounds.minSlice, this.sliceSize - contractionBase),
      );
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

  private resolveForcedSlice(): number | undefined {
    return this.forceSliceSize ?? this.externalSliceSize;
  }

  private recordFlushSample(sample: {
    timestamp: number;
    bytes: number;
    frames: number;
  }): void {
    if (this.flushHistory.length < 128) {
      this.flushHistory.push(sample);
      return;
    }
    this.flushHistory[this.flushHistoryCursor] = sample;
    this.flushHistoryCursor = (this.flushHistoryCursor + 1) % 128;
  }

  private recordBackpressureSample(timestamp: number): void {
    if (this.backpressureHistory.length < 128) {
      this.backpressureHistory.push(timestamp);
      return;
    }
    this.backpressureHistory[this.backpressureHistoryCursor] = timestamp;
    this.backpressureHistoryCursor = (this.backpressureHistoryCursor + 1) % 128;
  }

  private getOrderedFlushHistory(): Array<{
    timestamp: number;
    bytes: number;
    frames: number;
  }> {
    if (this.flushHistory.length < 128) {
      return this.flushHistory;
    }
    return [
      ...this.flushHistory.slice(this.flushHistoryCursor),
      ...this.flushHistory.slice(0, this.flushHistoryCursor),
    ];
  }

  private getOrderedBackpressureHistory(): number[] {
    if (this.backpressureHistory.length < 128) {
      return this.backpressureHistory;
    }
    return [
      ...this.backpressureHistory.slice(this.backpressureHistoryCursor),
      ...this.backpressureHistory.slice(0, this.backpressureHistoryCursor),
    ];
  }
}

/**
 * Diagnostics snapshot for FlowController
 */
export interface FlowControllerDiagnostics {
  currentSliceSize: number;
  forceSliceSize?: number;
  externalSliceSize?: number;
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
  flushHistory: Array<{ timestamp: number; bytes: number; frames: number }>;
  backpressureHistory: number[];
  adaptive?: {
    mode: AdaptiveMode;
    sliceSize: number;
    flushIntervalAvgMs: number;
    bytesPerFlushAvg: number;
    eluIdleRatioAvg: number;
    gcPauseMaxMs: number;
  };
  governance?: {
    mode: string;
    reason: string[];
  };
  transportCoherence?: TransportCoherenceSnapshot;
  negentropic: NegentropicSnapshot;
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
  if (peerIsNative) {
    // Allow high-trust native peers to stretch beyond baseline batch size for throughput.
    if (nIndex >= 0.85) {
      maxSlice = Math.max(maxSlice, FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE);
    }
  } else {
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
    bounds?: PolicyBounds;
    adaptiveConfig?: Partial<AdaptiveConfig>;
    fastPath?: boolean;
  },
): FlowController {
  const policy = deriveSessionFlowPolicy(metrics, options);
  const peerProfile: PeerProfile = {
    isNative: policy.peerIsNative,
    nIndex: policy.nIndex ?? metrics.negIndex ?? 0.5,
    coherence: policy.coherence,
  };
  const trust = peerProfile.nIndex;
  const runtimeMaxSlice =
    policy.peerIsNative && trust >= 0.85
      ? Math.max(policy.maxSlice, FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE)
      : policy.maxSlice;
  const resolvedBounds = options?.bounds
    ? {
        minSlice: Math.max(policy.minSlice, options.bounds.minSlice),
        maxSlice: Math.max(options.bounds.maxSlice, policy.minSlice),
      }
    : { minSlice: policy.minSlice, maxSlice: runtimeMaxSlice };
  const envMode = envAdaptiveMode();
  const adaptiveOverride =
    options?.adaptiveMode ??
    (envMode ? resolveAdaptiveMode(envMode) : undefined);
  return new FlowController(policy, {
    adaptiveMode: adaptiveOverride,
    peerProfile,
    forceSliceSize: options?.forceSliceSize,
    forceRateBytesPerSec: options?.forceRateBytesPerSec,
    bounds: resolvedBounds,
    adaptiveConfig: options?.adaptiveConfig,
    fastPath: options?.fastPath,
  });
}

/**
 * Disable all event loop delay monitors created by FlowController.
 * Useful for benchmarks to allow process exit when diagnostics are not needed.
 */
export function shutdownFlowControllerMonitors(): void {
  disableMonitors();
}
