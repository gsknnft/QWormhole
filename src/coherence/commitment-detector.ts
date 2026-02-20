//### CommitmentDetector v1 (TypeScript Module)
// commitment-detector.ts
// v1: Introverted commitment detection on system signals
// Detects when fluctuation resolves into stable basin (V(t) ~0, M(t) stable, resonance high)
// Resonance proxy: Perturbation tolerance (e.g., signal variance post-spike < thresh)
// Ties to coherence loop: Uses M(t), V(t); adds resonance check for binding event

/* 
CoherenceEnvelope = {
  Angular Alignment: cosineSimilarity,
  Energy Decomposition: characterizeNoise,
  Margin Stability: M(t),
  Drift Stability: V(t),
  Responsiveness: R(t),
  Horizon: H(t),
  Resonance: perturbation tolerance,
  Lyapunov Energy: variance(M,V),
}
*/

// import { CoherencePrimitives } from "./types";

import { resolveLatencyVar } from "./latency";

export interface CommitmentEvent {
  timestamp: number;
  config: Record<string, any>; // e.g., { batch_size: 32, pacing: 0.5 }
  m: number; // Final margin at commitment
  v: number; // Drift at commitment (should be ~0)
  resonance: number; // Tolerance metric (higher = more stable)
  reason: string; // e.g., "V near zero, M stable, variance damped"
}

export interface CommitmentMetrics {
  committed: boolean;
  resonance: number;
  v: number;
  m: number;
}
export interface CoherenceEnvelope {
  // Transport metrics
  transportVector: number[];     // [p50, p99, bpClient, bpServer, thr, ...]
  transportPCA: {
    eigenvalues: number[];
    eigenvectors: number[][];
  };

  // Harmonic field metrics
  harmonicVector: number[];      // [dominantHz, entropy, h1, h2, h3]
  harmonicPCA: {
    eigenvalues: number[];
    eigenvectors: number[][];
  };

  // Stability metrics
  lyapunovEnergy: number;        // from CommitmentDetector
  resonance: number;             // from perturbation decay
  drift: number;                 // V(t)
  margin: number;                // M(t)

  // Combined PCA (meta‑field)
  metaEigen: {
    eigenvalues: number[];
    eigenvectors: number[][];
  };
}
export class CommitmentDetector {
  private history: Array<{
    m: number;
    v: number;
    sample: Record<string, number>;
    config?: Record<string, any>;
    timestamp: number;
  }> = [];
  private events: CommitmentEvent[] = [];
  private resonance: number = 0;
  event_trace: CommitmentEvent[] = [];
  private now: () => number;


  // Detection thresholds
  private v_epsilon = 0.01; // Drift near zero threshold
  private m_stable = 0.8; // Margin stability threshold
  private resonance_thresh = 0.1; // Low variance post-perturbation
  private history_window = 5; // Recent steps for stability check

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }
  

  // Call this per loop iteration, after estimate(M, V, R)
  detectCommitment(
    current_M: number,
    current_V: number,
    current_sample: Record<string, number>,
    current_C?: Record<string, any>,
    timestamp: number = this.now(),
  ): void {
    this.history.push({

      m: current_M,
      v: current_V,
      sample: current_sample,
      config: current_C,
      timestamp,
    });
    // keep only the last N milliseconds of history
    const horizonMs = 5000; // ~5 s sliding window
    this.history = this.history.filter(h => this.now() - h.timestamp < horizonMs);

    if (this.history.length > this.history_window) this.history.shift();
    // Check for perturbation event (e.g., spike in latency or error rate)
    if (this.detectPerturbation()) {
      // Track config change (ΔC) over last k steps
      const k = Math.min(5, this.history.length);
      // If config deltas spike then decay (simple: last delta << peak in window)
      const deltas: number[] = [];
      for (let i = this.history.length - k; i < this.history.length - 1; i++) {
        const prevConfig = this.history[i]?.config;
        const currConfig = this.history[i + 1]?.config;
        if (prevConfig && currConfig) {
          deltas.push(this.sumConfigDelta(prevConfig, currConfig));
        }
      }
      if (deltas.length > 0) {
        const peakDelta = Math.max(...deltas);
        const lastDelta = deltas[deltas.length - 1];
        // If spike then decay (lastDelta < peakDelta * 0.5)
        this.resonance = Math.max(
          0,
          Math.min(1, this.resonance + (lastDelta < peakDelta * 0.5 ? 0.05 : -0.05)),
        );
        if (lastDelta < peakDelta * 0.5) {
          // Optionally, you could store resonance as a property and update here
          // For demonstration, just log
          this.resonance += 1; // If you track resonance as a property
          // Or trigger some effect
        } else {
          this.resonance -= 1;
        }
      }
    }

      this.event_trace = this.history.slice(-this.history_window).map(h => ({
        timestamp: h.timestamp,
        config: { ...(h.config ?? current_C) },
        m: h.m,
        v: h.v,
        resonance: this.resonance,
        reason: "Trace event"
      }));

    if (this.isCommitted(current_M, current_V)) {
      const resonance = this.calculateResonance();
      if (resonance > this.resonance_thresh) {
        if (this.lyapunov() < 0.05) {
          const event: CommitmentEvent = {
            timestamp,
            config: { ...current_C },
            m: current_M,
            v: current_V,
            resonance,
            reason: `V near zero (${current_V}), M stable (${current_M}), resonance high (${resonance})`
          };

          this.events.push(event);
          console.log('Commitment Event Detected:', event); // Or emit to diagnostics
          // Optional: Clear history or trigger system action (e.g., lock config)
        }
      }
    }
  }

  private detectPerturbation(): boolean {
    // Simple perturbation detection: Sudden spike in latency or error rate
    if (this.history.length < 2) return false;
    const lastSample = this.history[this.history.length - 1].sample;
    const prevSample = this.history[this.history.length - 2].sample;
    const latencySpike = (lastSample.latencyP95 || 0) - (prevSample.latencyP95 || 0) > 50; // e.g., >50ms spike
    const errorSpike = (lastSample.errRate || 0) - (prevSample.errRate || 0) > 0.05;
    return latencySpike || errorSpike;
  }

  private sumConfigDelta(prev: Record<string, any>, next: Record<string, any>): number {
    let sum = 0;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      const prevValue = prev[key];
      const nextValue = next[key];
      if (typeof prevValue === "number" && typeof nextValue === "number") {
        sum += Math.abs(nextValue - prevValue);
      }
    }
    return sum;
  }

  private isCommitted(m: number, v: number): boolean {
    return Math.abs(v) < this.v_epsilon &&
          m > this.m_stable &&
          this.isStableOverWindow() &&
          this.responsiveness() > 0.5;
  }
  
  private lyapunov(): number {
    const vs = this.history.map(h => h.v);
    const varV = this.stdDev(vs);
    const ms = this.history.map(h => h.m);
    const varM = this.stdDev(ms);
    return varV + varM;  // total "energy"
  }

