import { describe, it, expect } from "vitest";
import {
  deriveHandshakeMode,
  deriveCoherenceLevel,
  deriveEntropyVelocity,
  deriveEntropyPolicy,
  computeEntropyMetrics,
  mergeEntropyPolicies,
  ENTROPY_THRESHOLDS,
  BATCH_SIZES,
} from "../src/handshake/entropy-policy";

describe("Entropy Policy", () => {
  describe("deriveHandshakeMode", () => {
    it("returns trust-zero for high nIndex (>= 0.85)", () => {
      expect(deriveHandshakeMode(0.85)).toBe("trust-zero");
      expect(deriveHandshakeMode(0.9)).toBe("trust-zero");
      expect(deriveHandshakeMode(1.0)).toBe("trust-zero");
    });

    it("returns trust-light for medium nIndex (0.65 - 0.84)", () => {
      expect(deriveHandshakeMode(0.65)).toBe("trust-light");
      expect(deriveHandshakeMode(0.75)).toBe("trust-light");
      expect(deriveHandshakeMode(0.84)).toBe("trust-light");
    });

    it("returns immune for low nIndex (0.40 - 0.64)", () => {
      expect(deriveHandshakeMode(0.4)).toBe("immune");
      expect(deriveHandshakeMode(0.5)).toBe("immune");
      expect(deriveHandshakeMode(0.64)).toBe("immune");
    });

    it("returns paranoia for chaotic nIndex (< 0.40)", () => {
      expect(deriveHandshakeMode(0.39)).toBe("paranoia");
      expect(deriveHandshakeMode(0.2)).toBe("paranoia");
      expect(deriveHandshakeMode(0)).toBe("paranoia");
    });
  });

  describe("deriveCoherenceLevel", () => {
    it("maps nIndex to correct coherence levels", () => {
      expect(deriveCoherenceLevel(0.9)).toBe("high");
      expect(deriveCoherenceLevel(0.7)).toBe("medium");
      expect(deriveCoherenceLevel(0.5)).toBe("low");
      expect(deriveCoherenceLevel(0.3)).toBe("chaos");
    });
  });

  describe("deriveEntropyVelocity", () => {
    it("returns low for minimal change", () => {
      expect(deriveEntropyVelocity(0.5, 0.505, 1000)).toBe("low");
    });

    it("returns stable for small change", () => {
      expect(deriveEntropyVelocity(0.5, 0.52, 1000)).toBe("stable");
    });

    it("returns rising for moderate change", () => {
      expect(deriveEntropyVelocity(0.5, 0.6, 1000)).toBe("rising");
    });

    it("returns spiking for large change", () => {
      expect(deriveEntropyVelocity(0.5, 0.75, 1000)).toBe("spiking");
    });

    it("returns stable for zero delta time", () => {
      expect(deriveEntropyVelocity(0.5, 0.9, 0)).toBe("stable");
    });
  });

  describe("deriveEntropyPolicy", () => {
    it("derives trust-zero policy for high nIndex", () => {
      const policy = deriveEntropyPolicy({ negIndex: 0.9 });
      expect(policy.mode).toBe("trust-zero");
      expect(policy.framing).toBe("zero-copy-writev");
      expect(policy.batchSize).toBe(64);
      expect(policy.codec).toBe("flatbuffers");
      expect(policy.requireAck).toBe(false);
      expect(policy.requireChecksum).toBe(false);
      expect(policy.trustLevel).toBe(1.0);
    });

    it("derives trust-light policy for medium nIndex", () => {
      const policy = deriveEntropyPolicy({ negIndex: 0.7 });
      expect(policy.mode).toBe("trust-light");
      expect(policy.framing).toBe("length-prefix");
      expect(policy.batchSize).toBe(32);
      expect(policy.codec).toBe("cbor");
      expect(policy.trustLevel).toBe(0.75);
    });

    it("derives immune policy for low nIndex", () => {
      const policy = deriveEntropyPolicy({ negIndex: 0.5 });
      expect(policy.mode).toBe("immune");
      expect(policy.framing).toBe("length-ack");
      expect(policy.batchSize).toBe(8);
      expect(policy.codec).toBe("messagepack");
      expect(policy.requireAck).toBe(true);
      expect(policy.trustLevel).toBe(0.5);
    });

    it("derives paranoia policy for chaotic nIndex", () => {
      const policy = deriveEntropyPolicy({ negIndex: 0.2 });
      expect(policy.mode).toBe("paranoia");
      expect(policy.framing).toBe("length-ack-checksum");
      expect(policy.batchSize).toBe(1);
      expect(policy.codec).toBe("json-compressed");
      expect(policy.requireAck).toBe(true);
      expect(policy.requireChecksum).toBe(true);
      expect(policy.trustLevel).toBe(0.25);
    });

    it("defaults to immune policy when no nIndex provided", () => {
      const policy = deriveEntropyPolicy({});
      expect(policy.mode).toBe("immune");
    });
  });

  describe("computeEntropyMetrics", () => {
    it("computes entropy metrics from nIndex", () => {
      const metrics = computeEntropyMetrics(0.8);
      expect(metrics.negIndex).toBe(0.8);
      expect(metrics.coherence).toBe("medium");
      expect(metrics.entropyVelocity).toBe("stable");
      expect(metrics.entropy).toBeCloseTo(1.6); // 8 * (1 - 0.8)
    });

    it("computes velocity when previous values provided", () => {
      const metrics = computeEntropyMetrics(0.9, 0.5, 1000);
      expect(metrics.entropyVelocity).toBe("spiking");
    });
  });

  describe("mergeEntropyPolicies", () => {
    it("uses the lower nIndex for session policy (conservative)", () => {
      const localMetrics = { negIndex: 0.9 }; // trust-zero
      const peerMetrics = { negIndex: 0.5 }; // immune
      const policy = mergeEntropyPolicies(localMetrics, peerMetrics);
      expect(policy.mode).toBe("immune");
      expect(policy.batchSize).toBe(8);
    });

    it("uses trust-zero when both peers have high nIndex", () => {
      const localMetrics = { negIndex: 0.9 };
      const peerMetrics = { negIndex: 0.88 };
      const policy = mergeEntropyPolicies(localMetrics, peerMetrics);
      expect(policy.mode).toBe("trust-zero");
    });
  });

  describe("Constants", () => {
    it("has correct threshold values", () => {
      expect(ENTROPY_THRESHOLDS.TRUST_ZERO).toBe(0.85);
      expect(ENTROPY_THRESHOLDS.TRUST_LIGHT).toBe(0.65);
      expect(ENTROPY_THRESHOLDS.IMMUNE).toBe(0.4);
    });

    it("has correct batch sizes", () => {
      expect(BATCH_SIZES["trust-zero"]).toBe(64);
      expect(BATCH_SIZES["trust-light"]).toBe(32);
      expect(BATCH_SIZES["immune"]).toBe(8);
      expect(BATCH_SIZES["paranoia"]).toBe(1);
    });
  });
});
