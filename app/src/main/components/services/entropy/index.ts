// packages/QWave/entropy.ts

import { randomBytes } from "crypto";
import {FFT} from "@sigilnet/fft-legacy";
import { applyHannWindow } from "../windows";
import { Complex, computeFFT } from "../compute-fft";

export class Entropy {
  static negentropicIndex(coherence:number, H:number){return coherence/(H+1e-9);}

  /**
   * Generate a local entropy seed.
   */
  static seed(length: number = 256): Uint8Array {
    return randomBytes(length);
  }

  /**
   * Shannon entropy of a byte array, normalized [0,1].
   */
  static measureBytes(data: Uint8Array): number {
    const freq: Record<number, number> = {};
    for (const byte of data) freq[byte] = (freq[byte] || 0) + 1;
    const len = data.length;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy / 8; // normalize (max 8 bits per symbol)
  }

  /**
   * Spectral entropy: measure entropy of FFT magnitudes.
   * Uses computeFFT to avoid in/out buffer aliasing issues.
   */
  static measureSpectrum(signal: Float64Array): number {
    const fft = new FFT(signal);
    const input = fft.toComplexArray(signal);
    const output = new Float64Array(input.length);
    // realTransform requires distinct input/output buffers
    fft.realTransform(output, input);
    const mags: Float64Array = output.map((v: number) => Math.abs(v));
    const sum = mags.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    let entropy = 0;
    for (const m of mags) {
      const p = m / sum;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy / Math.log2(mags.length); // normalize [0,1]
  }
  
  /**
   * Compute normalized Shannon entropy of a byte array.
   * Returns a value between 0 (no entropy) and 1 (max entropy).
   */
  static measure(data: Uint8Array): number {
    const freq: Record<number, number> = {};
    for (const byte of data) {
      freq[byte] = (freq[byte] || 0) + 1;
    }
    const len = data.length;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    // Normalize by maximum possible entropy (8 bits per symbol)
    return entropy / 8;
  }

  /**
   * Compute entropy delta between two signals.
   */
  static delta(a: number, b: number): number {
    return Math.abs(a - b);
  }

/**
 * Calculate Shannon entropy of a signal
 */
static entropy(signal: number[]): number {
  const hist: Record<string, number> = {};
  
  // Create histogram
  signal.forEach((val) => {
    const bin = Math.floor(val * 100).toString();
    hist[bin] = (hist[bin] || 0) + 1;
  });

  // Calculate probabilities
  const total = signal.length;
  const probs = Object.values(hist).map((count) => count / total);

  // Shannon entropy: H = -Σ p(x) log2(p(x))
  return -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
}

  static measureSpectrumHann(samples: Float64Array): number {
    const N = samples.length;
    if (N <= 2) return 0;
    const windowed = applyHannWindow(samples, false) as Float64Array;
    const complex: Complex[] = computeFFT(Float64Array.from(windowed));
    for (let i = 0; i < complex.length; i++) {
      complex[i].magnitude = Math.sqrt(complex[i].real ** 2 + complex[i].imag ** 2);
    }
    const magnitude = complex.map(c => c.magnitude);
    const total = magnitude.reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    const probs = magnitude.map(m => m / total);
    return -probs.reduce((sum, p) => sum + (p * Math.log2(p || 1e-10)), 0) / Math.log2(magnitude.length);
  }

  static entropyVelocity(current: number, prev: number, deltaT: number): number {
    return (current - prev) / (deltaT || 1e-6); // ΔH/Δt—damping term
  }

  static crossEntropy(p: number[], q: number[]): number {
    return -p.reduce((sum, pi, i) => sum + (pi * Math.log2(q[i] || 1e-10)), 0);
  }
    private smooth(value: number, history: number[], window = 10): number {
      history.push(value);
      if (history.length > window) history.shift();
      return history.reduce((a,b)=>a+b,0) / history.length;
    }

    static measureSpectrumWithWindow(samples: Float64Array): number {
      const N = samples.length;
      if (N <= 2) return 0;
      const windowed = applyHannWindow(samples, false) as Float64Array;
      return this.measureSpectrum(windowed);
    }

  static jensenShannonDivergence(p: number[], q: number[]): number {
    const m = p.map((pi, i) => (pi + q[i]) / 2);
    return (this.crossEntropy(p, m) + this.crossEntropy(q, m)) / 2; // Distance for peer resonance
  }

  static totalEntropy(buf: Uint8Array, alpha = 0.6): number {
    const H_bytes = this.measureBytes(buf);
    const samples = Float64Array.from(buf);
    
    const H_spectrum = this.measureSpectrumWithWindow(samples);
    
    return alpha * H_bytes + (1 - alpha) * H_spectrum; // Tunable fusion
  }
}

/* 


// Usage in Runtime (e.g., ModeController)
const buf = crypto.randomBytes(256); // Sample
const H_total = Entropy2.totalEntropy(buf, 0.6); // Fused
const velocity = Entropy2.entropyVelocity(H_total, prevH, deltaT); // For damping

// Peer Comparison
const dist = Entropy2.jensenShannonDivergence(peer1Mags, peer2Mags); // Resonance distance < threshold → align
if (dist < 0.1) transitionTo(FieldBehaviorMode.MORPHIC_RELAY);

---# 💡 Explanation

The **state machine** and the **mode controller**, & Formal **Entropy class** that can be
dropped in as a canonical source of entropy metrics and seeds. 

## 🧩 What the Entropy class should do

Think of it as the **metabolic sensor** for SigilNet:

- **Seeding**: Generate local entropy seeds (cryptographically strong, reproducible if needed).
- **Measurement**: Calculate entropy of a signal, buffer, or peer telemetry (Shannon entropy, variance, etc.).
- **Delta tracking**: Compare local vs. peer entropy to drive reconciliation.
- **Normalization**: Map entropy values into the `[0,1]` range for thresholds (`ENTROPY_TO_RELAY`, `ENTROPY_SPIKE_FOR_IMMUNE`).

---

## 🧠 How it plugs into your ModeController

- **GENESIS**: `Entropy.seed(512)` seeds the local field.
- **RECONCILIATION**: `Entropy.delta(local, peer)` drives phase tuning.
- **MORPHIC_RELAY**: Monitor `Entropy.measure(signal)` to ensure coherence.
- **IMMUNE_RESPONSE**: Triggered when `Entropy.measure(peer)` spikes above threshold.

---

## 🚦 Next step

You don’t need to overbuild it yet. Start with `seed()` and `measure()`. As you fold in QWave metrics, you can extend it with:
- Sliding-window entropy
- Spectral entropy (FFT-based)
- Cross-entropy between peer signals

---

👉 Do you want me to sketch a **QWave-aware Entropy class** that integrates directly with your FFT pipeline (so entropy is measured in the frequency domain as well as byte-level)? That would align perfectly with your signal-driven architecture.
 */
