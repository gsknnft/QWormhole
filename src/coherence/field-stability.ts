
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

import { computeHealth, certifyGeometryContract } from "./geometry";
import { eigenSymmetric3x3 } from "./spectral";
import {
  CoherenceState,
  CoherenceGeometry,
  GeometryState,
  CoherenceSample,
  FitJOptions,
  FitJResult,
  FitModel,
  FitSample,
  FitStats,
  LyapunovCheck,
  LyapunovOptions,
  PSDProjectionResult,
  Vector3
} from "./types";

export const minimumSamplesForModel = (model: FitModel) => {
  const featureCount = model === "cubic" ? 10 : 4;
  return Math.max(featureCount + 1, featureCount * 2);
};


// Build a canonical GeometryState snapshot from certified geometry
export function buildGeometryState(
  geometry: CoherenceGeometry,
  fitStats: FitStats,
  ridgeLambda: number,
): GeometryState {
  const fitStatsObj = {
    samples: fitStats.samples,
    mse: fitStats.mse,
    r2: fitStats.r2,
    psdInflation: fitStats.psd_inflation ?? 0,
    psdAttempts: fitStats.psd_attempts ?? 0,
    ridgeLambda,
  };
  const state: Omit<GeometryState, "validity"> = {
    model: geometry.model,
    Q: geometry.Q,
    b: geometry.b,
    T: geometry.T,
    c: geometry.c,
    fitStats: fitStatsObj,
    curvature: geometry.curvature,
    stability: geometry.stability,
    distortion: geometry.distortion,
    conditioning: geometry.conditioning,
    health: geometry.health,
  };
  const validity = certifyGeometryContract(state);
  return { ...state, validity };
}

export const buildSamples = (buffer: CoherenceSample[]): FitSample[] => {
  const samples: FitSample[] = [];
  for (let i = 1; i < buffer.length; i += 1) {
    const prev = buffer[i - 1];
    const current = buffer[i];
    const dt = Math.max(0.001, (current.t - prev.t) / 1000);
    if (!Number.isFinite(dt)) continue;
    const s = toVector(current.state);
    const prevS = toVector(prev.state);
    const delta: Vector3 = [s[0] - prevS[0], s[1] - prevS[1], s[2] - prevS[2]];
    const dotS: Vector3 = [delta[0] / dt, delta[1] / dt, delta[2] / dt];
    samples.push({ t: current.t, s, delta, dotS });
  }
  return samples;
};

// Minimal PSD projection for 3x3 symmetric matrix
// Deterministic PSD enforcement via minimal diagonal inflation + Cholesky
export const projectPSD = (Q: number[][], eps = 1e-10): PSDProjectionResult => {
  const A = symmetrizeQ(Q);
  const trace = A[0][0] + A[1][1] + A[2][2];
  const scale = Math.max(Math.abs(trace), 1);
  const maxInflation = scale * 1e6;
  let attempts = 0;
  let inflation = 0;

  const tryCholesky = (M: number[][]): number[][] | null => {
    const L = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = M[i][j];
        for (let k = 0; k < j; k++) {
          sum -= L[i][k] * L[j][k];
        }

        if (i === j) {
          if (sum <= eps) return null;
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }

    return L;
  };

  while (inflation < maxInflation) {
    attempts++;
    const M = [
      [A[0][0] + inflation, A[0][1], A[0][2]],
      [A[1][0], A[1][1] + inflation, A[1][2]],
      [A[2][0], A[2][1], A[2][2] + inflation],
    ];

    const L = tryCholesky(M);
    if (L) {
      // Reconstruct Q_psd = L Lᵀ
      const Qpsd = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          for (let k = 0; k < 3; k++) {
            Qpsd[i][j] += L[i][k] * L[j][k];
          }
        }
      }
      return {
        Qpsd,
        inflationUsed: inflation,
        attempts,
      };
    }

    inflation = inflation === 0 ? eps : inflation * 2;
  }

  throw new Error("projectPSD: unable to enforce PSD via Cholesky inflation.");
};

// Returns a partial geometry (Q, b, T, c, grad, stats)
export const fitGeometry = (
  samples: FitSample[],
  options: FitJOptions = {},
): Omit<
  CoherenceGeometry,
  | "curvature"
  | "stability"
  | "distortion"
  | "conditioning"
  | "health"
  | "evaluate"
  | "gradient"
