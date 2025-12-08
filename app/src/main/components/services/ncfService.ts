import fs from 'node:fs/promises';
import path from 'node:path';
import {
  NCFSimulation,
  ScenarioMetadata,
  SimulationScenario,
  SimulationState,
  SimulationMetrics,
  Edge,
} from '../simulation';
import {
  getUploadedScenario,
  getUploadedScenarioMetadata,
} from '../uploadStore';
import { execSync } from 'node:child_process';

export interface NCFParams {
  steps?: number;
  nodes?: number;
  edges?: number;
  scenarioPath?: string;
  chaosIntensity?: number;
  entropyAdapterMode?: 'builtin_fft' | 'wavelet' | 'psqs' | 'qwave';
  waveletName?: string;
  waveletLevel?: number;
}

export interface NCFResponse<T = unknown> {
  success: boolean;
  state?: T;
  metrics?: T;
  error?: string;
}

interface ScenarioFile {
  metadata?: Partial<ScenarioMetadata> & {
    name?: string;
  };
  mesh: {
    nodes: number;
    edges: [number, number][];
  };
  initial_state?: {
    probability_distributions?: Record<string, number[]>;
  };
  simulation_parameters?: Record<string, unknown>;
}

const DEFAULT_SCENARIO = path.resolve(
  process.cwd(),
  'examples/entropy_mesh_example.json',
);

function cloneScenario(scenario: SimulationScenario): SimulationScenario {
  return {
    nodes: scenario.nodes,
    edges: scenario.edges.map((edge) => ({ ...edge })),
    distributions: new Map(
      Array.from(scenario.distributions.entries()).map(([key, values]) => [
        key,
        [...values],
      ]),
    ),
    metadata: scenario.metadata ? { ...scenario.metadata } : undefined,
  };
}

export class NCFService {
  private simulation: NCFSimulation;
  private scenarioCache: Map<string, SimulationScenario> = new Map();
  private initialized = false;
  private waveletAdapter?: { measureSpectrum: (samples: Float64Array) => number };
  private fftAdapter?: { measureSpectrum: (samples: Float64Array) => number };
  private qwaveAdapter?: {
    measureSpectrum: (samples: Float64Array) => number;
    coherenceFromResonator?: (
      samples: Float64Array,
    ) => { coherence: number; regime: 'chaos' | 'transitional' | 'coherent'; entropyVelocity: number };
  };

  constructor() {
    this.simulation = new NCFSimulation();
  }

  private waveletCoherence(samples: Float64Array): number {
    if (samples.length < 2) return 0;
    const n = samples.length - (samples.length % 2);
    if (n < 2) return 0;
    const approx: number[] = [];
    const detail: number[] = [];
    for (let i = 0; i < n; i += 2) {
      const a = (samples[i] + samples[i + 1]) / Math.SQRT2;
      const d = (samples[i] - samples[i + 1]) / Math.SQRT2;
      approx.push(a);
      detail.push(d);
    }
    const energy = [...approx, ...detail].map((v) => v * v);
    const total = energy.reduce((acc, v) => acc + v, 0);
    if (total <= 0) return 0;
    const probs = energy.map((e) => e / total);
    const entropy = -probs.reduce(
      (sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0),
      0,
    );
    const normEntropy = entropy / Math.log2(probs.length);
    return Math.max(0, Math.min(1, 1 - normEntropy));
  }

  private async getFFTAdapter(): Promise<{ measureSpectrum: (samples: Float64Array) => number }> {
    if (this.fftAdapter) return this.fftAdapter;
    try {
      const { Entropy } = await import('../services/entropy');
      this.fftAdapter = {
        measureSpectrum: (samples: Float64Array) =>
          Entropy.measureSpectrumWithWindow(samples),
      };
      return this.fftAdapter;
    } catch (err) {
      console.warn('FFT entropy adapter unavailable; falling back to built-in', err);
      this.fftAdapter = { measureSpectrum: () => 0 };
      return this.fftAdapter;
    }
  }

