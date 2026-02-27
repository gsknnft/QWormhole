// Auto-generated index for coherence
export * from "./adapter";
export * from "./coherence";
export * from "./coherenceStep";
export * from "./commitment-detector";
export * from "./field-stability";
export * from "./governance-signals";
export * from "./invariants";
export * from "./loop";
export * from "./ncf";
export * from "./resolution";
export * from "./run-coherence";
export * from "./sim";
export * from "./telemetry";
export * from "./types";
export * from "./geometric-regime";

// Canonical coherence APIs are re-exported here for transport consumers so
// QWormhole can stop growing stale parallel semantics.
export {
  compareToAttractors,
  featuresFromFrame,
  driftRate,
  computeSpectralNegentropyIndex,
  spectralNegentropyDelta,
  DEFAULT_MAX_GAMMA,
  DEFAULT_POINT_OF_NO_RETURN_RATIO,
  lorentzGamma,
  evaluateLorentzBarrier,
  analyzeLinchpin,
  evaluateStructuralPersistence,
  updateRegimePosterior,
  uniformPosterior,
  posteriorArgmax,
  posteriorEntropy,
  posteriorConfidence,
  REGIME_STATES,
  estimateCorrelationDimension,
  classifyDimensionBand,
} from "@sigilnet/coherence";

export type {
  DriftFeatureFrameInput,
  DriftFeatures,
  LinchpinAnalysis,
  LinchpinObservation,
  LinchpinScore,
  LinchpinMetric,
  LorentzBarrierResult,
  RegimePosterior,
  RegimeObservation,
  CorrelationDimensionResult,
  DimensionBand,
  AttractorComparisonResult,
  SpectralNegentropyResult,
  StructuralPersistenceObservation,
  StructuralPersistenceResult,
} from "@sigilnet/coherence";
