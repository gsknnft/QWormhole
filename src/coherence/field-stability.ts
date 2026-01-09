// qwormhole/src/coherence/field-stability.ts
// ## Field-Stability.ts - Coherence field stability analysis and fitting utilities

// Fits J(s) models to coherence state trajectories for Lyapunov stability checks
// Uses quadratic/cubic forms to model dynamics: dS/dt = -∇J(S) + U(t)
// Provides Lyapunov stability checks based on fitted models
// Assumes CoherenceState with M, V, R components
// Integrates with coherence loop for real-time stability monitoring
// and adaptation based on fitted dynamics
// Depends on linear algebra utilities (e.g., matrix solve, dot product)
// Ties to coherence loop: Uses M(t), V(t); adds resonance check for binding event


import { CoherenceState } from "./types";

export type Vector3 = [number, number, number];

export type CoherenceSample = {
  t: number;
  state: CoherenceState;
};

export type FitSample = {
  t: number;
  s: Vector3;
  delta: Vector3;
  dotS: Vector3;
};

export type FitModel = "quadratic" | "cubic";

export type FitJOptions = {
  model?: FitModel;
  regularization?: number;
  controlLaw?: (s: Vector3) => Vector3;
};

export type FitStats = {
  samples: number;
  mse: number[];
  r2: number[];
};

export type FitJResult = {
  model: FitModel;
  Q: number[][];
  b: number[];
  T?: number[][][];
  c: number;
  grad: (s: Vector3) => Vector3;
  stats: FitStats;
};

export type LyapunovOptions = {
  tolerance?: number;
};

export type LyapunovCheck = {
  samples: number;
  violations: number;
  violationRate: number;
  minDotV: number;
  maxDotV: number;
  meanDotV: number;
  lastDotV: number;
  stable: boolean;
};

export const minimumSamplesForModel = (model: FitModel) => {
  const featureCount = model === "cubic" ? 13 : 4;
  return Math.max(featureCount + 1, featureCount * 2);
};

export const buildSamples = (buffer: CoherenceSample[]): FitSample[] => {
  const samples: FitSample[] = [];
  for (let i = 1; i < buffer.length; i += 1) {
    const prev = buffer[i - 1];
    const current = buffer[i];
    const dt = Math.max(0.001, (current.t - prev.t) / 1000);
    if (!Number.isFinite(dt)) continue;
    const s = toVector(current.state);
    const prevS = toVector(prev.state);
    const delta: Vector3 = [
      s[0] - prevS[0],
      s[1] - prevS[1],
      s[2] - prevS[2],
    ];
    const dotS: Vector3 = [
      delta[0] / dt,
      delta[1] / dt,
      delta[2] / dt,
    ];
    samples.push({ t: current.t, s, delta, dotS });
  }
  return samples;
};

