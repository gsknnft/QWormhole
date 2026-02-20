
import {
  ConditioningMetrics,
  CurvatureMetrics,
  DistortionMetrics,
  GeometryState,
  GeometryValidity,
  StabilityMetrics,
} from "./types";

// Evaluate geometry contract trustworthiness
export function certifyGeometryContract(
  state: Omit<GeometryState, "validity">,
  minSamples = 16,
  r2Floor = 0.5,
  psdInflationCeil = 1e-2,
  healthCeil = 1.0,
  lambdaMinFloor = 1e-4,
): GeometryValidity {
  const reasons: string[] = [];
  const minSamplesMet = (state.fitStats.samples ?? 0) >= minSamples;
  if (!minSamplesMet) reasons.push("insufficient_samples");
  const r2AboveFloor = state.fitStats.r2?.every(r2 => r2 >= r2Floor) ?? false;
  if (!r2AboveFloor) reasons.push("low_r2");
  const psdInflationOk = (state.fitStats.psdInflation ?? 0) <= psdInflationCeil;
  if (!psdInflationOk) reasons.push("psd_inflation");
  const nonDegenerate = !(
    state.Q.flat().every(x => x === 0) && state.b.every(x => x === 0)
  );
  const conditionOk = state.curvature.conditionNumber < 1e6;
  if (!conditionOk) reasons.push("ill_conditioned");
  if (!nonDegenerate) reasons.push("degenerate_solution");
  const stabilityCheckOk = state.stability.samples > 0;
  if (!stabilityCheckOk) reasons.push("no_stability_check");
  const healthOk = state.health < healthCeil;
  if (!healthOk) reasons.push("health_high");
  const lambdaMinOk = state.curvature.lambdaMin > lambdaMinFloor;
  if (!lambdaMinOk) reasons.push("lambda_min_low");
  const trusted =
    minSamplesMet &&
    r2AboveFloor &&
    psdInflationOk &&
    nonDegenerate &&
    stabilityCheckOk &&
    healthOk &&
    lambdaMinOk;
  return {
    trusted,
    reasons,
    minSamplesMet,
    r2AboveFloor,
    psdInflationOk,
    nonDegenerate,
    stabilityCheckOk,
    healthOk,
    lambdaMinOk,
    lastChecked: Date.now(),
  };
}
// coherence/geometry.ts
// Canonical CoherenceGeometry contract: all governance, health, and diagnostics are projections of this substrate.

/**
 * Deterministic, bounded, monotonic health scalar for governance.
 * Lower is healthier. 0 = ideal, >1 = escalation.
 */
export function computeHealth(
  curvature: CurvatureMetrics,
  stability: StabilityMetrics,
  distortion: DistortionMetrics | undefined,
  conditioning: ConditioningMetrics,
): number {
  // const eps = 1e-8;
  // Weights can be tuned for domain, but must be fixed for auditability
  const w1 = 1.0; // violationRate
  const w2 = 0.5; // maxDeltaJ
  const w3 = 0.5; // 1/lambdaMin
  const w4 = 0.25; // dominanceRatio
  const w5 = 0.25; // psdInflation (normalized)

  // Normalize psdInflation to [0,1] by dividing by a large but finite max (e.g., 1e-2)
  const psdInflationNorm = Math.min(conditioning.psdInflation / 1e-2, 1);
  const dominance = distortion ? distortion.dominanceRatio : 0;
  const contractionPenalty =
    curvature.lambdaMin > 0 ? 1 / (curvature.lambdaMin + 1e-6) : 1e3;

  // Health is a deterministic, monotonic projection
  const health =
    w1 * stability.violationRate +
    w2 * Math.max(0, stability.maxDeltaJ) +
    w3 * contractionPenalty +
    w4 * dominance +
    w5 * psdInflationNorm;

  return health;
}
