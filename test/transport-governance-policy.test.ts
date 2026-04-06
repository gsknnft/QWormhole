import { describe, expect, it } from "vitest";
import { deriveTransportGovernancePolicy } from "../src/core/transport-governance-policy";

describe("transport governance policy", () => {
  it("promotes throughput only when coherence density and persistence certify headroom", () => {
    const policy = deriveTransportGovernancePolicy({
      gamma: 1.05,
      entropy: 0.22,
      confidence: 0.91,
      coherenceDensity: 0.72,
      structuralPersistence: 0.81,
      metastability: 0.18,
      transportSNI: 0.72,
      transportSPI: 0.81,
      transportMetastability: 0.18,
      regime: "stable-gradient",
    });

    expect(policy.mode).toBe("throughput");
    expect(policy.reason).toContain("persistence_certified");
  });

  it("falls back to guarded mode when persistence collapses even if entropy looks fine", () => {
    const policy = deriveTransportGovernancePolicy({
      gamma: 1.1,
      entropy: 0.28,
      confidence: 0.84,
      coherenceDensity: 0.61,
      structuralPersistence: 0.22,
      metastability: 0.72,
      regime: "stable-orbit",
    });

    expect(policy.mode).toBe("guarded");
    expect(policy.reason).toContain("persistence_low");
    expect(policy.reason).toContain("metastability_high");
  });
});
