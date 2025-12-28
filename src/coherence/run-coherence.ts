import { CoherenceLoop } from "./loop";
import { CommitmentDetector } from "./commitment-detector";
import { cosineSimilarity, characterizeNoise } from "./invariants";
import type { CouplingParams, CoherenceConfig, FieldSample } from "./types";

const cfg: CoherenceConfig = {
  Hmin: 1,
  maxDelta: { batchSize: 4, paceMs: 10 },
  floors: { batchSize: 1 },
  ceilings: { batchSize: 128, paceMs: 1000 },
};

const coupling: CouplingParams = {
  batchSize: 16,
  concurrency: 4,
  redundancy: 1,
  paceMs: 250,
};

const loop = new CoherenceLoop(cfg);
const detector = new CommitmentDetector();

function generateSample(t: number): FieldSample {
  return {
    t,
    latencyP50: 90 + Math.sin(t / 500) * 5,
    latencyP95: 120 + Math.sin(t / 600) * 8,
    latencyP99: 150 + Math.sin(t / 700) * 10,
    errRate: 0.01 + Math.random() * 0.005,
    queueDepth: 20,
    queueSlope: 0.02,
  };
}

export async function runCoherence() {
  const intent = [1, 1, 1, 1];
  for (let step = 0; step < 20; step++) {
    const sample = generateSample(Date.now());
    const signal = [
      sample.latencyP50,
      sample.latencyP95,
      sample.latencyP99,
      sample.errRate,
    ];

    // Step the coherence loop
    loop.sense(sample);
    const state = loop.estimate();

    // Compute higher-order invariants
    const { noise, snr, entropy } = await characterizeNoise(signal, signal.reduce((s,v)=>s+v*v,0));
    const alignment = cosineSimilarity(signal, intent);
    const resonance = 1 - entropy;

    // Detect commitment
    detector.detectCommitment(
      state.M,
      state.V,
      { R: state.R, H: state.H, alignment, noise, snr, entropy, resonance },
      coupling
    );
  }

  console.log("Commitment events:", detector.getEvents());
}