export const fitJ = (samples: FitSample[], options: FitJOptions = {}): FitJResult => {
  const model = options.model ?? "quadratic";
  const regularization = options.regularization ?? 1e-6;
  const controlLaw = options.controlLaw;
  const features = samples.map(sample => buildFeatures(sample.s, model));
  const featureCount = features[0]?.length ?? 0;
  if (featureCount === 0) {
    throw new Error("fitJ requires at least one sample.");
  }

  const targets = samples.map(sample => {
    const u = controlLaw ? controlLaw(sample.s) : [0, 0, 0] as Vector3;
    return [
      -sample.dotS[0] + u[0],
      -sample.dotS[1] + u[1],
      -sample.dotS[2] + u[2],
    ] as Vector3;
  });

  const Q: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b: number[] = [0, 0, 0];
  const T: number[][][] | undefined =
    model === "cubic"
      ? [
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
        ]
      : undefined;

  const mse: number[] = [];
  const r2: number[] = [];

  for (let i = 0; i < 3; i += 1) {
    const y = targets.map(target => target[i]);
    const coeffs = solveRidge(features, y, regularization);

    if (model === "cubic") {
      Q[i][0] = coeffs[0];
      Q[i][1] = coeffs[1];
      Q[i][2] = coeffs[2];
      const tCoeffs = coeffs.slice(3, 12);
      if (T) {
        T[i][0][0] = tCoeffs[0];
        T[i][0][1] = tCoeffs[1];
        T[i][0][2] = tCoeffs[2];
        T[i][1][0] = tCoeffs[3];
        T[i][1][1] = tCoeffs[4];
        T[i][1][2] = tCoeffs[5];
        T[i][2][0] = tCoeffs[6];
        T[i][2][1] = tCoeffs[7];
        T[i][2][2] = tCoeffs[8];
      }
      b[i] = coeffs[12];
    } else {
      Q[i][0] = coeffs[0];
      Q[i][1] = coeffs[1];
      Q[i][2] = coeffs[2];
      b[i] = coeffs[3];
    }

    const { mse: mseValue, r2: r2Value } = scoreFit(features, y, coeffs);
    mse.push(mseValue);
    r2.push(r2Value);
  }

  const symQ = symmetrizeQ(Q);
  const symT = T ? symmetrizeT(T) : undefined;

  return {
    model,
    Q: symQ,
    b,
    T: symT,
    c: 0,
    grad: (s: Vector3) => gradient(s, symQ, b, symT),
    stats: {
      samples: samples.length,
      mse,
      r2,
    },
  };
};

export const checkLyapunov = (
  fit: FitJResult,
  samples: FitSample[],
  options: LyapunovOptions = {},
): LyapunovCheck => {
  const tolerance = options.tolerance ?? 0;
  let violations = 0;
  let minDotV = Number.POSITIVE_INFINITY;
  let maxDotV = Number.NEGATIVE_INFINITY;
  let sumDotV = 0;
  let lastDotV = 0;

  for (const sample of samples) {
    const grad = fit.grad(sample.s);
    const dotV = dot(grad, sample.dotS);
    if (dotV > tolerance) violations += 1;
    minDotV = Math.min(minDotV, dotV);
    maxDotV = Math.max(maxDotV, dotV);
    sumDotV += dotV;
    lastDotV = dotV;
  }

  const count = samples.length;
  const meanDotV = count > 0 ? sumDotV / count : 0;

  return {
    samples: count,
    violations,
    violationRate: count > 0 ? violations / count : 0,
    minDotV: Number.isFinite(minDotV) ? minDotV : 0,
    maxDotV: Number.isFinite(maxDotV) ? maxDotV : 0,
    meanDotV,
    lastDotV,
    stable: violations === 0,
  };
};

const toVector = (state: CoherenceState): Vector3 => [state.M, state.V, state.R];

const buildFeatures = (s: Vector3, model: FitModel): number[] => {
  if (model === "cubic") {
    return [
      s[0],
      s[1],
      s[2],
      s[0] * s[0],
      s[0] * s[1],
      s[0] * s[2],
      s[1] * s[0],
      s[1] * s[1],
      s[1] * s[2],
      s[2] * s[0],
      s[2] * s[1],
      s[2] * s[2],
      1,
    ];
  }
  return [s[0], s[1], s[2], 1];
};

const solveRidge = (x: number[][], y: number[], lambda: number): number[] => {
  const rows = x.length;
  const cols = x[0]?.length ?? 0;
  const xtx: number[][] = Array.from({ length: cols }, () =>
    Array.from({ length: cols }, () => 0),
  );
  const xty: number[] = Array.from({ length: cols }, () => 0);

  for (let r = 0; r < rows; r += 1) {
    const row = x[r];
    const yv = y[r];
    for (let c = 0; c < cols; c += 1) {
      const v = row[c];
      xty[c] += v * yv;
      for (let k = 0; k < cols; k += 1) {
        xtx[c][k] += v * row[k];
      }
    }
  }

  for (let i = 0; i < cols; i += 1) {
    xtx[i][i] += lambda;
  }

  return solveLinearSystem(xtx, xty);
};

