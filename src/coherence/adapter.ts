import type { BatchFramer } from "../core/batch-framer";
import type { FlowController } from "../core/flow-controller";
import { clamp01 } from "./invariants";
import { CoherenceLoop } from "./loop";
import type {
  CoherenceConfig,
  CouplingParams,
  FieldSample,
} from "./types";

export interface CoherenceAdapterOptions {
  enabled?: boolean;
  config?: CoherenceConfig;
  coupling?: Partial<CouplingParams>;
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
  const loop = new CoherenceLoop(options.config ?? DEFAULT_COHERENCE_CONFIG);
  let coupling: CouplingParams = {
    batchSize: flow.currentSliceSize,
    concurrency: Math.max(1, Math.round(flow.currentSliceSize / 4)),
    redundancy: 0,
    paceMs: 1,
    ...options.coupling,
  };

  let lastFlushAt = Date.now();
  let lastPendingBytes = framer.pendingBatchBytes;
  let backpressureCount = 0;

  const onBackpressure = () => {
    backpressureCount += 1;
  };

  const onFlush = () => {
    const now = Date.now();
    const dtMs = Math.max(1, now - lastFlushAt);
    const dtSec = dtMs / 1000;
    const pendingBytes = framer.pendingBatchBytes;
    const queueSlope = (pendingBytes - lastPendingBytes) / dtSec;
    lastPendingBytes = pendingBytes;
    lastFlushAt = now;

    const latencyP50 = dtMs;
    const latencyP95 = dtMs * 1.6;
    const latencyP99 = dtMs * 2.4;
    const errRate = clamp01(backpressureCount / 4);
    const corrSpike = backpressureCount > 0 ? clamp01(backpressureCount / 4) : undefined;
    backpressureCount = 0;

    const sample: FieldSample = {
      t: now,
      latencyP50,
      latencyP95,
      latencyP99,
      errRate,
      queueDepth: framer.pendingBatchSize,
      queueSlope,
      corrSpike,
    };

    loop.sense(sample);
    const state = loop.estimate();
    coupling = loop.adapt(state, coupling);

    flow.setExternalSliceSize(coupling.batchSize);
    framer.setBatchTiming(coupling.batchSize, coupling.paceMs);
  };

  framer.on("backpressure", onBackpressure);
  framer.on("flush", onFlush);

  return {
    loop,
    stop: () => {
      framer.off("backpressure", onBackpressure);
      framer.off("flush", onFlush);
      flow.setExternalSliceSize(undefined);
    },
  };
}
