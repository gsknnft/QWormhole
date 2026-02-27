export type TransportGovernanceMode = "throughput" | "guarded" | "recovery";

export interface TransportGovernanceSignals {
  gamma?: number;
  driftRate?: number;
  entropy?: number;
  confidence?: number;
  coherenceDensity?: number;
  structuralPersistence?: number;
  metastability?: number;
  transportSNI?: number;
  transportSPI?: number;
  transportMetastability?: number;
  boundExceeded?: boolean;
  pointOfNoReturn?: boolean;
  regime?:
    | "stable-gradient"
    | "stable-orbit"
    | "chaotic"
    | "turbulent"
    | "unstable"
    | "model-mismatch";
}

export interface TransportGovernancePolicy {
  mode: TransportGovernanceMode;
  batchScale: number;
  flushScale: number;
  bufferScale: number;
  paceScale: number;
  reason: string[];
}

export function deriveTransportGovernancePolicy(
  signals: TransportGovernanceSignals,
): TransportGovernancePolicy {
  const gamma = finiteOr(signals.gamma, 1);
  const entropy = clamp01(finiteOr(signals.entropy, 0));
  const confidence = clamp01(finiteOr(signals.confidence, 1));
  const coherenceDensity = clamp01(finiteOr(signals.coherenceDensity, 0.5));
  const structuralPersistence = clamp01(
    finiteOr(signals.structuralPersistence, 0.5),
  );
  const metastability = clamp01(finiteOr(signals.metastability, 0.5));
  const transportSNI = clamp01(finiteOr(signals.transportSNI, 0.5));
  const transportSPI = clamp01(finiteOr(signals.transportSPI, 0.5));
  const transportMetastability = clamp01(
    finiteOr(signals.transportMetastability, 0.5),
  );
  const boundExceeded = signals.boundExceeded === true;
  const pointOfNoReturn = signals.pointOfNoReturn === true;

  const reasons: string[] = [];

  if (pointOfNoReturn) {
    reasons.push("point_of_no_return");
    return {
      mode: "recovery",
      batchScale: 0.4,
      flushScale: 0.5,
      bufferScale: 0.45,
      paceScale: 1.35,
      reason: reasons,
    };
  }

  if (
    boundExceeded ||
    gamma >= 2.25 ||
    entropy >= 0.72 ||
    confidence <= 0.35 ||
    structuralPersistence <= 0.4 ||
    metastability >= 0.68 ||
    transportSPI <= 0.45 ||
    transportMetastability >= 0.68 ||
    signals.regime === "unstable" ||
    signals.regime === "model-mismatch"
  ) {
    if (boundExceeded) reasons.push("bound_exceeded");
    if (gamma >= 2.25) reasons.push("gamma_high");
    if (entropy >= 0.72) reasons.push("entropy_high");
    if (confidence <= 0.35) reasons.push("confidence_low");
    if (structuralPersistence <= 0.4) reasons.push("persistence_low");
    if (metastability >= 0.68) reasons.push("metastability_high");
    if (transportSPI <= 0.45) reasons.push("transport_persistence_low");
    if (transportMetastability >= 0.68) reasons.push("transport_metastability_high");
    if (signals.regime === "unstable") reasons.push("regime_unstable");
    if (signals.regime === "model-mismatch") reasons.push("regime_model_mismatch");
    return {
      mode: "guarded",
      batchScale: 0.75,
      flushScale: 0.8,
      bufferScale: 0.75,
      paceScale: 1.1,
      reason: reasons,
    };
  }

  if (
    gamma <= 1.15 &&
    entropy <= 0.4 &&
    confidence >= 0.75 &&
    coherenceDensity >= 0.55 &&
    structuralPersistence >= 0.68 &&
    metastability <= 0.35 &&
    transportSNI >= 0.55 &&
    transportSPI >= 0.68 &&
    transportMetastability <= 0.35 &&
    signals.regime !== "chaotic" &&
    signals.regime !== "turbulent"
  ) {
    reasons.push("stable_headroom");
    reasons.push("coherence_density_high");
    reasons.push("persistence_certified");
    reasons.push("transport_stable");
    return {
      mode: "throughput",
      batchScale: 1.1,
      flushScale: 1,
      bufferScale: 1.05,
      paceScale: 0.95,
      reason: reasons,
    };
  }

  reasons.push("neutral");
  return {
    mode: "guarded",
    batchScale: 1,
    flushScale: 1,
    bufferScale: 1,
    paceScale: 1,
    reason: reasons,
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
