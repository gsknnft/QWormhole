import { describe, expect, it } from "vitest";
import type { FieldSample, NboResult } from "../src/coherence/types";
import {
  buildIdentityMatrix,
  buildNboSignal,
  buildTopologyFromEdgeMap,
  nboVectorized,
  normalizeTopologyRows,
  summarizeNbo,
} from "../src/coherence/nbo";

describe("nbo helpers", () => {
  it("buildIdentityMatrix returns identity", () => {
    const matrix = buildIdentityMatrix(3);
    expect(matrix).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it("normalizeTopologyRows row-normalizes with identity fallback", () => {
    const matrix = [
      [0, 0, 0],
      [1, 1, 2],
      [0, 5, 0],
    ];
    const normalized = normalizeTopologyRows(matrix);
    expect(normalized[0]).toEqual([1, 0, 0]);
    const sumRow1 = normalized[1].reduce((sum, v) => sum + v, 0);
    const sumRow2 = normalized[2].reduce((sum, v) => sum + v, 0);
    expect(sumRow1).toBeCloseTo(1, 6);
    expect(sumRow2).toBeCloseTo(1, 6);
  });

  it("normalizeTopologyRows clamps negatives", () => {
    const matrix = [[-1, 2]];
    const normalized = normalizeTopologyRows(matrix);
    expect(normalized[0][0]).toBeCloseTo(0, 6);
    expect(normalized[0][1]).toBeCloseTo(1, 6);
  });

  it("buildTopologyFromEdgeMap builds matrix in peer order", () => {
    const peers = ["a", "b", "c"];
    const edgeMap = {
      a: { b: 0.2, c: 0.8 },
      b: { a: 1 },
    };
    const matrix = buildTopologyFromEdgeMap(peers, edgeMap);
    expect(matrix).toEqual([
      [0, 0.2, 0.8],
      [1, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("buildNboSignal averages and normalizes flow metrics", () => {
    const samples: FieldSample[] = [
      {
        t: 1,
        latencyP50: 0,
        latencyP95: 100,
        latencyP99: 0,
        errRate: 0.1,
        queueDepth: 0,
        queueSlope: 1,
        corrSpike: 0.5,
      },
      {
        t: 2,
        latencyP50: 0,
        latencyP95: 200,
        latencyP99: 0,
        errRate: 0,
        queueDepth: 0,
        queueSlope: 0,
        corrSpike: 0,
      },
    ];
    const signal = buildNboSignal(samples);
    const expectedRaw = [150, 0.05, 0.5, 0.25];
    const expectedSum = expectedRaw.reduce((sum, v) => sum + v, 0);
    const expected = expectedRaw.map((v) => v / expectedSum);
    expect(signal.length).toBe(4);
    signal.forEach((v, idx) => {
      expect(v).toBeCloseTo(expected[idx], 6);
    });
  });

  it("buildNboSignal returns uniform when all metrics are zero", () => {
    const samples: FieldSample[] = [
      {
        t: 1,
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        errRate: 0,
        queueDepth: 0,
        queueSlope: 0,
        corrSpike: 0,
      },
    ];
    const signal = buildNboSignal(samples);
    expect(signal).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe("nboVectorized", () => {
  it("produces stable outputs within bounds", () => {
    const signal = [0.2, 0.5, 0.3, 0.1];
    const topology = buildIdentityMatrix(signal.length);
    const xVec = new Array<number>(signal.length).fill(0);
    const result = nboVectorized(signal, topology, xVec, {
      bounds: [-0.3, 0.3],
      coordSweeps: 2,
      tol: 1e-3,
      maxIter: 80,
      ridge: 1e-4,
    });

    expect(result.vector.stableStateVector).toHaveLength(signal.length);
    expect(result.vector.epiplexityPerNode).toHaveLength(signal.length);
    expect(result.vector.epiplexityWeights).toHaveLength(signal.length);
    expect(result.scalar.stableState).toBeGreaterThanOrEqual(-0.3);
    expect(result.scalar.stableState).toBeLessThanOrEqual(0.3);

    const weightAbsSum = result.vector.epiplexityWeights.reduce(
      (sum, v) => sum + Math.abs(v),
      0,
    );
    expect(weightAbsSum).toBeGreaterThanOrEqual(0);
    expect(weightAbsSum).toBeLessThanOrEqual(1.000001);
  });

  it("throws on mismatched topology sizes", () => {
    expect(() =>
      nboVectorized([1, 2], [[1, 0, 0], [0, 1, 0]], [0, 0], {}),
    ).toThrow();
  });
});

describe("summarizeNbo", () => {
  it("adds alignment and freshness metadata", () => {
    const result: NboResult = {
      origEnt: 1,
      origNeg: 0.5,
      scalar: {
        finalEnt: 0.8,
        finalNeg: 0.6,
        epiplexity: 0.2,
        negentropicGain: 0.1,
        stableState: 0.1,
        basinWidthRaw: 0.5,
        basinWidthPenalty: 0.2,
      },
      vector: {
        finalEnt: 0.7,
        finalNeg: 0.65,
        epiplexity: 0.3,
        negentropicGain: 0.15,
        stableStateVector: [0.1, -0.1, 0],
        epiplexityPerNode: [0.2, -0.1, 0],
        epiplexityWeights: [0.5, -0.25, 0],
      },
      bounds: [-1, 1],
      couplingStrength: 0.5,
    };

    const summary = summarizeNbo(result, 2, { updatedAt: 1_000, ageMs: 50 });
    expect(summary.topNodes).toHaveLength(2);
    expect(summary.topNodes[0].index).toBe(0);
    expect(summary.topNodes[0].alignment).toBe("stabilizing");
    expect(summary.topNodes[1].alignment).toBe("destabilizing");
    expect(summary.updatedAt).toBe(1_000);
    expect(summary.ageMs).toBe(50);
  });
});
