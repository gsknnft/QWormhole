import type { CoherenceState } from "./types";
import * as tf from '@tensorflow/tfjs';

export const DEFAULT_MIN_RESERVE = 0.2;

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function cosineSimilarity(signal: number[], intent: number[]): number {
  if (!signal.length || !intent.length) return 0;
  if (signal.length !== intent.length) return 0;

  return tf.tidy(() => {
    const a = tf.tensor1d(signal);
    const b = tf.tensor1d(intent);
    const dot = tf.dot(a, b);
    const norms = tf.mul(tf.norm(a), tf.norm(b));
    return dot.div(norms).dataSync()[0];
  });
}

    export function sineSimilarity(signal: number[], intent: number[]): number {
      const cosineSim = cosineSimilarity(signal, intent);
      return Math.sqrt(1 - cosineSim * cosineSim);
    }

    export function euclideanDistance(signal: number[], intent: number[]): number {
      return tf.tidy(() => {
        const a = tf.tensor1d(signal);
        const b = tf.tensor1d(intent);
        return tf.norm(a.sub(b)).dataSync()[0];
      });
    }

    export function computeSignalPower(signal: number[]): number {
      return tf.tidy(() => tf.tensor1d(signal).square().mean().dataSync()[0]);
    }


    export async function signalAlignment(signal: number[], intent: number[]): Promise<{ alignment: number; distance: number; }> {
      const alignment = cosineSimilarity(signal, intent);
      const distance = euclideanDistance(signal, intent);
      console.log(`Signal alignment: ${alignment.toFixed(4)}, Distance: ${distance.toFixed(4)}`);
      return { alignment, distance };
    }



    export async function characterizeNoise(signal: number[]): Promise<{ noise: number; noiseRatio: number; snr: number; entropy: number; }> {
      return tf.tidy(() => {
        const t = tf.tensor1d(signal);
        const mean = t.mean();
        const noise = t.sub(mean).square().mean().dataSync()[0];
        const signalPower = t.square().mean().dataSync()[0];
        const totalPower = signalPower + noise;
        const snr = noise > 0 ? signalPower / noise : Infinity;
        const entropy = -Math.log2(snr / (snr + 1e-12) + 1e-12);
        const noiseRatio = clamp01(noise / (totalPower || 1e-12));
        return { noise, noiseRatio, snr, entropy };
      });
    }

export function computeHorizonSec(
  margin: number,
  drift: number,
  reserve: number,
  minReserve = DEFAULT_MIN_RESERVE,
): number {
  if (drift >= 0) return Number.POSITIVE_INFINITY;
  const effectiveReserve = Math.max(minReserve, clamp01(reserve));
    const d = Math.max(1e-6, Math.abs(drift));
    return (margin / d) * effectiveReserve;
}

export function isUnsafe(state: CoherenceState, minHorizon: number): boolean {
  return state.H < minHorizon;
}
