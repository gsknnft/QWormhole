import fs from 'node:fs/promises';
import path from 'node:path';
import {
  NCFSimulation,
  ScenarioMetadata,
  SimulationScenario,
  SimulationState,
  SimulationMetrics,
  Edge,
} from '../components/simulation';
import {
  getUploadedScenario,
  getUploadedScenarioMetadata,
} from '../components/uploadStore';
import { execSync } from 'node:child_process';

export interface NCFParams {
  steps?: number;
  nodes?: number;
  edges?: number;
  scenarioPath?: string;
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

  constructor() {
    this.simulation = new NCFSimulation();
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
    this.simulation.reset({
      nodes: params.nodes ?? scenario.nodes,
      edges: params.edges ?? scenario.edges.length,
      scenario,
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
    this.simulation.reset({
      nodes: params.nodes ?? scenario.nodes,
      edges: params.edges ?? scenario.edges.length,
      scenario,
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
