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

interface DetectorParams {
  historyWindow: number;         // e.g. 10
  vEps: number;                  // drift near-zero threshold
  mMin: number;                  // “good enough” margin threshold
  mStdMax: number;               // stability threshold for M
  latencyStdMax: number;         // stability threshold for latency_var (units!)
  residualMax: number;           // composite residual threshold
  minEventGapSteps: number;      // cooldown to prevent spam
  falsifyAfterSteps: number;     // if no events after N ticks
  dtSeconds: number;             // your loop Δt
  // normalization scales (set once from observed ranges or rolling stats)
  vScale: number;
  dmDtScale: number;
}

export class ResolutionDetector {
  private history: Array<{ m: number; v: number; sample: Sample }> = [];
  private events: ResolutionEvent[] = [];

  private stepCount = 0;
  private stepsSinceEvent = 0;
  private wasResolved = false;

  constructor(private p: DetectorParams) {}

  tick(M: number, V: number, S: Sample, C: Record<string, any>) {
    this.stepCount++;
    this.stepsSinceEvent++;

    this.history.push({ m: M, v: V, sample: S });
    if (this.history.length > this.p.historyWindow) this.history.shift();

    const stats = this.computeWindowStats();
    if (!stats) return;

    const { mStd, vMeanAbs, latencyStd, dmDt } = stats;

    // Normalize residual terms so the composite is interpretable
    const vN = V / this.p.vScale;
    const dmDtN = dmDt / this.p.dmDtScale;
    const residual = vN + dmDtN;

    const resolvedNow =
      vMeanAbs < this.p.vEps &&
      M > this.p.mMin &&
      mStd < this.p.mStdMax &&
      latencyStd < this.p.latencyStdMax &&
      Math.abs(residual) < this.p.residualMax;

    // Edge trigger + cooldown
    const shouldEmit =
      resolvedNow &&
      !this.wasResolved &&
      this.stepsSinceEvent >= this.p.minEventGapSteps;

    if (shouldEmit) {
      this.stepsSinceEvent = 0;
      const ev: ResolutionEvent = {
        timestamp: Date.now(),
        config: { ...C },
        m: M,
        v: V,
        residual,
        latencyStd,
        reason: `Resolved edge: |vMean|<${this.p.vEps}, M>${this.p.mMin}, mStd<${this.p.mStdMax}, latencyStd<${this.p.latencyStdMax}, |residual|<${this.p.residualMax}`
      };
      this.events.push(ev);
      console.log("[ResolutionDetector] EVENT", ev);
    }

    this.wasResolved = resolvedNow;

    // Falsifiability (run-scoped)
    if (this.stepCount >= this.p.falsifyAfterSteps && this.events.length === 0) {
      console.log(
        "[ResolutionDetector] NO EVENTS: instrumentation not discriminative on this run. Consider adjusting thresholds/scales or choosing different signals."
      );
    }
  }

  getEvents() {
    return this.events;
  }

  private computeWindowStats() {
    if (this.history.length < this.p.historyWindow) return null;

    const ms = this.history.map(h => h.m);
    const vs = this.history.map(h => h.v);
    const latVars = this.history.map(h => h.sample.latency_var ?? 0);

    const mStd = stdDev(ms);
    const vMeanAbs = Math.abs(mean(vs));

    const latencyStd = stdDev(latVars);

    // dm/dt using finite difference across last 2 points
    const last = this.history[this.history.length - 1].m;
    const prev = this.history[this.history.length - 2].m;
    const dmDt = (last - prev) / this.p.dtSeconds;

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
