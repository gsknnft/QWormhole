export interface TransportSliceEvent {
  timestamp: number;
  size: number;
}

export interface TransportFlushEvent {
  timestamp: number;
  bytes: number;
  frames: number;
}

export interface TransportCoherenceInput {
  sliceHistory: TransportSliceEvent[];
  flushHistory: TransportFlushEvent[];
  backpressureHistory: number[];
  eluIdleRatioAvg?: number;
  gcPauseMaxMs?: number;
  payloadEntropy?: number;
  payloadNegentropy?: number;
}

export interface TransportCoherenceSnapshot {
  transportSNI: number;
  transportSPI: number;
  transportMetastability: number;
  sliceEntropyInverse: number;
  flushIntervalStability: number;
  batchingRegularity: number;
  backpressureBoundedness: number;
  runtimeRegularity: number;
  payloadRegularity: number;
  sliceEntropy: number;
  flushIntervalEntropy: number;
  sampleCount: {
    slices: number;
    flushes: number;
    backpressure: number;
  };
  diagnostics: string[];
}

const EPS = 1e-9;

export function computeTransportCoherence(
  input: TransportCoherenceInput,
): TransportCoherenceSnapshot {
  const diagnostics: string[] = [];
  const sliceSizes = finite(input.sliceHistory.map((entry) => entry.size));
  const flushes = input.flushHistory
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  const backpressureHistory = finite(input.backpressureHistory).sort((a, b) => a - b);

  const sliceEntropy = normalizedDiscreteEntropy(sliceSizes);
  const sliceEntropyInverse = clamp01(1 - sliceEntropy);
  if (sliceSizes.length < 2) diagnostics.push("slice_history_under_sampled");

  const flushIntervals = diff(flushes.map((entry) => entry.timestamp));
  const flushIntervalEntropy = normalizedQuantizedEntropy(flushIntervals);
  const flushIntervalCv = coefficientOfVariation(flushIntervals);
  const flushIntervalStability = clamp01(
    1 - 0.55 * flushIntervalEntropy - 0.45 * clamp01(flushIntervalCv / 1.25),
  );
  if (flushIntervals.length < 2) diagnostics.push("flush_history_under_sampled");

  const frameCounts = finite(flushes.map((entry) => entry.frames));
  const byteCounts = finite(flushes.map((entry) => entry.bytes));
  const bytesPerFrame = flushes
    .filter((entry) => entry.frames > 0)
    .map((entry) => entry.bytes / entry.frames)
    .filter((value) => Number.isFinite(value) && value > 0);
  const batchingRegularity = clamp01(
    1 -
      mean([
        clamp01(coefficientOfVariation(frameCounts) / 1.4),
        clamp01(coefficientOfVariation(byteCounts) / 1.4),
        clamp01(coefficientOfVariation(bytesPerFrame) / 1.1),
      ]),
  );
  if (flushes.length < 3) diagnostics.push("batching_under_sampled");

  const backpressureDensity =
    flushes.length > 0 ? clamp01(backpressureHistory.length / flushes.length) : 0;
  const backpressureIntervals = diff(backpressureHistory);
  const clusteredBackpressure = backpressureClusterRatio(backpressureIntervals);
  const backpressureBoundedness = clamp01(
    1 - 0.6 * backpressureDensity - 0.4 * clusteredBackpressure,
  );
  if (!backpressureHistory.length) diagnostics.push("backpressure_idle");

  const runtimeRegularity = clamp01(
    0.65 * clamp01(input.eluIdleRatioAvg ?? 0.5) +
      0.35 * (1 - clamp01((input.gcPauseMaxMs ?? 0) / 40)),
  );
  const payloadRegularity = resolvePayloadRegularity(
    input.payloadEntropy,
    input.payloadNegentropy,
  );

  const transportSNI = clamp01(
    0.22 * sliceEntropyInverse +
      0.24 * flushIntervalStability +
      0.24 * batchingRegularity +
      0.18 * runtimeRegularity +
      0.12 * payloadRegularity,
  );

  const transportSPI = clamp01(
    0.18 * sliceEntropyInverse +
      0.24 * flushIntervalStability +
      0.24 * batchingRegularity +
      0.2 * backpressureBoundedness +
      0.1 * runtimeRegularity +
      0.04 * payloadRegularity,
  );

  const transportMetastability = clamp01(
    0.45 * (1 - transportSPI) +
      0.35 * (1 - backpressureBoundedness) +
      0.2 * clamp01(flushIntervalCv / 1.5),
  );

  diagnostics.push(`transport_sni:${transportSNI.toFixed(3)}`);
  diagnostics.push(`transport_spi:${transportSPI.toFixed(3)}`);
  diagnostics.push(`transport_meta:${transportMetastability.toFixed(3)}`);

  return {
    transportSNI,
    transportSPI,
    transportMetastability,
    sliceEntropyInverse,
    flushIntervalStability,
    batchingRegularity,
    backpressureBoundedness,
    runtimeRegularity,
    payloadRegularity,
    sliceEntropy,
    flushIntervalEntropy,
    sampleCount: {
      slices: sliceSizes.length,
      flushes: flushes.length,
      backpressure: backpressureHistory.length,
    },
    diagnostics,
  };
}

function resolvePayloadRegularity(
  payloadEntropy?: number,
  payloadNegentropy?: number,
): number {
  if (Number.isFinite(payloadNegentropy)) {
    return clamp01(payloadNegentropy as number);
  }
  if (Number.isFinite(payloadEntropy)) {
    return clamp01(1 - (payloadEntropy as number) / Math.log(8));
  }
  return 0.5;
}

function backpressureClusterRatio(intervals: number[]): number {
  if (intervals.length <= 1) return intervals.length ? 0.25 : 0;
  const medianInterval = percentile(intervals, 0.5);
  const threshold = Math.max(5, medianInterval * 0.5);
  return intervals.filter((value) => value <= threshold).length / intervals.length;
}

function normalizedDiscreteEntropy(values: number[]): number {
  if (values.length <= 1) return 0;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const probs = [...counts.values()].map((count) => count / values.length);
  return normalizedEntropyFromProbabilities(probs);
}

function normalizedQuantizedEntropy(values: number[], bins = 8): number {
  if (values.length <= 1) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) <= EPS) {
    return 0;
  }
  const histogram = Array.from({ length: bins }, () => 0);
  for (const value of values) {
    const normalized = (value - min) / Math.max(EPS, max - min);
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(normalized * bins)));
    histogram[idx] += 1;
  }
  const probs = histogram.filter(Boolean).map((count) => count / values.length);
  return normalizedEntropyFromProbabilities(probs);
}

function normalizedEntropyFromProbabilities(probs: number[]): number {
  if (probs.length <= 1) return 0;
  const entropy = -probs.reduce(
    (sum, p) => sum + p * Math.log(Math.max(EPS, p)),
    0,
  );
  return clamp01(entropy / Math.max(EPS, Math.log(probs.length)));
}

function diff(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] - values[i - 1]);
  }
  return out.filter((value) => Number.isFinite(value) && value >= 0);
}

function finite(values: Array<number | undefined | null>): number[] {
  return values.filter((value): value is number => Number.isFinite(value));
}

function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mu = mean(values);
  if (Math.abs(mu) <= EPS) return 0;
  return stddev(values) / Math.abs(mu);
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(q, 0, 1) * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  const t = idx - low;
  return sorted[low] * (1 - t) + sorted[high] * t;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mu = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mu) * (value - mu), 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
