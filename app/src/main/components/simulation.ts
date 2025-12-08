import { deriveCoherence } from '@sigilnet/fft-legacy';
import {
  ZERO_FIXED_POINT,
  averageFixedPoint,
  compareFixedPoint,
  subtractFixedPoint,
  toFixedPoint,
} from '@gsknnft/bigint-buffer';

/**
 * Negentropic Coupling Framework - TypeScript Simulation Module
 * Author: gsknnft (SigilNet Core Research)
 * Version: 1.0
 *
 * Quantum-Electron secure implementation with hardened NCF dynamics
 */

export interface Edge {
  source: number;
  target: number;
}

export interface ScenarioMetadata {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  date?: string;
  parameters?: Record<string, unknown>;
  sourcePath?: string;
  format?: string;
  checksum?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  sourceName?: string;
}

export interface SimulationMetrics {
  negentropy: string;
  coherence: string;
  velocity: string;
  time: number;
  throughput?: string;
  loss?: string;
  regime?: 'chaos' | 'transitional' | 'coherent';
  entropyVelocity?: string;
}

export interface EdgeMetrics {
  entropy: string;
  negentropy: string;
  coherence: string;
  velocity: string;
  policy: 'macro' | 'defensive' | 'balanced';
  loss?: string;
  regime?: 'chaos' | 'transitional' | 'coherent';
}

export interface SimulationState {
  nodes: number;
  edges: Edge[];
  time: number;
  meshMetrics: SimulationMetrics;
  edgeMetrics: Map<string, EdgeMetrics>;
  history: SimulationMetrics[];
  scenarioMetadata?: ScenarioMetadata;
}

export interface SimulationScenario {
  nodes: number;
  edges: Edge[];
  distributions: Map<string, number[]>;
  metadata?: ScenarioMetadata;
}

export interface SimulationOptions {
  nodes?: number;
  edges?: number;
  scenario?: SimulationScenario;
  chaosIntensity?: number;
  entropyAdapter?: {
    measureSpectrum: (samples: Float64Array) => number;
    coherenceFromResonator?: (
      samples: Float64Array,
    ) => { coherence: number; regime: 'chaos' | 'transitional' | 'coherent'; entropyVelocity: number };
  };
}

const MACRO_THRESHOLD = toFixedPoint(0.8);
const DEFENSIVE_THRESHOLD = toFixedPoint(0.3);
const BASE_LOSS = 0.08; // baseline attenuation per hop
const LOSS_VARIANCE = 0.12; // jitter on loss to model network volatility
const NEGENTROPY_SHIELD = 0.35; // how much negentropy counters loss

export class NCFSimulation {
  private nNodes: number;
  private nEdges: number;
  private edges: Edge[];
  private probabilities: Map<string, number[]>;
  private history: SimulationMetrics[];
  private time: number;
  private scenario?: SimulationScenario;
  private adjacency: Map<number, Edge[]>;
  private edgeLosses: Map<string, number>;
  private lastLossRatio: number;
  private lastThroughput: number;
  private chaosIntensity: number;
  private entropyAdapter?: SimulationOptions['entropyAdapter'];

  constructor(options: SimulationOptions = {}) {
    const { nodes = 7, edges = 13, scenario } = options;
    this.nNodes = nodes;
    this.nEdges = Math.min(edges, nodes * nodes);
    this.edges = [];
    this.probabilities = new Map();
    this.history = [];
    this.time = 0;
    this.scenario = scenario;
    this.adjacency = new Map();
    this.edgeLosses = new Map();
    this.lastLossRatio = 0;
    this.lastThroughput = 1;
    this.chaosIntensity = options.chaosIntensity ?? 0.08;
    this.entropyAdapter = options.entropyAdapter;

    this.initializeMesh();
  }

  private rebuildAdjacency(): void {
    this.adjacency.clear();
    for (const edge of this.edges) {
      const list = this.adjacency.get(edge.source) ?? [];
      list.push(edge);
      this.adjacency.set(edge.source, list);
    }
  }