const solveLinearSystem = (a: number[][], b: number[]): number[] => {
  const n = a.length;
  const m: number[][] = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(m[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(m[row][col]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }

    if (pivotValue < 1e-12) {
      return Array.from({ length: n }, () => 0);
    }

    if (pivotRow !== col) {
      const temp = m[col];
      m[col] = m[pivotRow];
      m[pivotRow] = temp;
    }

    const pivot = m[col][col];
    for (let j = col; j < n + 1; j += 1) {
      m[col][j] /= pivot;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      if (factor === 0) continue;
      for (let j = col; j < n + 1; j += 1) {
        m[row][j] -= factor * m[col][j];
      }
    }
  }

  return m.map(row => row[n]);
};

const scoreFit = (x: number[][], y: number[], coeffs: number[]) => {
  const mean = y.reduce((sum, value) => sum + value, 0) / y.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < y.length; i += 1) {
    const pred = dotArray(x[i], coeffs);
    const diff = y[i] - pred;
    ssRes += diff * diff;
    const delta = y[i] - mean;
    ssTot += delta * delta;
  }
  const mse = y.length > 0 ? ssRes / y.length : 0;
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return { mse, r2 };
};

const symmetrizeQ = (q: number[][]) => {
  const result: number[][] = [
    [q[0][0], q[0][1], q[0][2]],
    [q[1][0], q[1][1], q[1][2]],
    [q[2][0], q[2][1], q[2][2]],
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = i + 1; j < 3; j += 1) {
      const avg = 0.5 * (result[i][j] + result[j][i]);
      result[i][j] = avg;
      result[j][i] = avg;
    }
  }
  return result;
};

const symmetrizeT = (t: number[][][]) => {
  const result = t.map(layer =>
    layer.map(row => row.slice()),
  );
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      for (let k = j + 1; k < 3; k += 1) {
        const avg = 0.5 * (result[i][j][k] + result[i][k][j]);
        result[i][j][k] = avg;
        result[i][k][j] = avg;
      }
    }
  }
  return result;
};

const gradient = (
  s: Vector3,
  q: number[][],
  b: number[],
  t?: number[][][],
): Vector3 => {
  const g0 =
    q[0][0] * s[0] +
    q[0][1] * s[1] +
    q[0][2] * s[2] +
    b[0] +
    (t
      ? t[0][0][0] * s[0] * s[0] +
        t[0][0][1] * s[0] * s[1] +
        t[0][0][2] * s[0] * s[2] +
        t[0][1][0] * s[1] * s[0] +
        t[0][1][1] * s[1] * s[1] +
        t[0][1][2] * s[1] * s[2] +
        t[0][2][0] * s[2] * s[0] +
        t[0][2][1] * s[2] * s[1] +
        t[0][2][2] * s[2] * s[2]
      : 0);
  const g1 =
    q[1][0] * s[0] +
    q[1][1] * s[1] +
    q[1][2] * s[2] +
    b[1] +
    (t
      ? t[1][0][0] * s[0] * s[0] +
        t[1][0][1] * s[0] * s[1] +
        t[1][0][2] * s[0] * s[2] +
        t[1][1][0] * s[1] * s[0] +
        t[1][1][1] * s[1] * s[1] +
        t[1][1][2] * s[1] * s[2] +
        t[1][2][0] * s[2] * s[0] +
        t[1][2][1] * s[2] * s[1] +
        t[1][2][2] * s[2] * s[2]
      : 0);
  const g2 =
    q[2][0] * s[0] +
    q[2][1] * s[1] +
    q[2][2] * s[2] +
    b[2] +
    (t
      ? t[2][0][0] * s[0] * s[0] +
        t[2][0][1] * s[0] * s[1] +
        t[2][0][2] * s[0] * s[2] +
        t[2][1][0] * s[1] * s[0] +
        t[2][1][1] * s[1] * s[1] +
        t[2][1][2] * s[1] * s[2] +
        t[2][2][0] * s[2] * s[0] +
        t[2][2][1] * s[2] * s[1] +
        t[2][2][2] * s[2] * s[2]
      : 0);
  return [g0, g1, g2];
};

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const dotArray = (a: number[], b: number[]) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
};
