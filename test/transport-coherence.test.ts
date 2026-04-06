import { describe, expect, it } from "vitest";
import { computeTransportCoherence } from "../src/core/transport-coherence";

describe("computeTransportCoherence", () => {
  it("rewards stable flush and slice structure", () => {
    const baseTs = 1_000;
    const snapshot = computeTransportCoherence({
      sliceHistory: Array.from({ length: 12 }, (_, index) => ({
        timestamp: baseTs + index * 20,
        size: 24,
      })),
      flushHistory: Array.from({ length: 16 }, (_, index) => ({
        timestamp: baseTs + index * 10,
        bytes: 24_000,
        frames: 24,
      })),
      backpressureHistory: [],
      eluIdleRatioAvg: 0.82,
      gcPauseMaxMs: 1.2,
      payloadEntropy: 0.1,
      payloadNegentropy: 0.88,
    });

    expect(snapshot.transportSNI).toBeGreaterThan(0.7);
    expect(snapshot.transportSPI).toBeGreaterThan(0.7);
    expect(snapshot.transportMetastability).toBeLessThan(0.35);
  });

  it("penalizes clustered backpressure and irregular batching", () => {
    const snapshot = computeTransportCoherence({
      sliceHistory: [
        { timestamp: 0, size: 4 },
        { timestamp: 10, size: 64 },
        { timestamp: 20, size: 8 },
        { timestamp: 30, size: 48 },
      ],
      flushHistory: [
        { timestamp: 0, bytes: 2048, frames: 2 },
        { timestamp: 7, bytes: 65536, frames: 40 },
        { timestamp: 80, bytes: 4096, frames: 3 },
        { timestamp: 95, bytes: 98304, frames: 64 },
      ],
      backpressureHistory: [20, 21, 22, 90],
      eluIdleRatioAvg: 0.12,
      gcPauseMaxMs: 28,
      payloadEntropy: 1.4,
      payloadNegentropy: 0.05,
    });

    expect(snapshot.backpressureBoundedness).toBeLessThan(0.5);
    expect(snapshot.transportSPI).toBeLessThan(0.55);
    expect(snapshot.transportMetastability).toBeGreaterThan(0.45);
  });
});