  private initializeMesh(): void {
    if (this.scenario) {
      this.applyScenario(this.scenario);
      return;
    }

    this.edgeLosses.clear();
    this.lastLossRatio = 0;
    this.lastThroughput = 1;

    // Create random directed edges
    const allPossible: Edge[] = [];
    for (let i = 0; i < this.nNodes; i++) {
      for (let j = 0; j < this.nNodes; j++) {
        if (i !== j) {
          allPossible.push({ source: i, target: j });
        }
      }
    }

    // Randomly select edges
    const selectedIndices = new Set<number>();
    while (selectedIndices.size < Math.min(this.nEdges, allPossible.length)) {
      selectedIndices.add(Math.floor(Math.random() * allPossible.length));
    }

    this.edges = Array.from(selectedIndices).map((i) => allPossible[i]);

    // Initialize random probability distributions for each edge
    for (const edge of this.edges) {
      const key = this.edgeKey(edge);
      const length = 10;
      const base = Array.from({ length }, () => Math.random() * 0.2);
      const spikes = Math.max(1, Math.floor(Math.random() * 3));
      for (let i = 0; i < spikes; i++) {
        const idx = Math.floor(Math.random() * length);
        base[idx] += 1 + Math.random() * 1.5;
      }
      const sum = base.reduce((a, b) => a + b, 0);
      this.probabilities.set(key, base.map((p) => p / sum));
    }

    this.rebuildAdjacency();

    console.log(
      `Mesh initialized: ${this.nNodes} nodes, ${this.edges.length} edges`,
    );
  }

  private applyScenario(scenario: SimulationScenario): void {
    this.nNodes = scenario.nodes;
    this.edges = scenario.edges;
    this.nEdges = scenario.edges.length;
    this.probabilities.clear();
    this.edgeLosses.clear();
    this.lastLossRatio = 0;
    this.lastThroughput = 1;

    for (const [key, probs] of scenario.distributions.entries()) {
      const sum = probs.reduce((a, b) => a + b, 0);
      const normalized = sum > 0 ? probs.map((p) => p / sum) : probs;
      this.probabilities.set(key, normalized);
    }

    this.rebuildAdjacency();

    console.log(
      `Scenario applied: ${this.nNodes} nodes, ${this.edges.length} edges, ` +
        `${this.probabilities.size} distributions`,
    );
  }

  private edgeKey(edge: Edge): string {
    return `${edge.source}-${edge.target}`;
  }

  private entropyField(edge: Edge): number {
    const key = this.edgeKey(edge);
    const p = this.probabilities.get(key);
    if (!p) return 0.0;

    // Shannon entropy: H = -∑ p log₂ p
    const pNonzero = p.filter((val) => val > 0);
    return -pNonzero.reduce((sum, val) => sum + val * Math.log2(val), 0);
  }

  private hmax(edge: Edge): number {
    const key = this.edgeKey(edge);
    const p = this.probabilities.get(key);
    if (!p) return 1.0;
    return Math.log2(p.length);
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private negentropicIndex(edge: Edge): number {
    const h = this.entropyField(edge);
    const hMax = this.hmax(edge);
    if (hMax === 0) return 0.0;
    return 1.0 - h / hMax;
  }

  private entropyVelocity(): string {
    if (this.history.length === 0) {
      return ZERO_FIXED_POINT;
    }
    return this.history[this.history.length - 1].velocity ?? ZERO_FIXED_POINT;
  }

  private coherence(edge: Edge): number {
    const key = this.edgeKey(edge);
    const samples = this.probabilities.get(key);
    if (!samples || samples.length === 0) {
      return 0;
    }
    try {
      if (this.entropyAdapter?.coherenceFromResonator) {
        const { coherence } = this.entropyAdapter.coherenceFromResonator(
          Float64Array.from(samples),
        );
        return this.clamp01(coherence);
      }

      const spectralSource = this.entropyAdapter
        ? this.entropyAdapter.measureSpectrum(Float64Array.from(samples))
        : deriveCoherence(Float64Array.from(samples));
      const spectral = this.clamp01(
        Number.isFinite(spectralSource) ? spectralSource : 0,
      );

      // Fallback: variation-based coherence (smoothness of distribution)
      let totalVariation = 0;
      for (let i = 1; i < samples.length; i++) {
        totalVariation += Math.abs(samples[i] - samples[i - 1]);
      }
      const variationCoherence = this.clamp01(1 - totalVariation / 2);

      // Blend to avoid being stuck at 0/1 when spectral collapses
    const energyNorm = samples.reduce((a,b)=>a+b*b,0);
    const spectralWeight = energyNorm > 1 ? 0.8 : 0.6;
    const blended = spectral * spectralWeight + variationCoherence * (1 - spectralWeight);

      return this.clamp01(blended);
    } catch (error) {
      console.warn('Coherence calculation failed', { edge: key, error });
      return 0;
    }
  }

  private policyFromNegentropy(n: string): 'macro' | 'defensive' | 'balanced' {
    if (compareFixedPoint(n, MACRO_THRESHOLD) > 0) return 'macro';
    if (compareFixedPoint(n, DEFENSIVE_THRESHOLD) < 0) return 'defensive';
    return 'balanced';
  }

  private updateDistributions(): void {
    const transfers = new Map<string, number[]>();
    const peaks = new Map<string, { idx: number; negentropy: number }>();
    const edgeLossSamples = new Map<string, { lost: number; attempted: number }>();
    let stepAttempted = 0;
    let stepDelivered = 0;

    for (const edge of this.edges) {
      const key = this.edgeKey(edge);
      const probs = this.probabilities.get(key);
      if (!probs || probs.length === 0) continue;
      let maxIdx = 0;
      let maxVal = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxVal) {
          maxVal = probs[i];
          maxIdx = i;
        }
      }
      peaks.set(key, { idx: maxIdx, negentropy: this.negentropicIndex(edge) });
    }

