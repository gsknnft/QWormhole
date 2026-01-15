export const resolveLatencyVar = (sample: Record<string, number>): number => {
  const explicit = sample.latency_var;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return explicit;
  }
  const p50 = sample.latencyP50;
  const p95 = sample.latencyP95;
  if (typeof p50 === "number" && typeof p95 === "number") {
    return Math.max(0, p95 - p50) / Math.max(1, p50);
  }
  const p99 = sample.latencyP99;
  if (typeof p50 === "number" && typeof p99 === "number") {
    return Math.max(0, p99 - p50) / Math.max(1, p50);
  }
  return 0;
};
