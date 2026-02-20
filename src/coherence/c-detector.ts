// commitment-detector.ts
// v1: Signals-only commitment detection (introverted, no models)
// Detects resolution when drift ~0, margin stable, resonance high
// Adds residual R(t) for CoV flow proxy (numerical test)
// Falsifiable: Logs discard if no events in window

import { ResolutionEvent } from "./coherence";
import { resolveLatencyVar } from "./latency";
// import { CoherencePrimitives } from "./types";

interface ResonanceEvent extends ResolutionEvent {
  resonance: number; // Signal tolerance
}
function mean(a: number[]) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function stdDev(a: number[]) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}


export class ResonanceDetector {
  // private loop: CoherencePrimitives; // Your primitives (M, V from signals)
  private history: Array<{ m: number; v: number; sample: Record<string, number> }> = [];
  private events: ResonanceEvent[] = [];
  private v_epsilon = 0.01; // Low drift threshold
  private m_stable = 0.8; // Stable margin threshold
  private resonance_thresh = 0.1; // Low signal variance
  private history_window = 10; // For stability/residual
  private max_no_event = 50; // Falsify if no resolution by then

  // constructor(loop: CoherencePrimitives) {
  //   this.loop = loop;
  // }

  detectResonance(current_M: number, current_V: number, current_sample: Record<string, number>, current_C: Record<string, any>) {
    this.history.push({ m: current_M, v: current_V, sample: current_sample });
    if (this.history.length > this.history_window) this.history.shift();

    if (this.isResolved(current_M, current_V)) {
      const resonance = this.calculateResonance();
      const residual = this.calculateResidual();
      const latVars = this.history.map(h => resolveLatencyVar(h.sample));
      const latencyStd = stdDev(latVars);

      if (resonance > this.resonance_thresh && Math.abs(residual) < 0.05) { // Low residual threshold
        const event: ResonanceEvent = {
          timestamp: Date.now(),
          config: { ...current_C },
          m: current_M,
          v: current_V,
          latencyStd,
          residual,
          resonance,
          reason: `Drift low (${current_V}), margin stable (${current_M}), residual low (${residual})`
        };
        this.events.push(event);
        console.log("Resonance Event Detected:", event);
        // Reset no-event counter if needed
      }
    }

    // Falsifiability: If no events after max, log discard
    if (this.history.length >= this.max_no_event && this.events.length === 0) {
      console.log("Falsification: No resolution events in window; discard candidate.");
      // Optional: Reset or flag for new J
    }
  }

  private isResolved(m: number, v: number): boolean {
    return Math.abs(v) < this.v_epsilon && m > this.m_stable && this.isStableOverWindow();
  }

  private isStableOverWindow(): boolean {
    if (this.history.length < this.history_window) return false;
    const ms = this.history.map(h => h.m);
    const vs = this.history.map(h => h.v);
    return this.stdDev(ms) < 0.05 && Math.abs(this.mean(vs)) < this.v_epsilon;
  }

  private calculateResonance(): number {
    // Signal tolerance: Inverse variance on key signal (e.g., latency_var)
    const signals = this.history.map(h => resolveLatencyVar(h.sample));
    return 1 / (1 + this.stdDev(signals)); // [0,1]; low var = high tolerance
  }

  private calculateResidual(): number {
    // CoV proxy: Finite diff R(t) ~ V(t) + dM/dt (drift + margin change)
    if (this.history.length < 2) return 0;
    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 2];
    const dm_dt = (last.m - prev.m) / 1; // Assume Δt=1
    return last.v + dm_dt; // Simple residual; extend with more terms if needed
  }

  // Utils
  private mean(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private stdDev(arr: number[]): number {
    const m = this.mean(arr);
    return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
  }

  getEvents(): ResolutionEvent[] {
    return this.events;
  }
}

// Integration (in your bench or loop)
// const coherenceLoop = new CoherencePrimitives();
// const detector = new ResolutionDetector(coherenceLoop);

// loop.everyΔt(() => {
//   const S = coherenceLoop.sample(); // System signals
//   const [M, V, R] = coherenceLoop.estimate(S);
//   const new_C = coherenceLoop.adapt(M, V, R, current_C);
//   detector.detectResolution(M, V, S, new_C); // Signal-based detection
//   apply(new_C);
// });

// Check: detector.getEvents() for resolved basins