    // Push packet-like signals along downstream edges using the dominant state
    for (const edge of this.edges) {
      const peak = peaks.get(this.edgeKey(edge));
      if (!peak) continue;
      const downstreamEdges = this.adjacency.get(edge.target) ?? [];
      if (downstreamEdges.length === 0) continue;

      const signalStrength = 0.03 + peak.negentropy * 0.25;
      const coherenceScore = this.clamp01(this.coherence(edge));
      for (const downstream of downstreamEdges) {
        const downstreamKey = this.edgeKey(downstream);
        const downstreamProbs = this.probabilities.get(downstreamKey);
        if (!downstreamProbs || downstreamProbs.length === 0) continue;

        const channelLoss = this.clamp01(
          BASE_LOSS +
            (1 - peak.negentropy) * NEGENTROPY_SHIELD +
            (1 - coherenceScore) * 0.1 +
            Math.random() * LOSS_VARIANCE,
        );
        const delivered = signalStrength * (1 - channelLoss);
        const lost = signalStrength - delivered;
        stepAttempted += signalStrength;
        stepDelivered += delivered;
        const lossSample = edgeLossSamples.get(downstreamKey) ?? {
          lost: 0,
          attempted: 0,
        };
        lossSample.lost += lost;
        lossSample.attempted += signalStrength;
        edgeLossSamples.set(downstreamKey, lossSample);

        const transferArray =
          transfers.get(downstreamKey) ??
          new Array(downstreamProbs.length).fill(0);
        const slot = peak.idx % downstreamProbs.length;
        transferArray[slot] += delivered;
        transfers.set(downstreamKey, transferArray);
      }
    }

    this.edgeLosses.clear();
    for (const [key, sample] of edgeLossSamples.entries()) {
      const ratio =
        sample.attempted > 0 ? sample.lost / sample.attempted : 0;
      this.edgeLosses.set(key, this.clamp01(ratio));
    }
    if (stepAttempted > 0) {
      this.lastThroughput = this.clamp01(stepDelivered / stepAttempted);
      this.lastLossRatio = this.clamp01(
        (stepAttempted - stepDelivered) / stepAttempted,
      );
    } else {
      this.lastThroughput = 1;
      this.lastLossRatio = 0;
    }

