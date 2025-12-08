import type {
  ScenarioMetadata,
  SimulationMetrics,
  Edge,
  EdgeMetrics,
  SimulationStatePayload,
  AnomalyDetection,
} from '../shared/schemas';

export type {
  ScenarioMetadata,
  SimulationMetrics,
  Edge,
  EdgeMetrics,
  SimulationStatePayload,
  AnomalyDetection,
} from '../shared/schemas';

export type NCFMode = 'macro' | 'defensive' | 'balanced';

export interface SignalData {
  coherence: number[];
  negentropy: number[];
  fieldState: string[];
}

export interface NCFDiagnostics {
  getHistory: (steps?: number) => Promise<NCFResponse<SimulationMetrics[]>>;
  exportCSV: () => Promise<NCFResponse<string>>;
  getHealth: () => Promise<NCFResponse<{ cpu: number; memory: number }>>;
}

export interface NCFParams {
  steps?: number;
  mode?: 'macro' | 'defensive' | 'balanced';
  nodes?: number;
  edges?: number;
  scenarioPath?: string;
  chaosIntensity?: number;
  entropyAdapterMode?: 'builtin_fft' | 'wavelet' | 'psqs' | 'qwave';
  waveletName?: string;
  waveletLevel?: number;
}

export interface SimulationState {
  nodes: number;
  edges: Edge[];
  time: number;
  meshMetrics: SimulationMetrics;
  edgeMetrics: Map<string, EdgeMetrics>;
  history: SimulationMetrics[];
  scenarioMetadata?: ScenarioMetadata;
  anomalies?: AnomalyDetection[];
}

export interface NCFResponse<T = any> {
  success: boolean;
  state?: T;
  metrics?: T;
  error?: string;
}

declare global {
  interface Window {
    ncf: {
      runSimulation: (params: NCFParams) => Promise<NCFResponse<SimulationStatePayload>>;
      step: () => Promise<NCFResponse<SimulationMetrics>>;
      getState: () => Promise<NCFResponse<SimulationStatePayload>>;
      reset: (params: NCFParams) => Promise<NCFResponse<SimulationStatePayload>>;
      uploadScenario: (payload: { name: string; type: string; data: ArrayBuffer; saveToFile?: boolean }) => Promise<NCFResponse<{ path?: string; name?: string; checksum?: string; size?: number }>>;
    } & NCFDiagnostics;
    quantum: {
      platform: string;
      version: string;
      decide: (signalData: any, fieldStateData: any) => Promise<any>;
      updateParams: (params: Partial<any>) => Promise<any>;
      measure: (baseConfidence: number) => Promise<any>;
      getStatus: () => Promise<any>;
      getMetrics: () => Promise<any>;
      getErrors: () => Promise<any>;
      getHealth: () => Promise<any>;
      getHistory: (count?: number) => Promise<any[]>;
      getHistoryStats: () => Promise<any>;
      exportHistory: (count?: number) => Promise<string>;
      clearHistory: () => Promise<{ success: boolean }>;
    };
  }
}
