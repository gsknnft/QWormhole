import { clamp01, isUnsafe } from "./invariants";
import { resolveLatencyVar } from "./latency";
import { CoherenceLoop } from "./loop";
import {
  buildIdentityMatrix,
  buildNboSignal,
  nboVectorized,
  normalizeTopologyRows,
  summarizeNbo,
} from "./nbo";
import type {
  CoherenceConfig,
  CouplingParams,
  FieldSample,
  CoherenceMode,
  CoherenceTelemetryEntry,
  NboOptions,
  NboSummary,
} from "./types";
import { BatchFramer } from "../core/batch-framer";
import { FlowController } from "../core/flow-controller";
import {
  deriveTransportGovernancePolicy,
  type TransportGovernanceSignals,
} from "../core/transport-governance-policy";
import type { TransportCoherenceSnapshot } from "../core/transport-coherence";

export interface NboAdapterOptions extends NboOptions {
  enabled?: boolean;
  intervalMs?: number;
  windowSize?: number;
  topN?: number;
  signalBuilder?: (samples: FieldSample[]) => number[];
  topologyBuilder?: (size: number) => number[][];
  topologyMatrix?: number[][];
  normalizeTopology?: boolean;
  topologyNormalizer?: (matrix: number[][]) => number[][];
  xVecBuilder?: (size: number, signal: number[]) => number[];
  xVec?: number[];
}

export interface CoherenceAdapterOptions {
  enabled?: boolean;
  config?: CoherenceConfig;
  coupling?: Partial<CouplingParams>;
  mode?: CoherenceMode;
  rttSampler?: () => number | undefined;
  eluSampler?: () => number | undefined;
  minUpdateMs?: number;
  emit?: (entry: CoherenceTelemetryEntry) => void;
  nbo?: NboAdapterOptions;
  governanceSignals?: () => TransportGovernanceSignals | undefined;
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
  const loop = new CoherenceLoop(
    config,
    undefined,
    options.emit ? { emit: options.emit } : undefined,
  );
  const mode = options.mode ?? "enforce";
  const applyExternalSlice = (size?: number) => {
    const controller = flow as FlowController & {
      setExternalSliceSize?: (value?: number) => void;
      setGovernancePolicy?: (value?: ReturnType<typeof deriveTransportGovernancePolicy>) => void;
    };
    if (typeof controller.setExternalSliceSize === "function") {
      controller.setExternalSliceSize(size);
    }
  };
  const applyGovernancePolicy = (signals?: TransportGovernanceSignals) => {
    const controller = flow as FlowController & {
      setGovernancePolicy?: (value?: ReturnType<typeof deriveTransportGovernancePolicy>) => void;
    };
    if (typeof controller.setGovernancePolicy !== "function") {
      return;
    }
    const transportSignals = flow.getDiagnostics().transportCoherence;
    if (!signals && !transportSignals) {
      controller.setGovernancePolicy(undefined);
      return;
    }
    controller.setGovernancePolicy(
      deriveTransportGovernancePolicy(mergeGovernanceSignals(signals, transportSignals)),
    );
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
  const nboConfig = options.nbo;
  const nboEnabled = !!options.emit && (nboConfig?.enabled ?? false);
  const nboIntervalMs = Math.max(200, nboConfig?.intervalMs ?? 1000);
  const nboWindowSize = Math.max(4, nboConfig?.windowSize ?? 12);
  const nboSamples: FieldSample[] = [];
  let lastNboAt = 0;
  let lastNboSummary: NboSummary | undefined;

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
    const queueSlope = deltaBytes / dtSec / 1024;
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
      corrBase + eluPressure > 0 ? clamp01(corrBase + eluPressure) : undefined;
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

    if (nboEnabled) {
      nboSamples.push(sample);
      if (nboSamples.length > nboWindowSize) {
        nboSamples.shift();
      }
      if (now - lastNboAt >= nboIntervalMs && nboSamples.length > 0) {
        lastNboAt = now;
        try {
          const signal =
            nboConfig?.signalBuilder?.(nboSamples) ?? buildNboSignal(nboSamples);
          if (signal.length > 0) {
            const topologyBase =
              nboConfig?.topologyMatrix ??
              nboConfig?.topologyBuilder?.(signal.length) ??
              buildIdentityMatrix(signal.length);
            const topology =
              nboConfig?.topologyNormalizer
                ? nboConfig.topologyNormalizer(topologyBase)
                : nboConfig?.normalizeTopology
                  ? normalizeTopologyRows(topologyBase)
                  : topologyBase;
            const xVec =
              nboConfig?.xVec ??
              nboConfig?.xVecBuilder?.(signal.length, signal) ??
              new Array<number>(signal.length).fill(0);
            const result = nboVectorized(signal, topology, xVec, nboConfig ?? {});
            lastNboSummary = summarizeNbo(result, nboConfig?.topN ?? 5, {
              updatedAt: now,
              ageMs: 0,
            });
          }
        } catch {
          // Ignore NBO failures to avoid impacting the core loop.
        }
      }
    }

    const state = loop.estimate();
    applyGovernancePolicy(options.governanceSignals?.());
    const gcPressure =
      adaptive?.gcPauseMaxMs && adaptive.gcPauseMaxMs > 8
        ? adaptive.gcPauseMaxMs
        : 0;
    const pressureActive =
      errRate > 0 ||
      corrSpike !== undefined ||
      queueSlope > 0 ||
      gcPressure > 0;
    const nextCoupling = pressureActive ? loop.adapt(state, coupling) : coupling;
    const nboSummary = lastNboSummary
      ? {
          ...lastNboSummary,
          ageMs: Math.max(0, now - lastNboSummary.updatedAt),
        }
      : undefined;
    const emitTelemetry = (couplingToEmit: CouplingParams) => {
      if (!options.emit) return;
      loop.emit(state, couplingToEmit, sample, nboSummary);
    };

    if (!pressureActive) {
      if (overrideActive) {
        applyExternalSlice(undefined);
        overrideActive = false;
      }
      coupling = {
        ...coupling,
        batchSize: flow.currentSliceSize,
        concurrency: Math.max(1, Math.round(flow.currentSliceSize / 4)),
      };
      emitTelemetry(coupling);
      return;
    }

    coupling = nextCoupling;
    if (mode === "observe") {
      emitTelemetry(coupling);
      return;
    }
    if (isUnsafe(state, config.Hmin)) {
      applyExternalSlice(coupling.batchSize);
      overrideActive = true;
      emitTelemetry(coupling);
      return;
    }
    if (overrideActive) {
      applyExternalSlice(undefined);
      overrideActive = false;
    }
    emitTelemetry(coupling);
  };

  flow.on("backpressure", onBackpressure);
  flow.on("flush", onFlush);

  return {
    loop,
    stop: () => {
      flow.off("backpressure", onBackpressure);
      flow.off("flush", onFlush);
      applyExternalSlice(undefined);
      applyGovernancePolicy(undefined);
    },
  };
}

function mergeGovernanceSignals(
  signals: TransportGovernanceSignals | undefined,
  transport: TransportCoherenceSnapshot | undefined,
): TransportGovernanceSignals {
  return {
    ...signals,
    transportSNI: transport?.transportSNI,
    transportSPI: transport?.transportSPI,
    transportMetastability: transport?.transportMetastability,
  };
}