  private async getEntropyAdapter(
    mode?: NCFParams['entropyAdapterMode'],
    opts?: { waveletName?: string; waveletLevel?: number },
  ): Promise<
    | {
        measureSpectrum: (samples: Float64Array) => number;
        coherenceFromResonator?: (
          samples: Float64Array,
        ) => { coherence: number; regime: 'chaos' | 'transitional' | 'coherent'; entropyVelocity: number };
      }
    | undefined
  > {
    if (mode === 'wavelet') {
      if (this.waveletAdapter) return this.waveletAdapter;
      this.waveletAdapter = {
        measureSpectrum: (samples: Float64Array) => this.waveletCoherence(samples),
      };
      return this.waveletAdapter;
    }
    if (mode === 'builtin_fft') {
      return this.getFFTAdapter();
    }
    if (mode === 'psqs') {
      // Prefer wavelet-based entropy/coherence
      const { measureWaveletEntropy, coherenceFromWavelet } = await import('../services/entropy/adapter');
      return {
        measureSpectrum: (samples: Float64Array) =>
          measureWaveletEntropy(samples, opts?.waveletName, opts?.waveletLevel),
        coherenceFromResonator: (samples: Float64Array) =>
          coherenceFromWavelet(samples, opts?.waveletName, opts?.waveletLevel),
      };
    }
    if (mode === 'qwave') {
      if (this.qwaveAdapter) return this.qwaveAdapter;
      try {
        const qwave = await import('@sigilnet/QWave');
        const { measureWaveletEntropy, coherenceFromWavelet } = await import('../services/entropy/adapter');
        const waveletMeasure = (samples: Float64Array): number => {
          try {
            const data = Array.from(samples);
            const level = opts?.waveletLevel ?? Math.max(1, Math.floor(Math.log2(data.length)) - 2);
            // wavedec signature: wavedec(signal, waveletName?, level?)
            const coeffs = (qwave as any).wavedec
              ? (qwave as any).wavedec(data, opts?.waveletName ?? 'haar', level)
              : null;
            const flat: number[] = [];
            if (coeffs && Array.isArray(coeffs)) {
              coeffs.forEach((c: any) => {
                if (Array.isArray(c)) {
                  c.forEach((v) => flat.push(typeof v === 'number' ? v : 0));
                } else if (typeof c === 'number') {
                  flat.push(c);
                }
              });
            } else if (coeffs && typeof coeffs === 'object') {
              Object.values(coeffs).forEach((v: any) => {
                if (Array.isArray(v)) {
                  v.forEach((x) => flat.push(typeof x === 'number' ? x : 0));
                }
              });
            }
            const energy = flat.map((v) => v * v);
            const total = energy.reduce((acc, v) => acc + v, 0);
            if (total <= 0) return 0;
            const probs = energy.map((e) => e / total);
            const entropy = -probs.reduce(
              (sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0),
              0,
            );
            const normEntropy = entropy / Math.log2(Math.max(2, probs.length));
            return Math.max(0, Math.min(1, 1 - normEntropy));
          } catch (err) {
            console.warn('QWave measure failed, falling back to wavelet coherence', err);
            return this.waveletCoherence(samples);
          }
        };
        this.qwaveAdapter = {
          measureSpectrum: (s) =>
            measureWaveletEntropy(Float64Array.from(s), opts?.waveletName, opts?.waveletLevel),
          coherenceFromResonator: (s) =>
            coherenceFromWavelet(Float64Array.from(s), opts?.waveletName, opts?.waveletLevel),
        };
        return this.qwaveAdapter;
      } catch (err) {
        console.warn('QWave adapter unavailable; falling back to FFT', err);
        return this.getFFTAdapter();
      }
    }
    return undefined;
  }

  private normalizeEdgeKey(rawKey: string): string {
    const cleaned = rawKey.replace(/\[|\]|\s/g, '');
    const [source, target] = cleaned
      .split(',')
      .map((segment) => Number(segment));
    return `${source}-${target}`;
  }