> & {
  grad: (s: Vector3) => Vector3;
  stats: FitStats;
} => {
  const model = options.model ?? "quadratic";
  const regularization = options.regularization ?? 1e-6;
  const controlLaw = options.controlLaw;
  const features = samples.map(sample => buildFeatures(sample.s, model));
  const featureCount = features[0]?.length ?? 0;
  if (featureCount === 0) {
    throw new Error("fitJ requires at least one sample.");
  }

  const targets = samples.map(sample => {
    const u = controlLaw ? controlLaw(sample.s) : ([0, 0, 0] as Vector3);
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
      // cubic: coeffs = [Q(i,0..2), T(i,00,01,02,11,12,22), b(i)]
      Q[i][0] = coeffs[0];
      Q[i][1] = coeffs[1];
      Q[i][2] = coeffs[2];

      const tCoeffs = coeffs.slice(3, 9); // 6 terms
      if (T) {
        // map unique terms into symmetric T[i][j][k]
        // order: 00,01,02,11,12,22
        const [t00, t01, t02, t11, t12, t22] = tCoeffs;

        T[i][0][0] = t00;
        T[i][0][1] = t01;
        T[i][1][0] = t01;
        T[i][0][2] = t02;
        T[i][2][0] = t02;

        T[i][1][1] = t11;
        T[i][1][2] = t12;
        T[i][2][1] = t12;

        T[i][2][2] = t22;
      }

      b[i] = coeffs[9];
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
  // Project Q to PSD for governance-grade convexity
  const { Qpsd, inflationUsed, attempts } = projectPSD(symQ);
  const symT = T ? symmetrizeT(T) : undefined;
  const curvatureTrace = Qpsd[0][0] + Qpsd[1][1] + Qpsd[2][2];

  // --- Spectral curvature extraction (λ_min, λ_max, condition number) ---

  // Ensure b is always a Vector3 (length 3)
  const bVec: Vector3 = [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0];
  return {
    model,
    Q: Qpsd,
    b: bVec,
    T: symT,
    c: 0,
    grad: (s: Vector3) => gradient(s, Qpsd, bVec, symT),
    stats: {
      samples: samples.length,
      mse,
      r2,
      psd_inflation: inflationUsed,
      psd_attempts: attempts,
      curvatureTrace,
    },
  };
};

// Certifies a full CoherenceGeometry contract from a partial geometry and samples
export function certifyGeometry(
  partial: ReturnType<typeof fitGeometry>,
  samples: FitSample[],
  ridgeLambda: number,
): CoherenceGeometry {
  const Q = partial.Q;
  const curvatureTrace = Q[0][0] + Q[1][1] + Q[2][2];
  const spectral = eigenSymmetric3x3(Q);
  const curvature = {
    trace: curvatureTrace,
    lambdaMin: spectral.lambdaMin,
    lambdaMax: spectral.lambdaMax,
    conditionNumber: spectral.conditionNumber,
  };

  // Lyapunov certification
  const stab = checkLyapunov(
    {
      model: partial.model,
      Q,
      b: partial.b,
      T: partial.T,
      c: partial.c,
      grad: partial.grad,
      stats: partial.stats,
    },
    samples,
  );
  const stability = {
    samples: stab.samples,
    violations: stab.violations,
    violationRate: stab.violationRate,
    minDeltaJ: stab.minDotV,
    maxDeltaJ: stab.maxDotV,
    meanDeltaJ: stab.meanDotV,
    lastDeltaJ: stab.lastDotV,
    p95DeltaJ: stab.p95DeltaJ,
    stable: stab.stable,
  };

  // Cubic distortion metrics
  let distortion = undefined;
  if (partial.T) {
    // Compute cubic norm and dominance ratio
    let cubicNorm = 0;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) cubicNorm += partial.T[i][j][k] ** 2;
    cubicNorm = Math.sqrt(cubicNorm);
    const dominanceRatio =
      curvature.lambdaMin > 0
        ? cubicNorm / curvature.lambdaMin
        : Number.POSITIVE_INFINITY;
    distortion = { cubicNorm, dominanceRatio };
  }

  // Conditioning telemetry
  const conditioning = {
    psdInflation: partial.stats.psd_inflation ?? 0,
    psdAttempts: partial.stats.psd_attempts ?? 0,
    ridgeLambda,
  };

  // Health scalar
  const health = computeHealth(curvature, stability, distortion, conditioning);

  // Evaluate and gradient methods
  const evaluate = (s: Vector3) =>
    evaluateJ(s, {
      model: partial.model,
      Q,
      b: partial.b,
      T: partial.T,
      c: partial.c,
      grad: partial.grad,
      stats: partial.stats,
    });
  const grad = (s: Vector3) => gradient(s, Q, partial.b, partial.T);

  return {
    model: partial.model,
    Q,
    b: partial.b,
    T: partial.T,
    c: partial.c,
    curvature,
    stability,
    distortion,
    conditioning,
    health,
    evaluate,
    gradient: grad,
  };
}
// ...existing code...

export const checkLyapunov = (
  fit: FitJResult,
  samples: FitSample[],
  options: LyapunovOptions = {},
): LyapunovCheck => {
  const tolerance = options.tolerance ?? 0;

  const transitions = Math.max(samples.length - 1, 0);
  if (transitions === 0) {
    return {
      samples: 0,
      violations: 0,
      violationRate: 0,
      minDotV: 0,
      maxDotV: 0,
      meanDotV: 0,
      lastDotV: 0,
      p95DeltaJ: 0,
      stable: true,
    };
  }

  const deltaJs: number[] = [];
  let violations = 0;

  let prevJ = evaluateJ(samples[0].s, fit);

  for (let i = 1; i < samples.length; i++) {
    const currJ = evaluateJ(samples[i].s, fit);
    const deltaJ = currJ - prevJ;

    deltaJs.push(deltaJ);
    if (deltaJ > tolerance) violations++;

    prevJ = currJ;
  }

  const sorted = [...deltaJs].sort((a, b) => a - b);

  const minDotV = sorted[0];
  const maxDotV = sorted[sorted.length - 1];
  const meanDotV = deltaJs.reduce((acc, v) => acc + v, 0) / deltaJs.length;
  const lastDotV = deltaJs[deltaJs.length - 1];

  const p95Index = Math.floor(0.95 * (sorted.length - 1));
  const p95DeltaJ = sorted[p95Index];

  return {
    samples: transitions,
    violations,
    violationRate: violations / transitions,
    minDotV,
    maxDotV,
    meanDotV,
    lastDotV,
    stable: maxDotV <= tolerance,
    p95DeltaJ,
    ...(p95DeltaJ > tolerance
      ? { warning: "High 95th percentile ΔJ may indicate instability risk." }
      : {}),
  };
};

const toVector = (state: CoherenceState): Vector3 => [
  state.M,
  state.V,
  state.R,
];

const buildFeatures = (s: Vector3, model: FitModel): number[] => {
  if (model === "cubic") {
    const s0 = s[0],
      s1 = s[1],
      s2 = s[2];
    return [
      // linear
      s0,
      s1,
      s2,
      // unique quadratic monomials (j <= k)
      s0 * s0,
      s0 * s1,
      s0 * s2,
      s1 * s1,
      s1 * s2,
      s2 * s2,
      // bias
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

export const evaluateJ = (s: Vector3, fit: FitJResult): number => {
  const { Q, b, T, c } = fit;
  //
  // Quadratic part
  const quad =
    0.5 *
    (s[0] * (Q[0][0] * s[0] + Q[0][1] * s[1] + Q[0][2] * s[2]) +
      s[1] * (Q[1][0] * s[0] + Q[1][1] * s[1] + Q[1][2] * s[2]) +
      s[2] * (Q[2][0] * s[0] + Q[2][1] * s[1] + Q[2][2] * s[2]));

  const linear = b[0] * s[0] + b[1] * s[1] + b[2] * s[2];

  let cubic = 0;
  if (T) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          cubic += (1 / 6) * T[i][j][k] * s[i] * s[j] * s[k];
        }
      }
    }
  }

  return quad + linear + cubic + c;
};

