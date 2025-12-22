import {
  defaultSimulationConfig,
  formatFailureDiary,
  runCoherenceSimulation,
} from "../src/coherence/sim";

function readNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const config = defaultSimulationConfig();
const durationMs = readNumber(process.env.COHERENCE_SIM_DURATION_MS);
const stepMs = readNumber(process.env.COHERENCE_SIM_STEP_MS);
const seed = readNumber(process.env.COHERENCE_SIM_SEED);
const hmin = readNumber(process.env.COHERENCE_SIM_HMIN);
const maxDeltaBatch = readNumber(process.env.COHERENCE_SIM_MAX_DELTA_BATCH);
const maxDeltaConc = readNumber(process.env.COHERENCE_SIM_MAX_DELTA_CONC);
const maxDeltaRedundancy = readNumber(process.env.COHERENCE_SIM_MAX_DELTA_REDUNDANCY);
const maxDeltaPaceMs = readNumber(process.env.COHERENCE_SIM_MAX_DELTA_PACE_MS);

if (durationMs) config.durationMs = Math.max(1, Math.floor(durationMs));
if (stepMs) config.stepMs = Math.max(1, Math.floor(stepMs));
if (seed) config.seed = Math.floor(seed);
if (hmin) config.coherence.Hmin = Math.max(1, hmin);
if (maxDeltaBatch) config.coherence.maxDelta.batchSize = maxDeltaBatch;
if (maxDeltaConc) config.coherence.maxDelta.concurrency = maxDeltaConc;
if (maxDeltaRedundancy) config.coherence.maxDelta.redundancy = maxDeltaRedundancy;
if (maxDeltaPaceMs) config.coherence.maxDelta.paceMs = maxDeltaPaceMs;

const result = runCoherenceSimulation(config);

console.log("coherence simulation summary");
console.log(JSON.stringify(result.summary, null, 2));
console.log("failure diary");
console.log(formatFailureDiary(result));

if (process.env.COHERENCE_SIM_TRACE === "1") {
  console.log("trace");
  console.log(JSON.stringify(result.trace, null, 2));
}