  private parseDistributions(rawDistributions: Record<string, number[]>): Map<string, number[]> {
    const distributions = new Map<string, number[]>();
    for (const [key, values] of Object.entries(rawDistributions)) {
      if (!Array.isArray(values) || values.length === 0) {
        continue;
      }
      const numericValues = values.map((val) => Number(val)).filter((val) => Number.isFinite(val));
      if (numericValues.length === 0) {
        continue;
      }
      distributions.set(this.normalizeEdgeKey(key), numericValues);
    }
    return distributions;
  }

  private buildScenarioFromParsed(
    parsed: ScenarioFile,
    sourcePath: string,
    format: string,
  ): SimulationScenario {
    if (!parsed?.mesh) {
      throw new Error('Scenario missing mesh definition');
    }
    const nodes = Number(parsed.mesh.nodes);
    if (!Number.isInteger(nodes) || nodes <= 0) {
      throw new Error('Scenario mesh.nodes must be a positive integer');
    }
    if (!Array.isArray(parsed.mesh.edges) || parsed.mesh.edges.length === 0) {
      throw new Error('Scenario mesh.edges must include at least one edge');
    }
    const edges: Edge[] = parsed.mesh.edges.map((edge, idx) => {
      if (!Array.isArray(edge) || edge.length < 2) {
        throw new Error(`Edge at index ${idx} is not a [source, target] pair`);
      }
      const [source, target] = edge;
      if (!Number.isInteger(source) || !Number.isInteger(target)) {
        throw new Error(`Edge at index ${idx} contains non-integer vertices`);
      }
      if (source < 0 || source >= nodes || target < 0 || target >= nodes) {
        throw new Error(
          `Edge at index ${idx} references node outside range 0-${nodes - 1}`,
        );
      }
      return { source, target };
    });

    const rawDistributions =
      parsed.initial_state?.probability_distributions ?? {};
    const distributions = this.parseDistributions(rawDistributions);

    const resolvedSource = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(process.cwd(), sourcePath);
    const relativeSource = path.relative(process.cwd(), resolvedSource);

    const metadata: ScenarioMetadata = {
      name: parsed.metadata?.name ?? path.basename(sourcePath),
      description: parsed.metadata?.description,
      author: parsed.metadata?.author,
      version: parsed.metadata?.version,
      date: parsed.metadata?.date,
      parameters: parsed.simulation_parameters ?? parsed.metadata?.parameters,
      sourcePath:
        relativeSource && !relativeSource.startsWith('..')
          ? relativeSource
          : resolvedSource,
      format,
    };

    const uploadMetadata = getUploadedScenarioMetadata(resolvedSource);
    if (uploadMetadata) {
      metadata.checksum = uploadMetadata.checksum;
      metadata.sizeBytes = uploadMetadata.sizeBytes;
      metadata.uploadedAt = uploadMetadata.uploadedAt;
      metadata.sourceName = uploadMetadata.sourceName;
      metadata.sourcePath = uploadMetadata.sourcePath;
    }

    return {
      nodes,
      edges,
      distributions,
      metadata,
    };
  }

