// coherence/spectral.ts

import { SpectralMetrics } from "./types";

/**
 * Deterministic eigenvalue extraction for symmetric 3x3 matrix.
 * Based on stable cubic characteristic solution.
 */
export function eigenSymmetric3x3(Q: number[][]): SpectralMetrics {
  const m11 = Q[0][0],
    m12 = Q[0][1],
    m13 = Q[0][2];
  const m22 = Q[1][1],
    m23 = Q[1][2];
  const m33 = Q[2][2];

  const trace = m11 + m22 + m33;
  const q = trace / 3;

  const a11 = m11 - q;
  const a22 = m22 - q;
  const a33 = m33 - q;

  const p2 =
    a11 * a11 + a22 * a22 + a33 * a33 + 2 * (m12 * m12 + m13 * m13 + m23 * m23);

  const p = Math.sqrt(p2 / 6);

  if (p === 0) {
    return {
      lambdaMin: q,
      lambdaMax: q,
      conditionNumber: 1,
    };
  }

  // B = (1/p)(Q - qI)
  const b11 = a11 / p;
  const b12 = m12 / p;
  const b13 = m13 / p;
  const b22 = a22 / p;
  const b23 = m23 / p;
  const b33 = a33 / p;

  const detB =
    b11 * (b22 * b33 - b23 * b23) -
    b12 * (b12 * b33 - b23 * b13) +
    b13 * (b12 * b23 - b22 * b13);

  const r = detB / 2;

  const phi = r <= -1 ? Math.PI / 3 : r >= 1 ? 0 : Math.acos(r) / 3;

  const eig1 = q + 2 * p * Math.cos(phi);
  const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  const eig2 = 3 * q - eig1 - eig3;

  const lambdaMin = Math.min(eig1, eig2, eig3);
  const lambdaMax = Math.max(eig1, eig2, eig3);

  return {
    lambdaMin,
    lambdaMax,
    conditionNumber:
      lambdaMin > 0 ? lambdaMax / lambdaMin : Number.POSITIVE_INFINITY,
  };
}
