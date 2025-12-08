import { Entropy } from './index';
import type { Complex } from '../compute-fft';

let qwaveModule: any | null = null;

const clamp01 = (v: number) => {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
};

export type Regime = 'chaos' | 'transitional' | 'coherent';

interface ResonatorState {
  history: number[];
  maxHistory: number;
  lastEntropy?: number;
}

const resonator: ResonatorState = {
  history: [],
  maxHistory: 128,
};

const regimeFromCoherence = (coherence: number, entropy: number): Regime => {
  if (coherence > 0.7 && entropy < 0.4) return 'coherent';
  if (coherence < 0.4 || entropy > 0.7) return 'chaos';
  return 'transitional';
};

export function measureSpectrumWithWindow(samples: Float64Array): number {
  return Entropy.measureSpectrumWithWindow(samples);
}

export function coherenceFromWavelet(
  samples: Float64Array,
  wavelet: string = 'haar',
  level?: number,
): {
  coherence: number;
  regime: Regime;
  entropyVelocity: number;
} {
  const waveEntropy = measureWaveletEntropy(samples, wavelet, level);
  const coherence = clamp01(1 - waveEntropy);

  resonator.history.push(waveEntropy);
  if (resonator.history.length > resonator.maxHistory) resonator.history.shift();
  const prev = resonator.history.length > 1 ? resonator.history[resonator.history.length - 2] : waveEntropy;
  const entropyVelocity = waveEntropy - prev;

  const regime = regimeFromCoherence(coherence, waveEntropy);
  return { coherence, regime, entropyVelocity };
}

function getQWave() {
  if (qwaveModule) return qwaveModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    qwaveModule = require('@sigilnet/QWave');
  } catch (err) {
    qwaveModule = null;
  }
  return qwaveModule;
}

const flattenCoeffs = (coeffs: any): number[] => {
  const out: number[] = [];
  if (Array.isArray(coeffs)) {
    coeffs.forEach((c) => {
      if (Array.isArray(c)) c.forEach((v) => out.push(typeof v === 'number' ? v : 0));
      else if (typeof c === 'number') out.push(c);
    });
  } else if (coeffs && typeof coeffs === 'object') {
    Object.values(coeffs).forEach((v) => {
      if (Array.isArray(v)) v.forEach((x) => out.push(typeof x === 'number' ? x : 0));
    });
  }
  return out;
};

export function measureWaveletEntropy(samples: Float64Array, wavelet: string = 'haar', level?: number): number {
  const qwave = getQWave();
  if (!qwave?.wavedec) {
    return Entropy.measureSpectrumWithWindow(samples);
  }
  try {
    const data = Array.from(samples);
    const resolvedLevel = level ?? Math.max(1, Math.floor(Math.log2(data.length)) - 2);
    const coeffs = qwave.wavedec(data, wavelet, resolvedLevel);
    const flat = flattenCoeffs(coeffs);
    const energy = flat.map((v) => v * v);
    const total = energy.reduce((acc, v) => acc + v, 0);
    if (total <= 0) return 0;
    const probs = energy.map((e) => e / total);
    const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const normEntropy = entropy / Math.log2(Math.max(2, probs.length));
    return clamp01(1 - normEntropy);
  } catch (err) {
    return Entropy.measureSpectrumWithWindow(samples);
  }
}

export function coherenceFromResonator(samples: Float64Array): {
  coherence: number;
  regime: Regime;
  entropyVelocity: number;
} {
  const spectrumEntropy = Entropy.measureSpectrumWithWindow(samples);
  // Coherence proxy: inverse of entropy with a soft cap
  const coherence = clamp01(1 - spectrumEntropy);

  // Track entropy velocity over history
  resonator.history.push(spectrumEntropy);
  if (resonator.history.length > resonator.maxHistory) resonator.history.shift();
  const prev = resonator.history.length > 1 ? resonator.history[resonator.history.length - 2] : spectrumEntropy;
  const entropyVelocity = spectrumEntropy - prev;

  const regime = regimeFromCoherence(coherence, spectrumEntropy);

  return { coherence, regime, entropyVelocity };
}

export function resetResonator(): void {
  resonator.history = [];
  resonator.lastEntropy = undefined;
}
