export type Margin = number; // [0,1]
export type Drift = number; // dM/dt (units per second)
export type Reserve = number; // [0,1]

export interface FieldSample {
  t: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
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
  M: Margin;
  V: Drift;
  R: Reserve;
  H: number;
  confidence?: number;
}

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
