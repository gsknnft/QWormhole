import { CoherenceLoop } from "./loop";
import { clamp01 } from "./invariants";
import type {
  CoherenceConfig,
  CoherenceState,
  CouplingParams,
  FieldSample,
} from "./types";

export type SimulationEventKind = "jitter" | "crosstalk" | "congestion";

export interface SimulationEvent {
  kind: SimulationEventKind;
  startMs: number;
  durationMs: number;
  magnitude: number;
  label?: string;
}

export interface CoherenceSimulationConfig {
  durationMs: number;
  stepMs: number;
  seed: number;
  baseLatencyMs: number;
  baseJitterMs: number;
  baseErrRate: number;
  baseQueueDepth: number;
  baseQueueSlope: number;
  collapseMargin: number;
  stableWindowSteps: number;
  coupling: CouplingParams;
  coherence: CoherenceConfig;
  events: SimulationEvent[];
}

export interface FailureDiaryEntry {
  tMs: number;
  reason: string;
  note?: string;
}

export interface CoherenceSimulationSummary {
  timeToStabilizeMs?: number;
  overshootMax: number;
  ringingEvents: number;
  couplingChangesPerMinute: number;
  horizonPredictionErrorMs?: number;
  collapseAtMs?: number;
}

export interface CoherenceSimulationResult {
  summary: CoherenceSimulationSummary;
  trace: Array<{ tMs: number; state: CoherenceState; coupling: CouplingParams }>;
  failures: FailureDiaryEntry[];
}

class Lcg {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  nextSigned(scale: number): number {
    return (this.next() - 0.5) * 2 * scale;
  }
}

export function defaultSimulationConfig(): CoherenceSimulationConfig {
  return {
    durationMs: 60_000,
    stepMs: 200,
    seed: 1337,
    baseLatencyMs: 12,
    baseJitterMs: 4,
    baseErrRate: 0.002,
    baseQueueDepth: 8,
    baseQueueSlope: 0.0,
    collapseMargin: 0.15,
    stableWindowSteps: 5,
    coupling: {
      batchSize: 64,
      concurrency: 8,
      redundancy: 0.1,
      paceMs: 1,
    },
    coherence: {
      Hmin: 4,
      maxDelta: { batchSize: 16, concurrency: 2, redundancy: 0.1, paceMs: 5 },
      floors: { batchSize: 1, concurrency: 1, redundancy: 0, paceMs: 0 },
      ceilings: { batchSize: 256, concurrency: 64, redundancy: 1, paceMs: 50 },
    },
    events: [
      { kind: "jitter", startMs: 10_000, durationMs: 6_000, magnitude: 1.5, label: "jitter burst" },
      { kind: "crosstalk", startMs: 22_000, durationMs: 8_000, magnitude: 0.02, label: "crosstalk burst" },
      { kind: "congestion", startMs: 35_000, durationMs: 10_000, magnitude: 2.5, label: "queue climb" },
    ],
  };
}

