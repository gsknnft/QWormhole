// Canonical snapshot of geometry for world-model and governance
export interface GeometryState {
  model: FitModel;
  Q: number[][];
  b: Vector3;
  T?: number[][][];
  c: number;
  fitStats: {
    samples: number;
    mse: number[];
    r2: number[];
    psdInflation: number;
    psdAttempts: number;
    ridgeLambda: number;
  };
  curvature: CurvatureMetrics;
  stability: StabilityMetrics;
  distortion?: DistortionMetrics;
  conditioning: ConditioningMetrics;
  health: number;
  validity: GeometryValidity;
}

export interface GeometryEvalGrad {
  evaluate(s: Vector3): number;
  gradient(s: Vector3): Vector3;
}

// J-space resolution criteria
export interface JSpaceResolution {
  resolved: boolean;
  reasons: string[];
  gradNorm: number;
  lambdaMin: number;
  deltaJViolationRate: number;
  basinHoldMet: boolean;
  bandResolved?: boolean;
  jSpaceResolved?: boolean;
  geometryTrusted?: boolean;
}

// Hard trust gates for geometry contract
export interface GeometryValidity {
  trusted: boolean;
  reasons: string[];
  minSamplesMet: boolean;
  r2AboveFloor: boolean;
  psdInflationOk: boolean;
  nonDegenerate: boolean;
  stabilityCheckOk: boolean;
  healthOk: boolean;
  lambdaMinOk: boolean;
  lastChecked: number;
}

// Deterministic eigenvalue extraction for symmetric 3x3 matrices

export type SpectralMetrics = {
  lambdaMin: number;
  lambdaMax: number;
  conditionNumber: number;
};

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
  psd_inflation?: number;
  psd_attempts?: number;
  curvatureTrace?: number;
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

export type PSDProjectionResult = {
  Qpsd: number[][];
  inflationUsed: number;
  attempts: number;
};

export type LyapunovCheck = {
  samples: number;
  violations: number;
  violationRate: number;
  minDotV: number;
  maxDotV: number;
  meanDotV: number;
  lastDotV: number;
  p95DeltaJ: number;
  stable: boolean;
};

export interface CurvatureMetrics extends SpectralMetrics {
  trace: number;
}

export interface StabilityMetrics {
  samples: number;
  violations: number;
  violationRate: number;
  minDeltaJ: number;
  maxDeltaJ: number;
  meanDeltaJ: number;
  lastDeltaJ: number;
  p95DeltaJ: number;
  stable: boolean;
}

export interface DistortionMetrics {
  cubicNorm: number;
  dominanceRatio: number;
}

export interface ConditioningMetrics {
  psdInflation: number;
  psdAttempts: number;
  ridgeLambda: number;
}

/**
 * Canonical geometric model of coherence.
 * All stability, contraction, and governance signals
 * are derived projections of this inferred potential field.
 */
export interface CoherenceGeometry {
  model: FitModel;
  Q: number[][];
  b: Vector3;
  T?: number[][][];
  c: number;
  curvature: CurvatureMetrics;
  stability: StabilityMetrics;
  distortion?: DistortionMetrics;
  conditioning: ConditioningMetrics;
  health: number;
  evaluate(s: Vector3): number;
  gradient(s: Vector3): Vector3;
}

export interface FieldSample {
  [key: string]: unknown;
  t: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latency_var?: number;
  errRate: number;
  queueDepth: number;
  queueSlope: number;
  corrSpike?: number;
}

export interface CouplingParams {
  batchSize: number;
  concurrency: number;
  redundancy: number;
  paceMs: number;
}

export interface CoherenceState {
  M: number;
  V: number;
  R: number;
  H: number;
  confidence?: number;
}

export interface CoherencePrimitives {
  getCurrentState: () => CoherenceState;
  getCurrentCoupling: () => CouplingParams;
  estimate: (params: Partial<CouplingParams>) => CoherenceState;
  estimateMargin: (signal: number[]) => number;
  adapt: (
    M: number,
    V: number,
    R: number,
    C?: CoherenceState,
  ) => CouplingParams;
  estimateDrift: (signal: number[]) => number;
  estimateResponsiveness: (signal: number[]) => number;
}

export type CoherenceMode = "observe" | "enforce";

export type CoherenceSet =
  | "BALANCED"
  | "PROTECT"
  | "MACRO_BATCH"
  | "CUSTOM"
  | "OFF"
  | "SAFE";

export interface CoherenceConfig {
  Hmin: number;
  maxDelta: Partial<CouplingParams>;
  floors: Partial<CouplingParams>;
  ceilings: Partial<CouplingParams>;
}
export type Alignment = "stabilizing" | "destabilizing" | "neutral";
export interface NboAttribution {
  index: number;
  weight: number;
  epiplexity: number;
  alignment: Alignment;
}

export interface NboResult {
  origEnt: number;
  origNeg: number;
  scalar: {
    finalEnt: number;
    finalNeg: number;
    epiplexity: number;
    negentropicGain: number;
    stableState: number;
    basinWidthRaw: number;
    basinWidthPenalty: number;
  };
  vector: {
    finalEnt: number;
    finalNeg: number;
    epiplexity: number;
    negentropicGain: number;
    stableStateVector: number[];
    epiplexityPerNode: number[];
    epiplexityWeights: number[];
  };
  bounds: [number, number];
  couplingStrength: number;
}

export interface NboSummary {
  epiplexity: number;
  negentropicGain: number;
  stableState: number;
  basinWidthRaw: number;
  basinWidthPenalty: number;
  topNodes: NboAttribution[];
  bounds: [number, number];
  couplingStrength: number;
  signalLength: number;
  updatedAt: number;
  ageMs: number;
}

export interface NboOptions {
  couplingStrength?: number;
  bounds?: [number, number];
  minProb?: number;
  boundaryMargin?: number;
  boundPenalty?: number;
  ridge?: number;
  coordSweeps?: number;
  tol?: number;
  maxIter?: number;
  curvatureDelta?: number;
}

export interface CoherenceTelemetryEntry {
  t: number;
  state: CoherenceState;
  coupling: CouplingParams;
  sample?: FieldSample;
  nbo?: NboSummary;
  note?: string;
}

export interface CoherenceLoopDeps {
  sampler?: () => FieldSample | null;
  emit?: (entry: CoherenceTelemetryEntry) => void;
}
