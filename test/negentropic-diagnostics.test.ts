import {
  RollingHistogram,
  shannonEntropy,
  negentropy,
  mapCoherence,
  mapVelocity,
  Coherence,
  Velocity,
} from "../src/utils/negentropic-diagnostics";
import { describe, it, expect } from "vitest";

describe("Negentropic Diagnostics", () => {
  it("computes histogram and entropy", () => {
    const hist = new RollingHistogram(10);
    ["A", "A", "B", "C", "A", "B", "B", "C", "C", "C"].forEach(t =>
      hist.add(t),
    );
    const freq = hist.frequencies();
    expect(freq).toEqual({ A: 3, B: 3, C: 4 });
    expect(shannonEntropy(freq)).toBeCloseTo(1.57, 2);
    expect(negentropy(freq)).toBeCloseTo(0.42, 2);
  });
  it("maps negentropy to coherence", () => {
    expect(mapCoherence(2)).toBe(Coherence.High);
    expect(mapCoherence(1)).toBe(Coherence.Medium);
    expect(mapCoherence(0.2)).toBe(Coherence.Low);
  });
  it("maps entropy velocity to velocity", () => {
    expect(mapVelocity(2)).toBe(Velocity.Fast);
    expect(mapVelocity(0.5)).toBe(Velocity.Moderate);
    expect(mapVelocity(0.1)).toBe(Velocity.Slow);
  });
});