private responsiveness(): number {
  if (this.history.length < 3) return 0;
  const last = this.history.at(-1)!.sample;
  const prev = this.history.at(-2)!.sample;
  const diff = Math.abs((last.latencyP95 ?? 0) - (prev.latencyP95 ?? 0));
  // measure how fast it returns to baseline
  const baseline = this.history[0].sample.latencyP95 ?? 0;
  const rebound = Math.abs((last.latencyP95 ?? 0) - baseline);
  return diff > 0 ? 1 - rebound / diff : 0;  // 1 = perfect recovery
}

  private isStableOverWindow(): boolean {
    if (this.history.length < this.history_window) return false;
    const ms = this.history.map(h => h.m);
    const vs = this.history.map(h => h.v);
    const m_std = this.weightedStdDev(ms) < 0.05;
    const v_mean = Math.abs(this.mean(vs)) < this.v_epsilon; // Drift averaged low
    return m_std && v_mean;
  }

  private calculateResonance(): number {
    // Proxy for perturbation tolerance: Variance of key signal (e.g., latency_var) over window
    // High resonance = low variance post-fluctuation (damped perturbations)
    
    const latencies = this.history.map(h => resolveLatencyVar(h.sample)); // Use derived latency variance
    return 1 / (1 + this.stdDev(latencies)); // Normalize [0,1]; low var = high resonance
  }

  // Utils
  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private weightedStdDev(values: number[], tau = 3000): number {
  if (values.length === 0) return 0;

  const weights = this.history.map(h => Math.exp(-(this.now() - h.timestamp) / tau));
  const mean =
    values.reduce((a, v, i) => a + v * weights[i], 0) /
    weights.reduce((a, w) => a + w, 0);
  const variance =
    values.reduce((a, v, i) => a + weights[i] * (v - mean) ** 2, 0) /
    weights.reduce((a, w) => a + w, 0);
  return Math.sqrt(variance);
}


  private stdDev(arr: number[]): number {
    if (arr.length === 0) return 0;
    const m = this.mean(arr);
    return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
  }

  getEvents(): CommitmentEvent[] {
    return this.events;
  }
}

// Usage Example (Integrate with your coherence loop)
// const coherenceLoop = new CoherencePrimitives(); // Your existing loop
// const detector = new CommitmentDetector(coherenceLoop);

// loop.everyΔt(() => {
//   const S = coherenceLoop.sample(); // Ambient signals
//   const [M, V, R] = coherenceLoop.estimate(S);
//   const new_C = coherenceLoop.adapt(M, V, R, current_C);
//   detector.detectCommitment(M, V, S, new_C); // Detect here
//   apply(new_C);
// });

// Later: detector.getEvents() for logged commitments
