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
