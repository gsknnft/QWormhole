/**
 * Entropy-Adaptive Transport Policy
 *
 * Derives transport configuration from negentropic index (N), entropy velocity,
 * and coherence metrics. This enables QWormhole to adapt its behavior based on
 * the information-theoretic state of the mesh.
 *
 * Policy modes (from roadmap):
 * - Trust-zero:  N ≥ 0.85, high coherence → zero-copy + big batches + FlatBuffers
 * - Trust-light: N 0.65–0.84, medium coherence → zero-copy + mid batches + CBOR
 * - Immune:      N 0.40–0.64, low coherence → length-prefix + ACK
 * - Paranoia:    N < 0.40, chaos → checksum + ACK + tiny batches
 */

/**
 * Handshake mode based on negentropic index
 */
export type HandshakeMode = "trust-zero" | "trust-light" | "immune" | "paranoia";

/**
 * Framing mode for the transport
 */
export type FramingPolicy =
  | "zero-copy-writev"
  | "length-prefix"
  | "length-ack"
  | "length-ack-checksum";

/**
 * Recommended codec for the transport
 */
export type CodecRecommendation =
  | "flatbuffers"
  | "cbor"
  | "messagepack"
  | "json-compressed";

/**
 * Entropy velocity indicator
 */
export type EntropyVelocity = "low" | "stable" | "rising" | "spiking";

/**
 * Coherence level indicator
 */
export type CoherenceLevel = "high" | "medium" | "low" | "chaos";

/**
 * Entropy metrics for handshake payload
 */
export interface EntropyMetrics {
  /** Shannon entropy of the session (0-8 for byte data) */
  entropy?: number;
  /** Rate of change of entropy over time */
  entropyVelocity?: EntropyVelocity;
  /** Coherence level of the peer */
  coherence?: CoherenceLevel;
  /** Negentropic index (0-1, derived from coherence/entropy) */
  negIndex?: number;
}

/**
 * Transport policy derived from entropy metrics
 */
export interface EntropyPolicy {
  /** Handshake mode */
  mode: HandshakeMode;
  /** Framing strategy */
  framing: FramingPolicy;
  /** Recommended batch size for writev operations */
  batchSize: number;
  /** Recommended codec */
  codec: CodecRecommendation;
  /** Whether ACKs are required */
  requireAck: boolean;
  /** Whether checksums are required */
  requireChecksum: boolean;
  /** Trust level (0-1, higher = more trusted) */
  trustLevel: number;
}

/**
 * Default thresholds for policy derivation
 */
export const ENTROPY_THRESHOLDS = {
  TRUST_ZERO: 0.85,
  TRUST_LIGHT: 0.65,
  IMMUNE: 0.4,
} as const;

/**
 * Default batch sizes per policy mode
 */
export const BATCH_SIZES = {
  "trust-zero": 64,
  "trust-light": 32,
  immune: 8,
  paranoia: 1,
} as const;

/**
 * Maximum Shannon entropy for byte data (log2(256) = 8 bits)
 * Used to convert N-index to entropy estimate
 */
export const MAX_BYTE_ENTROPY = 8;

/**
 * Derive handshake mode from negentropic index
 */
export function deriveHandshakeMode(negIndex: number): HandshakeMode {
  if (negIndex >= ENTROPY_THRESHOLDS.TRUST_ZERO) {
    return "trust-zero";
  }
  if (negIndex >= ENTROPY_THRESHOLDS.TRUST_LIGHT) {
    return "trust-light";
  }
  if (negIndex >= ENTROPY_THRESHOLDS.IMMUNE) {
    return "immune";
  }
  return "paranoia";
}

/**
 * Derive coherence level from negentropic index
 */
export function deriveCoherenceLevel(negIndex: number): CoherenceLevel {
  if (negIndex >= ENTROPY_THRESHOLDS.TRUST_ZERO) {
    return "high";
  }
  if (negIndex >= ENTROPY_THRESHOLDS.TRUST_LIGHT) {
    return "medium";
  }
  if (negIndex >= ENTROPY_THRESHOLDS.IMMUNE) {
    return "low";
  }
  return "chaos";
}

/**
 * Derive entropy velocity from sequential N values
 */
export function deriveEntropyVelocity(
  previousN: number,
  currentN: number,
  deltaTimeMs: number,
): EntropyVelocity {
  if (deltaTimeMs <= 0) return "stable";

  const velocity = (currentN - previousN) / (deltaTimeMs / 1000);

  if (Math.abs(velocity) < 0.01) {
    return "low";
  }
  if (Math.abs(velocity) < 0.05) {
    return "stable";
  }
  if (Math.abs(velocity) < 0.2) {
    return "rising";
  }
  return "spiking";
}

/**
 * Derive full transport policy from entropy metrics
 */
export function deriveEntropyPolicy(metrics: EntropyMetrics): EntropyPolicy {
  const negIndex = metrics.negIndex ?? 0.5;
  const mode = deriveHandshakeMode(negIndex);

  switch (mode) {
    case "trust-zero":
      return {
        mode,
        framing: "zero-copy-writev",
        batchSize: BATCH_SIZES["trust-zero"],
        codec: "flatbuffers",
        requireAck: false,
        requireChecksum: false,
        trustLevel: 1.0,
      };

    case "trust-light":
      return {
        mode,
        framing: "length-prefix",
        batchSize: BATCH_SIZES["trust-light"],
        codec: "cbor",
        requireAck: false,
        requireChecksum: false,
        trustLevel: 0.75,
      };

    case "immune":
      return {
        mode,
        framing: "length-ack",
        batchSize: BATCH_SIZES["immune"],
        codec: "messagepack",
        requireAck: true,
        requireChecksum: false,
        trustLevel: 0.5,
      };

    case "paranoia":
      return {
        mode,
        framing: "length-ack-checksum",
        batchSize: BATCH_SIZES["paranoia"],
        codec: "json-compressed",
        requireAck: true,
        requireChecksum: true,
        trustLevel: 0.25,
      };
  }
}

/**
 * Compute entropy metrics from handshake nIndex
 */
export function computeEntropyMetrics(
  nIndex: number,
  previousNIndex?: number,
  deltaTimeMs?: number,
): EntropyMetrics {
  const coherence = deriveCoherenceLevel(nIndex);
  const entropyVelocity =
    previousNIndex !== undefined && deltaTimeMs !== undefined
      ? deriveEntropyVelocity(previousNIndex, nIndex, deltaTimeMs)
      : "stable";

  // Entropy is inverse of N-index (high N = low entropy)
  // MAX_BYTE_ENTROPY (8 bits) represents maximum Shannon entropy for byte data
  const entropy = MAX_BYTE_ENTROPY * (1 - Math.min(Math.max(nIndex, 0), 1));

  return {
    entropy,
    entropyVelocity,
    coherence,
    negIndex: nIndex,
  };
}

/**
 * Merge peer entropy metrics to derive session policy
 * Uses the more conservative (lower trust) of the two peers
 */
export function mergeEntropyPolicies(
  localMetrics: EntropyMetrics,
  peerMetrics: EntropyMetrics,
): EntropyPolicy {
  // Use the lower N-index (more conservative)
  const localN = localMetrics.negIndex ?? 0.5;
  const peerN = peerMetrics.negIndex ?? 0.5;
  const sessionN = Math.min(localN, peerN);

  return deriveEntropyPolicy({ ...localMetrics, negIndex: sessionN });
}