export function runCoherenceSimulation(
  config: Partial<CoherenceSimulationConfig> = {},
): CoherenceSimulationResult {
  const cfg = { ...defaultSimulationConfig(), ...config };
  const rng = new Lcg(cfg.seed);
  const loop = new CoherenceLoop(cfg.coherence);
  const trace: Array<{ tMs: number; state: CoherenceState; coupling: CouplingParams }> = [];
  const failures: FailureDiaryEntry[] = [];

  const baselineCoupling = { ...cfg.coupling };
  let coupling = { ...cfg.coupling };
  let queueDepth = cfg.baseQueueDepth;
  let couplingChanges = 0;
  let ringingEvents = 0;
  let overshootMax = 0;
  let lastDeltaSignBatch = 0;
  let lastDeltaSignConc = 0;
  let collapseAtMs: number | undefined;
  let lastPredictionMs: number | undefined;

  const lastEventEnd = cfg.events.reduce(
    (max, e) => Math.max(max, e.startMs + e.durationMs),
    0,
  );
  let stableSteps = 0;
  let timeToStabilizeMs: number | undefined;

  for (let tMs = 0; tMs <= cfg.durationMs; tMs += cfg.stepMs) {
    const active = cfg.events.filter(
      e => tMs >= e.startMs && tMs < e.startMs + e.durationMs,
    );
    let jitterScale = 1;
    let errBoost = 0;
    let corrSpike = 0;
    let queueSlopeBoost = 0;
    for (const ev of active) {
      if (ev.kind === "jitter") jitterScale += ev.magnitude;
      if (ev.kind === "crosstalk") {
        errBoost += ev.magnitude;
        corrSpike += ev.magnitude;
      }
      if (ev.kind === "congestion") queueSlopeBoost += ev.magnitude;
    }

    const noise = rng.nextSigned(cfg.baseJitterMs * jitterScale * 0.2);
    const latencyP50 = Math.max(1, cfg.baseLatencyMs + noise);
    const jitter = cfg.baseJitterMs * jitterScale;
    const latencyP95 = latencyP50 + jitter * 1.8;
    const latencyP99 = latencyP50 + jitter * 3.0;

    const slope = cfg.baseQueueSlope + queueSlopeBoost;
    queueDepth = Math.max(0, queueDepth + slope * (cfg.stepMs / 1000));
    const errRate = clamp01(cfg.baseErrRate + errBoost);

    const sample: FieldSample = {
      t: tMs,
      latencyP50,
      latencyP95,
      latencyP99,
      errRate,
      queueDepth,
      queueSlope: slope,
      corrSpike: corrSpike > 0 ? corrSpike : undefined,
    };

    loop.sense(sample);
    const state = loop.estimate();
    if (state.V < 0 && Number.isFinite(state.H)) {
      lastPredictionMs = tMs + state.H * 1000;
    }

    if (state.M < cfg.collapseMargin && collapseAtMs === undefined) {
      collapseAtMs = tMs;
      failures.push({
        tMs,
        reason: "collapse",
        note: `margin dropped below ${cfg.collapseMargin}`,
      });
    }

    const next = loop.adapt(state, coupling);
    const batchDelta = next.batchSize - coupling.batchSize;
    const concDelta = next.concurrency - coupling.concurrency;
    if (batchDelta !== 0) {
      const sign = Math.sign(batchDelta);
      if (lastDeltaSignBatch !== 0 && sign !== lastDeltaSignBatch) {
        ringingEvents += 1;
      }
      lastDeltaSignBatch = sign;
    }
    if (concDelta !== 0) {
      const sign = Math.sign(concDelta);
      if (lastDeltaSignConc !== 0 && sign !== lastDeltaSignConc) {
        ringingEvents += 1;
      }
      lastDeltaSignConc = sign;
    }

    const changed =
      next.batchSize !== coupling.batchSize ||
      next.concurrency !== coupling.concurrency ||
      next.redundancy !== coupling.redundancy ||
      next.paceMs !== coupling.paceMs;
    if (changed) couplingChanges += 1;

    overshootMax = Math.max(
      overshootMax,
      Math.abs(next.batchSize - baselineCoupling.batchSize),
      Math.abs(next.concurrency - baselineCoupling.concurrency),
    );

    if (tMs >= lastEventEnd && timeToStabilizeMs === undefined) {
      if (state.H >= cfg.coherence.Hmin && state.V >= 0) {
        stableSteps += 1;
        if (stableSteps >= cfg.stableWindowSteps) {
          timeToStabilizeMs = tMs - lastEventEnd;
        }
      } else {
        stableSteps = 0;
      }
    }

    trace.push({ tMs, state, coupling: next });
    coupling = next;
  }

  let horizonPredictionErrorMs: number | undefined;
  if (collapseAtMs !== undefined && lastPredictionMs !== undefined) {
    horizonPredictionErrorMs = Math.abs(lastPredictionMs - collapseAtMs);
  }

  if (timeToStabilizeMs === undefined) {
    failures.push({ tMs: cfg.durationMs, reason: "unstable", note: "did not stabilize" });
  }

  const couplingChangesPerMinute =
    cfg.durationMs > 0 ? (couplingChanges / cfg.durationMs) * 60_000 : 0;

  return {
    summary: {
      timeToStabilizeMs,
      overshootMax,
      ringingEvents,
      couplingChangesPerMinute,
      horizonPredictionErrorMs,
      collapseAtMs,
    },
    trace,
    failures,
  };
}

export function formatFailureDiary(result: CoherenceSimulationResult): string {
  if (result.failures.length === 0) {
    return "No failures recorded.";
  }
  return result.failures
    .map(entry => {
      const note = entry.note ? ` - ${entry.note}` : "";
      return `t=${entry.tMs}ms: ${entry.reason}${note}`;
    })
    .join("\n");
}
