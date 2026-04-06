import {
  GeometryEvalGrad,
  GeometryState,
  JSpaceResolution,
  Vector3,
} from "./types";

const evaluateFromState = (state: GeometryState, s: Vector3): number => {
  const { Q, b, c } = state;
  let cubic = 0;
  if (state.T) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          cubic += (1 / 6) * state.T[i][j][k] * s[i] * s[j] * s[k];
        }
      }
    }
  }

  if (Q && b) {
    // Full form: J(s) = 0.5*s^T Q s + b^T s + (1/6)*T[i,j,k]*si*sj*sk + c
    const sQs = s.reduce((sum, si, i) => {
      const Qs = Q[i].reduce((rowSum, Qij, j) => rowSum + Qij * s[j], 0);
      return sum + si * Qs;
    }, 0);
    const bs = b.reduce((sum, bi, i) => sum + bi * s[i], 0);
    return 0.5 * sQs + bs + cubic + c;
  }
  return cubic + c;
};

const gradientFromState = (state: GeometryState, s: Vector3): Vector3 => {
  const { Q, b } = state;
  // Cubic gradient: d/ds_i [ (1/6) T[i,j,k] si sj sk ] = (1/2) T[i,j,k] sj sk (by symmetry)
  const cubicGrad: Vector3 = [0, 0, 0];
  if (state.T) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          cubicGrad[i] += 0.5 * state.T[i][j][k] * s[j] * s[k];
        }
      }
    }
  }
  if (Q && b) {
    // Full gradient: grad J(s) = Q s + b + cubicGrad
    const Qs = Q.map(row => row.reduce((sum, Qij, j) => sum + Qij * s[j], 0));
    return Qs.map((Qsi, i) => Qsi + b[i] + cubicGrad[i]) as Vector3;
  }
  return cubicGrad;
};

export const bindGeometryOps = (state: GeometryState): GeometryEvalGrad => {
  return {
    evaluate: (s: Vector3) => evaluateFromState(state, s),
    gradient: (s: Vector3) => gradientFromState(state, s),
  };
};

/**
 * Check if system is resolved in J-space (local minimum, descent, basin hold)
 */
export function isJSpaceResolved(
  geometryState: GeometryState,
  currentState: Vector3,
  window: { s: Vector3 }[],
  gradEps = 1e-3,
  lambdaMinFloor = 1e-4,
  deltaJViolationCeil = 0.05,
  basinEps = 1e-2,
  holdDuration = 5,
): JSpaceResolution {
  const reasons: string[] = [];
  const geometry = geometryState;
  const geoTools = bindGeometryOps(geometryState);
  // 1. Local minimum: gradient small, lambda_min > 0
  const grad = geoTools.gradient(currentState);
  const gradNorm = Math.sqrt(grad[0] ** 2 + grad[1] ** 2 + grad[2] ** 2);
  if (gradNorm > gradEps) reasons.push("grad_not_zero");
  if (geometry.curvature.lambdaMin < lambdaMinFloor)
    reasons.push("lambda_min_low");
  // 2. Descent: low deltaJ violation rate
  if (geometry.stability.violationRate > deltaJViolationCeil)
    reasons.push("deltaJ_violations");
  // 3. Basin: J(s) - J_min < eps for hold duration
  let basinHoldMet = false;
  if (window.length >= holdDuration) {
    const Js = window.map(w => geoTools.evaluate(w.s));
    let Jmin = Math.min(...Js);
    if (!geometry.validity.trusted) {
      reasons.push("geometry_untrusted");
    }
    // Quadratic case: minimum at s* = -Q^{-1}b
    // If geometry provides Q and b, compute s* and J_min accordingly
    if (
      geometry.model === "quadratic" &&
      geometry.validity.trusted &&
      geometry.curvature.lambdaMin > lambdaMinFloor
    ) {
      // Solve Qs = -b for s*
      // Assuming Q is 3x3 and invertible
      const Q = geometry.Q;
      const b = geometry.b;
      // Compute Q^{-1}
      const det =
        Q[0][0] * (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1]) -
        Q[0][1] * (Q[1][0] * Q[2][2] - Q[1][2] * Q[2][0]) +
        Q[0][2] * (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0]);
      if (Math.abs(det) > 1e-12) {
        const invQ = [
          [
            (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1]) / det,
            (Q[0][2] * Q[2][1] - Q[0][1] * Q[2][2]) / det,
            (Q[0][1] * Q[1][2] - Q[0][2] * Q[1][1]) / det,
          ],
          [
            (Q[1][2] * Q[2][0] - Q[1][0] * Q[2][2]) / det,
            (Q[0][0] * Q[2][2] - Q[0][2] * Q[2][0]) / det,
            (Q[0][2] * Q[1][0] - Q[0][0] * Q[1][2]) / det,
          ],
          [
            (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0]) / det,
            (Q[0][1] * Q[2][0] - Q[0][0] * Q[2][1]) / det,
            (Q[0][0] * Q[1][1] - Q[0][1] * Q[1][0]) / det,
          ],
        ];
        const sStar: Vector3 = [
          -(invQ[0][0] * b[0] + invQ[0][1] * b[1] + invQ[0][2] * b[2]),
          -(invQ[1][0] * b[0] + invQ[1][1] * b[1] + invQ[1][2] * b[2]),
          -(invQ[2][0] * b[0] + invQ[2][1] * b[1] + invQ[2][2] * b[2]),
        ];
        const JminQuadratic = geoTools.evaluate(sStar);
        // Replace Jmin with quadratic minimum if lower
        if (JminQuadratic < Jmin) {
          Jmin = JminQuadratic;
        }
      }
    }
    const scale = Math.max(1e-6, Math.abs(Jmin));

    const inBasin = Js.map(J => Math.abs(J - Jmin) < basinEps * scale);
    basinHoldMet = inBasin.slice(-holdDuration).every(x => x);
    if (!basinHoldMet) reasons.push("basin_not_held");
  } else {
    reasons.push("insufficient_hold_window");
  }

  const resolved = reasons.length === 0;
  return {
    resolved,
    reasons,
    gradNorm,
    lambdaMin: geometry.curvature.lambdaMin,
    deltaJViolationRate: geometry.stability.violationRate,
    basinHoldMet,
  };
}
