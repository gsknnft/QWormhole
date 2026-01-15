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

export interface CoherenceTelemetryEntry {
  t: number;
  state: CoherenceState;
  coupling: CouplingParams;
  sample?: FieldSample;
  note?: string;
}

export interface CoherenceLoopDeps {
  sampler?: () => FieldSample | null;
  emit?: (entry: CoherenceTelemetryEntry) => void;
}
