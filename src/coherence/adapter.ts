import type { BatchFramer } from "../core/batch-framer";
import type { FlowController } from "../core/flow-controller";
import { clamp01, isUnsafe } from "./invariants";
import { resolveLatencyVar } from "./latency";
import { CoherenceLoop } from "./loop";
import type {
  CoherenceConfig,
  CouplingParams,
  FieldSample,
  CoherenceMode,
} from "./types";

export interface CoherenceAdapterOptions {
  enabled?: boolean;
  config?: CoherenceConfig;
  coupling?: Partial<CouplingParams>;
  mode?: CoherenceMode;
  rttSampler?: () => number | undefined;
  eluSampler?: () => number | undefined;
  minUpdateMs?: number;
}

export interface CoherenceAdapterHandle {
  loop: CoherenceLoop;
  stop: () => void;
}

const DEFAULT_COHERENCE_CONFIG: CoherenceConfig = {
  Hmin: 4,
  maxDelta: { batchSize: 16, concurrency: 2, redundancy: 0.1, paceMs: 5 },
  floors: { batchSize: 1, concurrency: 1, redundancy: 0, paceMs: 0 },
  ceilings: { batchSize: 256, concurrency: 64, redundancy: 1, paceMs: 50 },
};

export function attachCoherenceAdapter(
  framer: BatchFramer,
  flow: FlowController,
  options: CoherenceAdapterOptions = {},
): CoherenceAdapterHandle {
  const config = options.config ?? DEFAULT_COHERENCE_CONFIG;
  const loop = new CoherenceLoop(config);
  const mode = options.mode ?? "enforce";
  const applyExternalSlice = (size?: number) => {
    const controller = flow as FlowController & {
      setExternalSliceSize?: (value?: number) => void;
    };
    if (typeof controller.setExternalSliceSize === "function") {
      controller.setExternalSliceSize(size);
    }
  };
  let coupling: CouplingParams = {
    batchSize: flow.currentSliceSize,
    concurrency: Math.max(1, Math.round(flow.currentSliceSize / 4)),
    redundancy: 0,
    paceMs: 1,
    ...options.coupling,
  };

  const minUpdateMs = Math.max(20, options.minUpdateMs ?? 100);
  let lastFlushAt = Date.now();
  let lastUpdateAt = lastFlushAt;
  let lastBytesPerFlush = 0;
  let backpressureCount = 0;

  const onBackpressure = () => {
    backpressureCount += 1;
  };

  let overrideActive = false;

  const onFlush = ({ bytes }: { bytes: number }) => {
    const now = Date.now();
    const dtSinceLast = Math.max(1, now - lastFlushAt);
    lastFlushAt = now;
    if (now - lastUpdateAt < minUpdateMs) return;
    lastUpdateAt = now;

    if (!overrideActive) {
      coupling = {
        ...coupling,
        batchSize: flow.currentSliceSize,
        concurrency: Math.max(1, Math.round(flow.currentSliceSize / 4)),
      };
    }

    const diagnostics = flow.getDiagnostics();
    const adaptive = diagnostics.adaptive;
    const flushIntervalMs =
      adaptive?.flushIntervalAvgMs && adaptive.flushIntervalAvgMs > 0
        ? adaptive.flushIntervalAvgMs
        : dtSinceLast;
    const bytesPerFlush =
      adaptive?.bytesPerFlushAvg && adaptive.bytesPerFlushAvg > 0
        ? adaptive.bytesPerFlushAvg
        : bytes;
    const pendingBytes = framer.pendingBatchBytes;
    const dtSec = Math.max(0.05, flushIntervalMs / 1000);
    const deltaBytes = bytesPerFlush - lastBytesPerFlush;
    const queueSlope = (deltaBytes / dtSec) / 1024;
    lastBytesPerFlush = bytesPerFlush;

    const rttMs = options.rttSampler?.();
    const baseLatency = Number.isFinite(rttMs)
      ? Math.max(1, rttMs as number)
      : flushIntervalMs;
    const latencyP50 = baseLatency;
    const latencyP95 = baseLatency * 1.5;
    const latencyP99 = baseLatency * 2.2;
    const eluRaw =
      options.eluSampler?.() ?? flow.runtimeMetrics.getELU?.() ?? 0;
    const elu = Number.isFinite(eluRaw) ? (eluRaw as number) : 0;
    const eluPressure = Math.max(0, elu - 0.9);
    const errRate = clamp01(backpressureCount / 8);
    const corrBase = backpressureCount > 0 ? backpressureCount / 8 : 0;
    const corrSpike =
      corrBase + eluPressure > 0
        ? clamp01(corrBase + eluPressure)
        : undefined;
    backpressureCount = 0;

    const queueDepthBytes = Math.max(bytesPerFlush, pendingBytes);
    const latency_var = resolveLatencyVar({
      latencyP50,
      latencyP95,
      latencyP99,
    });
    const sample: FieldSample = {
      t: now,
      latencyP50,
      latencyP95,
      latencyP99,
      errRate,
      queueDepth: Math.max(0, queueDepthBytes / 1024),
      queueSlope,
      corrSpike,
      latency_var,
    };

    loop.sense(sample);
    const state = loop.estimate();
    const gcPressure =
      adaptive?.gcPauseMaxMs && adaptive.gcPauseMaxMs > 8
        ? adaptive.gcPauseMaxMs
        : 0;
    const pressureActive =
      errRate > 0 ||
      corrSpike !== undefined ||
      queueSlope > 0 ||
      gcPressure > 0;

    if (!pressureActive) {
      if (overrideActive) {
        applyExternalSlice(undefined);
        overrideActive = false;
      }
      return;
    }

    coupling = loop.adapt(state, coupling);
    if (mode === "observe") {
      return;
    }
    if (isUnsafe(state, config.Hmin)) {
      applyExternalSlice(coupling.batchSize);
      overrideActive = true;
      return;
    }
    if (overrideActive) {
      applyExternalSlice(undefined);
      overrideActive = false;
    }
  };

  flow.on("backpressure", onBackpressure);
  flow.on("flush", onFlush);

  return {
    loop,
    stop: () => {
      flow.off("backpressure", onBackpressure);
      flow.off("flush", onFlush);
      applyExternalSlice(undefined);
    },
  };
}