  private async readScenarioBuffer(filePath: string): Promise<Buffer> {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    const isUploadPath =
      absolute.includes(`${path.sep}uploads${path.sep}`) ||
      absolute.startsWith(`uploads${path.sep}`) ||
      absolute.startsWith(path.resolve(process.cwd(), 'uploads'));
    if (isUploadPath) {
      const upload = getUploadedScenario(absolute);
      if (upload) {
        return upload.buffer;
      }
    }
    try {
      return await fs.readFile(absolute);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read scenario (${absolute}): ${reason}`);
    }
  }

  private async loadScenario(filePath: string): Promise<SimulationScenario> {
    // Auto-detect file type
    const ext = path.extname(filePath).toLowerCase();
    const buffer = await this.readScenarioBuffer(filePath);
    const raw = buffer.toString();

    try {
      if (ext === '.json') {
        const parsed: ScenarioFile = JSON.parse(raw);
        return this.buildScenarioFromParsed(parsed, filePath, 'json');
      } else if (ext === '.py') {
        // Run Python script and parse output
        const result = execSync(`python`, { input: buffer, encoding: 'utf8' });
        const parsed: ScenarioFile = JSON.parse(result);
        return this.buildScenarioFromParsed(parsed, filePath, 'python');
      } else if (ext === '.wl') {
        throw new Error('Wolfram scenario parsing not yet implemented');
      } else if (ext === '.ipynb') {
        const parsed = JSON.parse(raw);
        const cell = parsed.cells.find(
          (c: any) =>
            c.cell_type === 'code' &&
            c.source.some((line: string) => line.includes('mesh')),
        );
        if (!cell) throw new Error('No scenario cell found in notebook');
        const scenarioSource = cell.source.join('');
        const scenarioJson = scenarioSource.match(/{[\s\S]*}/);
        if (!scenarioJson) throw new Error('No scenario JSON found in cell');
        const scenario = JSON.parse(scenarioJson[0]);
        return this.buildScenarioFromParsed(scenario, filePath, 'notebook');
      }
      throw new Error('Unsupported scenario file type');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Scenario parse failed (${filePath}): ${reason}`);
    }
  }

  private async getScenario(filePath?: string): Promise<SimulationScenario> {
    const resolvedPath = filePath
      ? path.resolve(process.cwd(), filePath)
      : DEFAULT_SCENARIO;
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const isUploadPath =
      resolvedPath.includes(`${path.sep}uploads${path.sep}`) ||
      resolvedPath.startsWith(`${uploadsRoot}${path.sep}`) ||
      resolvedPath === uploadsRoot;
    const cached = this.scenarioCache.get(resolvedPath);
    if (cached && !isUploadPath) {
      return cloneScenario(cached);
    }
    const scenario = await this.loadScenario(resolvedPath);
    if (!isUploadPath) {
      this.scenarioCache.set(resolvedPath, scenario);
    }
    return cloneScenario(scenario);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.reset();
    }
  }

  public async run(params: NCFParams = {}): Promise<SimulationState> {
    const scenario = await this.getScenario(params.scenarioPath);
    const entropyAdapter = await this.getEntropyAdapter(params.entropyAdapterMode, {
      waveletName: params.waveletName,
      waveletLevel: params.waveletLevel,
    });
    this.simulation.reset({
      nodes: params.nodes ?? scenario.nodes,
      edges: params.edges ?? scenario.edges.length,
      scenario,
      chaosIntensity: params.chaosIntensity,
      entropyAdapter,
    });
    const steps = Math.max(1, params.steps ?? 1);
    for (let i = 0; i < steps; i++) {
      this.simulation.evolve();
    }
    this.initialized = true;
    return this.simulation.getState();
  }

  public async step(): Promise<SimulationMetrics> {
    await this.ensureInitialized();
    return this.simulation.evolve();
  }

  public async getState(): Promise<SimulationState> {
    await this.ensureInitialized();
    return this.simulation.getState();
  }

  public async reset(params: NCFParams = {}): Promise<SimulationState> {
    const scenario = await this.getScenario(params.scenarioPath);
    const entropyAdapter = await this.getEntropyAdapter(params.entropyAdapterMode, {
      waveletName: params.waveletName,
      waveletLevel: params.waveletLevel,
    });
    this.simulation.reset({
      nodes: params.nodes ?? scenario.nodes,
      edges: params.edges ?? scenario.edges.length,
      scenario,
      chaosIntensity: params.chaosIntensity,
      entropyAdapter,
    });
    const primeSteps = Math.max(1, params.steps ?? 1);
    for (let i = 0; i < primeSteps; i++) {
      this.simulation.evolve();
    }
    this.initialized = true;
    return this.simulation.getState();
  }
}

export const ncfService = new NCFService();
