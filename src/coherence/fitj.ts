// qwormhole/src/coherence/fitJ.ts
export type RegressionOrder = 1 | 2 | 3;

export interface FitResult {
  coeffs: number[];
  residual: number;
  r2: number;
}

export function fitJFunc(
  samples: number[][],
  targets: number[],
  order: RegressionOrder,
): FitResult {
  const n = samples.length;
  if (!n) throw new Error("No samples");
  const m = samples[0].length;
  // Build design matrix
  const X = samples.map(row => {
    const terms = [1, ...row];
    if (order >= 2) {
      for (let i = 0; i < m; i++)
        for (let j = i; j < m; j++) terms.push(row[i] * row[j]);
    }
    if (order === 3) {
      for (let i = 0; i < m; i++)
        for (let j = i; j < m; j++)
          for (let k = j; k < m; k++) terms.push(row[i] * row[j] * row[k]);
    }
    return terms;
  });
  // Normal equations: (XᵀX)β = Xᵀy
  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const XtY = multiplyVec(Xt, targets);
  const beta = solveGaussian(XtX, XtY);
  const preds = X.map(r => dot(r, beta));
  const residuals = targets.map((y, i) => y - preds[i]);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const meanY = targets.reduce((s, y) => s + y, 0) / n;
  const ssTot = targets.reduce((s, y) => s + (y - meanY) ** 2, 0);
  return { coeffs: beta, residual: ssRes, r2: 1 - ssRes / ssTot };
}

// Tiny helpers
function transpose(a: number[][]): number[][] {
  return a[0].map((_, i) => a.map(r => r[i]));
}
function multiply(a: number[][], b: number[][]): number[][] {
  return a.map(r =>
    b[0].map((_, j) => r.reduce((s, _, k) => s + r[k] * b[k][j], 0)),
  );
}
function multiplyVec(a: number[][], v: number[]): number[] {
  return a.map(r => r.reduce((s, x, i) => s + x * v[i], 0));
}
function dot(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}
function solveGaussian(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let j = i + 1; j < n; j++)
      if (Math.abs(M[j][i]) > Math.abs(M[max][i])) max = j;
    [M[i], M[max]] = [M[max], M[i]];
    const pivot = M[i][i];
    if (Math.abs(pivot) < 1e-14)
      throw new Error(
        "fitJFunc: singular or nearly-singular design matrix — add more samples or reduce polynomial order",
      );
    for (let j = i; j <= n; j++) M[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map(r => r[n]);
}

export function checkLyapunovFunc(samples: number[][], _targets: number[]) {
  if (samples.length < 2) return { lambda: 0 };
  let sum = 0,
    count = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].map((x, j) => x - samples[i - 1][j]);
    const normPrev = Math.hypot(...samples[i - 1]);
    const normDx = Math.hypot(...dx);
    const div = Math.log(normDx / (normPrev || 1e-9));
    if (isFinite(div)) {
      sum += div;
      count++;
    }
  }
  const lambda = sum / (count || 1);
  return { lambda, stable: lambda < 0 };
}
