import type {
  CoherenceConfig,
  CoherenceLoopDeps,
  CoherenceState,
  CoherenceTelemetryEntry,
  CouplingParams,
  FieldSample,
  NboSummary,
} from "./types";
import { clamp01, computeHorizonSec, isUnsafe } from "./invariants-lite";

export class CoherenceLoop {
  private history: FieldSample[] = [];
  private readonly deps: CoherenceLoopDeps;

  constructor(
    private cfg: CoherenceConfig,
    private historySize = 64,
    deps?: CoherenceLoopDeps,
  ) {
    this.deps = deps ?? {};
  }

  sample(): FieldSample | null {
    if (!this.deps.sampler) return null;
    const sample = this.deps.sampler();
    if (sample) this.sense(sample);
    return sample;
  }

  sense(sample: FieldSample): void {
    this.history.push(sample);
    if (this.history.length > this.historySize) this.history.shift();
  }

  estimate(): CoherenceState {
    const n = this.history.length;
    if (n < 2) {
      return { M: 1, V: 0, R: 1, H: Infinity, confidence: 0 };
    }

    const a = this.history[n - 2];
    const b = this.history[n - 1];
    const dt = Math.max(1e-6, (b.t - a.t) / 1000);

    const tail = Math.max(0, b.latencyP99 - b.latencyP50);
    const err = b.errRate;
    const M = clamp01(1 / (1 + 0.05 * tail + 50 * err));

    const prevTail = Math.max(0, a.latencyP99 - a.latencyP50);
    const prevM = clamp01(1 / (1 + 0.05 * prevTail + 50 * a.errRate));
    const V = (M - prevM) / dt;

    const heat = Math.max(0, b.queueSlope) + (b.corrSpike ?? 0);
    const R = clamp01(1 / (1 + 2 * heat));

    const H = computeHorizonSec(M, V, R);

    return { M, V, R, H, confidence: 1 };
  }

  predictHorizon(state: Pick<CoherenceState, "M" | "V" | "R">): number {
    return computeHorizonSec(state.M, state.V, state.R);
  }

  adapt(state: CoherenceState, c: CouplingParams): CouplingParams {
    let next = { ...c };

    if (isUnsafe(state, this.cfg.Hmin)) {
      next.batchSize = Math.max(1, Math.floor(next.batchSize / 2));
      next.concurrency = Math.max(1, Math.floor(next.concurrency / 2));
      next.redundancy = next.redundancy + 0.1;
      next.paceMs = next.paceMs + 5;
    }

    next = damp(c, next, this.cfg.maxDelta);
    next = bound(next, this.cfg.floors, this.cfg.ceilings);
    return next;
  }

  emit(
    state: CoherenceState,
    coupling: CouplingParams,
    sample?: FieldSample,
    nbo?: NboSummary,
  ): void {
    if (!this.deps.emit) return;
    const entry: CoherenceTelemetryEntry = {
      t: sample?.t ?? Date.now(),
      state,
      coupling,
      sample,
      nbo,
    };
    this.deps.emit(entry);
  }

  step(
    current: CouplingParams,
    sample?: FieldSample,
    nbo?: NboSummary,
  ): { state: CoherenceState; next: CouplingParams; sample?: FieldSample } {
    const usedSample = sample ?? this.sample() ?? this.history.at(-1);
    if (sample) this.sense(sample);
    const state = this.estimate();
    const next = this.adapt(state, current);
    if (usedSample) {
      this.emit(state, next, usedSample, nbo);
    }
    return { state, next, sample: usedSample };
  }
}

function damp(
  prev: CouplingParams,
  next: CouplingParams,
  maxDelta: Partial<CouplingParams>,
) {
  const out = { ...next };
  for (const k of Object.keys(maxDelta) as (keyof CouplingParams)[]) {
    const d = (next[k] as number) - (prev[k] as number);
    const lim = maxDelta[k] as number;
    if (Math.abs(d) > lim) out[k] = (prev[k] as number) + Math.sign(d) * lim;
  }
  return out;
}

function bound(
  x: CouplingParams,
  floors: Partial<CouplingParams>,
  ceilings: Partial<CouplingParams>,
) {
  const out = { ...x };
  for (const k of Object.keys(out) as (keyof CouplingParams)[]) {
    const v = out[k] as number;
    const f = floors[k] as number | undefined;
    const c = ceilings[k] as number | undefined;
    out[k] = f !== undefined ? Math.max(f, v) : v;
    out[k] = c !== undefined ? Math.min(c, out[k] as number) : out[k];
  }
  return out;
}