    for (const edge of this.edges) {
      const key = this.edgeKey(edge);
      const probs = this.probabilities.get(key);
      if (!probs) continue;

      const incoming = transfers.get(key) ?? new Array(probs.length).fill(0);
      const peak = peaks.get(key);
      const reinforcement =
        peak && incoming.length > 0 ? 0.05 * peak.negentropy : 0;
      const chaos = this.chaosIntensity;
      const jitter = chaos * (Math.random() * 0.02 + 0.005);
      const newProbs = probs.map((p, i) => {
        const bias = peak?.idx === i ? reinforcement : 0;
        return p * 0.8 + incoming[i] + bias + Math.random() * jitter;
      });
      const sum = newProbs.reduce((a, b) => a + b, 0);
      this.probabilities.set(key, newProbs.map((p) => (sum > 0 ? p / sum : p)));
    }
  }

  public evolve(): SimulationMetrics {
    const negentropies = this.edges.map((edge) =>
      toFixedPoint(this.negentropicIndex(edge)),
    );
    const resonatorOutputs =
      this.entropyAdapter?.coherenceFromResonator
        ? this.entropyAdapter
        : undefined;

    let avgRegime: 'chaos' | 'transitional' | 'coherent' | undefined;
    let avgEntropyVelocity = ZERO_FIXED_POINT;

    const coherences = this.edges.map((edge, idx) => {
      if (resonatorOutputs?.coherenceFromResonator) {
        const key = this.edgeKey(edge);
        const probs = this.probabilities.get(key) ?? [];
        const r = resonatorOutputs.coherenceFromResonator(
          Float64Array.from(probs),
        );
        // Keep running regime/entropy velocity average
        if (idx === 0) {
          avgRegime = r.regime;
          avgEntropyVelocity = toFixedPoint(r.entropyVelocity);
        }
        return toFixedPoint(r.coherence);
      }
      return toFixedPoint(this.coherence(edge));
    });

    const avgNegentropy = averageFixedPoint(negentropies);
    const avgCoherence = averageFixedPoint(coherences);

    // Velocity: delta of negentropy per step (fixed-point-safe)
    let avgVelocity = ZERO_FIXED_POINT;
    if (this.history.length > 0) {
      avgVelocity = subtractFixedPoint(
        avgNegentropy,
        this.history[this.history.length - 1].negentropy,
      );
    }

    const metrics: SimulationMetrics = {
      negentropy: avgNegentropy,
      coherence: avgCoherence,
      velocity: avgVelocity,
      time: this.time,
      throughput: toFixedPoint(this.lastThroughput),
      loss: toFixedPoint(this.lastLossRatio),
      regime: avgRegime,
      entropyVelocity: avgEntropyVelocity,
    };

    // Log state
    this.history.push(metrics);

    // Update distributions for next step
    this.updateDistributions();
    this.time += 1;

    return metrics;
  }

  public getState(): SimulationState {
    const edgeMetrics = new Map<string, EdgeMetrics>();

    const meshVelocity = this.entropyVelocity();
    const resonatorOutputs =
      typeof this.entropyAdapter?.coherenceFromResonator === 'function' &&
      typeof this.entropyAdapter?.measureSpectrum === 'function'
        ? this.entropyAdapter
        : undefined;

    for (const edge of this.edges) {
      const key = this.edgeKey(edge);
      const negentropy = toFixedPoint(this.negentropicIndex(edge));
      let coherence = toFixedPoint(this.coherence(edge));
      let regime: EdgeMetrics['regime'] | undefined;
      if (resonatorOutputs?.coherenceFromResonator) {
        const probs = this.probabilities.get(key) ?? [];
        const r = resonatorOutputs.coherenceFromResonator(
          Float64Array.from(probs),
        );
        coherence = toFixedPoint(r.coherence);
        regime = r.regime;
      }
      const lossRatio = this.edgeLosses.get(key) ?? this.lastLossRatio;
      edgeMetrics.set(key, {
        entropy: toFixedPoint(this.entropyField(edge)),
        negentropy,
        coherence,
        velocity: meshVelocity,
        policy: this.policyFromNegentropy(negentropy),
        loss: toFixedPoint(lossRatio),
        regime,
      });
    }

    const meshMetrics: SimulationMetrics =
      this.history.length > 0
        ? this.history[this.history.length - 1]
        : {
            negentropy: ZERO_FIXED_POINT,
            coherence: ZERO_FIXED_POINT,
            velocity: ZERO_FIXED_POINT,
            time: 0,
          };

    return {
      nodes: this.nNodes,
      edges: this.edges,
      time: this.time,
      meshMetrics,
      edgeMetrics,
      history: this.history,
      scenarioMetadata: this.scenario?.metadata,
    };
  }

  public getHistory(): SimulationMetrics[] {
    return this.history;
  }

  public reset(options: SimulationOptions = {}): void {
    const { nodes, edges } = options;
    if (typeof nodes === 'number') this.nNodes = nodes;
    if (typeof edges === 'number') this.nEdges = edges;
    if ('scenario' in options) {
      this.scenario = options.scenario;
    }
    if ('chaosIntensity' in options && typeof options.chaosIntensity === 'number') {
      this.chaosIntensity = options.chaosIntensity;
    }
    if ('entropyAdapter' in options) {
      this.entropyAdapter = options.entropyAdapter;
    }
    this.edges = [];
    this.probabilities.clear();
    this.history = [];
    this.time = 0;
    this.edgeLosses.clear();
    this.lastLossRatio = 0;
    this.lastThroughput = 1;
    this.initializeMesh();
  }
}
