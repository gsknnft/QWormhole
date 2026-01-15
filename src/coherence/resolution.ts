// import { cosineSimilarity } from "./invariants";
// import { metaObserver } from "./meta_observer";
import { resolveLatencyVar } from "./latency";

type Sample = Record<string, number>;

export interface ResolutionEvent {
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
      // const residual = this.calculateResidual();
      // const resonance = this.calculateResonance();
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

  getEvents(): ResolutionEvent[] {
    return this.events;
  }

  getLastObservation() {
    return this.lastObservation;
  }
  private mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stdDev(arr: number[]): number {
    const m = this.mean(arr);
    return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
  }

  // private calculateResonance(): number {
  //   // Signal tolerance: Inverse variance on key signal (e.g., latency_var)
  //   const signals = this.history.map(h => h.sample.latency_var || 0);
  //   return 1 / (1 + this.stdDev(signals)); // [0,1]; low var = high tolerance
  // }

  // private calculateResidual(): number {
  //   // CoV proxy: Finite diff R(t) ~ V(t) + dM/dt (drift + margin change)
  //   if (this.history.length < 2) return 0;
  //   const last = this.history[this.history.length - 1];
  //   const prev = this.history[this.history.length - 2];
  //   const dm_dt = (last.m - prev.m) / 1; // Assume Δt=1
  //   return last.v + dm_dt; // Simple residual; extend with more terms if needed
  // }

  private computeWindowStats() {
    if (this.history.length < this.p.historyWindow) return null;

    const ms = this.history.map(h => h.m);
    const vs = this.history.map(h => h.v);
    const latVars = this.history.map(h => resolveLatencyVar(h.sample));

    const mStd = this.stdDev(ms);
    const vMeanAbs = Math.abs(this.mean(vs));

    const latencyStd = this.stdDev(latVars);

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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

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
