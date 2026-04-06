// Auto-generated index for coherence
export * from "./adapter";
export * from "./coherence";
export * from "./coherenceStep";
export * from "./commitment-detector";
export * from "./field-stability";
export * from "./fitj";
export * from "./geometric-regime";
export * from "./governance-signals";
export * from "./invariants";
export * from "./loop";
export * from "./ncf";
export * from "./resolution";
export * from "./run-coherence";
export * from "./sim";
export * from "./telemetry";
export * from "./types";

// Canonical coherence APIs are re-exported here for transport consumers so
// QWormhole can stop growing stale parallel semantics.
export {
  analyzeLinchpin,
  classifyDimensionBand,
  compareToAttractors,
  computeSpectralNegentropyIndex,
  DEFAULT_MAX_GAMMA,
  DEFAULT_POINT_OF_NO_RETURN_RATIO,
  driftRate,
  estimateCorrelationDimension,
  evaluateLorentzBarrier,
  evaluateStructuralPersistence,
  featuresFromFrame,
  lorentzGamma,
  posteriorArgmax,
  posteriorConfidence,
  posteriorEntropy,
  REGIME_STATES,
  spectralNegentropyDelta,
  uniformPosterior,
  updateRegimePosterior,
} from "@gsknnft/coherence";

export type {
  AttractorComparisonResult,
  CorrelationDimensionResult,
  DimensionBand,
  DriftFeatureFrameInput,
  DriftFeatures,
  LinchpinAnalysis,
  LinchpinMetric,
  LinchpinObservation,
  LinchpinScore,
  LorentzBarrierResult,
  RegimeObservation,
  RegimePosterior,
  SpectralNegentropyResult,
  StructuralPersistenceObservation,
  StructuralPersistenceResult,
} from "@gsknnft/coherence";