// Fully symmetrize T over all i, j, k
const symmetrizeT = (t: number[][][]) => {
  const result = t.map(layer => layer.map(row => row.slice()));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        const perms = [
          t[i][j][k],
          t[i][k][j],
          t[j][i][k],
          t[j][k][i],
          t[k][i][j],
          t[k][j][i],
        ];
        const avg = perms.reduce((a, b) => a + b, 0) / 6;
        result[i][j][k] = avg;
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
  const cubicGrad = (i: number) => {
    if (!t) return 0;
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        sum += t[i][j][k] * s[j] * s[k];
      }
    }
    return 0.5 * sum;
  };

  return [
    q[0][0] * s[0] + q[0][1] * s[1] + q[0][2] * s[2] + b[0] + cubicGrad(0),
    q[1][0] * s[0] + q[1][1] * s[1] + q[1][2] * s[2] + b[1] + cubicGrad(1),
    q[2][0] * s[0] + q[2][1] * s[1] + q[2][2] * s[2] + b[2] + cubicGrad(2),
  ];
};

// Optimized dot product for Vector3 - OLD
// We have switched to lyapunov checks based on J(s) differences, so this is less critical, but can be used for gradient-based control if desired
export const dot = (a: Vector3, b: Vector3): number => {
  // Unrolled for performance, avoids loop overhead
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

const dotArray = (a: number[], b: number[]) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
};
