import { cosineSimilarity } from "./invariants";
import { metaObserver } from "./meta_observer";

type Sample = Record<string, number>;

interface ResolutionEvent {
  timestamp: number;
  config: Record<string, any>;
  m: number;
  v: number;
  residual: number;
  latencyStd: number;
  reason: string;
}

export interface ResolutionObservation {
  timestamp: number;
  m: number;
  v: number;
  residual: number;
  latencyStd: number;
  vMeanAbs: number;
  mStd: number;
  dmDt: number;
  resolved: boolean;
  confidence: number;
}

interface DetectorParams {
  historyWindow: number; // e.g. 10
  vEps: number; // drift near-zero threshold
  mMin: number; // “good enough” margin threshold
  mStdMax: number; // stability threshold for M
  latencyStdMax: number; // stability threshold for latency_var (units!)
  residualMax: number; // composite residual threshold
  minEventGapSteps: number; // cooldown to prevent spam
  falsifyAfterSteps: number; // if no events after N ticks
  dtSeconds: number; // your loop Δt
  // normalization scales (set once from observed ranges or rolling stats)
  vScale: number;
  dmDtScale: number;
}

export class ResolutionDetector {
  private history: Array<{ m: number; v: number; sample: Sample; at: number }> =
    [];
  private events: ResolutionEvent[] = [];

  private stepCount = 0;
  private stepsSinceEvent = 0;
  private wasResolved = false;
  private lastObservation: ResolutionObservation | null = null;
  private falsified = false;

  constructor(private p: DetectorParams) {}

  tick(
    M: number,
    V: number,
    S: Sample,
    C: Record<string, any>,
    timestamp: number = Date.now(),
  ) {
    this.stepCount++;
    this.stepsSinceEvent++;

    this.history.push({ m: M, v: V, sample: S, at: timestamp });
    if (this.history.length > this.p.historyWindow) this.history.shift();

    const stats = this.computeWindowStats();
    if (!stats) return null;

    const { mStd, vMeanAbs, latencyStd, dmDt } = stats;

    // Normalize residual terms so the composite is interpretable
    const vN = V / this.p.vScale;
    const dmDtN = dmDt / this.p.dmDtScale;

    // const drift = cosineSimilarity(prevEigenvector, currentEigenvector);

    const residual = Math.sqrt(vN * vN + dmDtN * dmDtN);
    // const eigResidual = 1 - drift; // from eigenvector drift
    // const residual = Math.sqrt(vN*vN + dmDtN*dmDtN + eigResidual*eigResidual);

    const resolvedNow =
      vMeanAbs < this.p.vEps &&
      M > this.p.mMin &&
      mStd < this.p.mStdMax &&
      latencyStd < this.p.latencyStdMax &&
      residual < this.p.residualMax;

    const confidence = computeConfidence(
      {
        vMeanAbs,
        m: M,
        mStd,
        latencyStd,
        residual,
      },
      this.p,
    );

    // Edge trigger + cooldown
    const shouldEmit =
      resolvedNow &&
      !this.wasResolved &&
      this.stepsSinceEvent >= this.p.minEventGapSteps;

    if (shouldEmit) {
      this.stepsSinceEvent = 0;
      const ev: ResolutionEvent = {
        timestamp,
        config: { ...C },
        m: M,
        v: V,
        residual,
        latencyStd,
        reason: `Resolved edge: |vMean|<${this.p.vEps}, M>${this.p.mMin}, mStd<${this.p.mStdMax}, latencyStd<${this.p.latencyStdMax}, |residual|<${this.p.residualMax}`,
      };
      this.events.push(ev);
      console.log("[ResolutionDetector] EVENT", ev);
    }

    this.wasResolved = resolvedNow;
    this.lastObservation = {
      timestamp,
      m: M,
      v: V,
      residual,
      latencyStd,
      vMeanAbs,
      mStd,
      dmDt,
      resolved: resolvedNow,
      confidence,
    };

    // Falsifiability (run-scoped)
    if (
      !this.falsified &&
      this.stepCount >= this.p.falsifyAfterSteps &&
      this.events.length === 0
    ) {
      this.falsified = true;
      console.log(
        "[ResolutionDetector] NO EVENTS: instrumentation not discriminative on this run. Consider adjusting thresholds/scales or choosing different signals.",
      );
    }

    return this.lastObservation;
  }

  getEvents() {
    return this.events;
  }

  getLastObservation() {
    return this.lastObservation;
  }

  private computeWindowStats() {
    if (this.history.length < this.p.historyWindow) return null;

    const ms = this.history.map(h => h.m);
    const vs = this.history.map(h => h.v);
    const latVars = this.history.map(h => resolveLatencyVar(h.sample));

    const mStd = stdDev(ms);
    const vMeanAbs = Math.abs(mean(vs));

    const latencyStd = stdDev(latVars);

    // dm/dt using finite difference across last 2 points
    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 2];
    const dtSeconds = Math.max(
      0.001,
      (last.at - prev.at) / 1000 || this.p.dtSeconds,
    );
    const dmDt = (last.m - prev.m) / dtSeconds;

    return { mStd, vMeanAbs, latencyStd, dmDt };
  }
}

// helpers
function mean(a: number[]) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function stdDev(a: number[]) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const resolveLatencyVar = (sample: Sample) => {
  const explicit = sample.latency_var;
  if (typeof explicit === "number") {
    return explicit;
  }
  const p50 = sample.latencyP50;
  const p95 = sample.latencyP95;
  if (typeof p50 === "number" && typeof p95 === "number") {
    return Math.max(0, p95 - p50) / Math.max(1, p50);
  }
  const p99 = sample.latencyP99;
  if (typeof p50 === "number" && typeof p99 === "number") {
    return Math.max(0, p99 - p50) / Math.max(1, p50);
  }
  return 0;
};

const computeConfidence = (
  metrics: {
    vMeanAbs: number;
    m: number;
    mStd: number;
    latencyStd: number;
    residual: number;
  },
  p: DetectorParams,
) => {
  const vScore = 1 - clamp01(metrics.vMeanAbs / Math.max(0.0001, p.vEps));
  const mScore = clamp01((metrics.m - p.mMin) / Math.max(0.0001, 1 - p.mMin));
  const mStdScore = 1 - clamp01(metrics.mStd / Math.max(0.0001, p.mStdMax));
  const latencyScore =
    1 - clamp01(metrics.latencyStd / Math.max(0.0001, p.latencyStdMax));
  const residualScore =
    1 - clamp01(metrics.residual / Math.max(0.0001, p.residualMax));
  return clamp01(
    (vScore + mScore + mStdScore + latencyScore + residualScore) / 5,
  );
};
