import type { Alignment, FieldSample, /* NboAttribution, */ NboOptions, NboResult, NboSummary } from "./types";

const EPS = 1e-12;

export function buildIdentityMatrix(size: number): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i < size; i += 1) {
    const row = new Array<number>(size).fill(0);
    row[i] = 1;
    matrix.push(row);
  }
  return matrix;
}

export function normalizeTopologyRows(matrix: number[][]): number[][] {
  const size = matrix.length;
  return matrix.map((row, rowIndex) => {
    const clipped = row.map((value) => Math.max(0, safeValue(value)));
    const sum = clipped.reduce((acc, value) => acc + value, 0);
    if (sum <= EPS) {
      if (row.length === size) {
        const identity = new Array<number>(row.length).fill(0);
        identity[rowIndex] = 1;
        return identity;
      }
      const uniform = row.length > 0 ? 1 / row.length : 0;
      return new Array<number>(row.length).fill(uniform);
    }
    return clipped.map((value) => value / sum);
  });
}

export function buildTopologyFromEdgeMap(
  peers: string[],
  edgeMap: Record<string, Record<string, number>>,
): number[][] {
  const size = peers.length;
  const index = new Map<string, number>();
  for (let i = 0; i < size; i += 1) {
    index.set(peers[i], i);
  }
  const matrix = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  for (const from in edgeMap) {
    const fromIndex = index.get(from);
    if (fromIndex === undefined) continue;
    const row = edgeMap[from];
    for (const to in row) {
      const toIndex = index.get(to);
      if (toIndex === undefined) continue;
      matrix[fromIndex][toIndex] = safeValue(row[to]);
    }
  }
  return matrix;
}

export function buildNboSignal(samples: FieldSample[]): number[] {
  if (!samples.length) return [];
  let latencyP95 = 0;
  let errRate = 0;
  let queueSlope = 0;
  let corrSpike = 0;

  for (const sample of samples) {
    latencyP95 += safeValue(sample.latencyP95);
    errRate += safeValue(sample.errRate);
    queueSlope += Math.max(0, safeValue(sample.queueSlope));
    corrSpike += Math.max(0, safeValue(sample.corrSpike));
  }

  const count = samples.length;
  const raw = [
    latencyP95 / count,
    errRate / count,
    queueSlope / count,
    corrSpike / count,
  ];

  return normalizeVector(raw);
}

function shannonEntropy(p: number[]): number {
  const n = p.length;
  if (!n) return 0;
  let sum = 0;
  const clipped = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const v = Math.max(EPS, safeValue(p[i]));
    clipped[i] = v;
    sum += v;
  }
  if (sum <= 0) return 0;
  let h = 0;
  for (let i = 0; i < n; i += 1) {
    const pv = clipped[i] / sum;
    h -= pv * Math.log2(pv);
  }
  return h;
}

function ksNegentropy(p: number[]): number {
  const n = p.length;
  if (!n) return 0;
  const h = shannonEntropy(p);
  const hmax = Math.log2(n) || 1;
  const neg = 1 - h / hmax;
  return clamp01(neg);
}

export function boundedMinimize(
  f: (x: number) => number,
  lo = -1,
  hi = 1,
  tol = 1e-5,
  maxIter = 200,
): number {
  const phi = (1 + Math.sqrt(5)) / 2;
  const invphi = 1 / phi;
  const invphi2 = invphi * invphi;
  let a = lo;
  let b = hi;
  let h = b - a;
  if (h <= tol) return (a + b) / 2;
  const n = Math.ceil(Math.log(tol / h) / Math.log(invphi));
  let c = a + invphi2 * h;
  let d = a + invphi * h;
  let fc = f(c);
  let fd = f(d);
  const iters = Math.min(n, maxIter);
  for (let i = 0; i < iters; i += 1) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      h = invphi * h;
      c = a + invphi2 * h;
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      h = invphi * h;
      d = a + invphi * h;
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

export function nboVectorized(
  signal: number[],
  topology: number[][],
  xVec: number[],
  options: NboOptions = {},
): NboResult {
  const n = signal.length;
  if (!n) {
    return {
      origEnt: 0,
      origNeg: 0,
      scalar: {
        finalEnt: 0,
        finalNeg: 0,
        epiplexity: 0,
        negentropicGain: 0,
        stableState: 0,
        basinWidthRaw: 0,
        basinWidthPenalty: 0,
      },
      vector: {
        finalEnt: 0,
        finalNeg: 0,
        epiplexity: 0,
        negentropicGain: 0,
        stableStateVector: [],
        epiplexityPerNode: [],
        epiplexityWeights: [],
      },
      bounds: normalizeBounds(options.bounds ?? [-0.3, 0.3]),
      couplingStrength: options.couplingStrength ?? 0.5,
    };
  }

  if (topology.length !== n || xVec.length !== n) {
    throw new Error("nboVectorized requires matching signal, topology, and xVec sizes.");
  }
  for (const row of topology) {
    if (row.length !== n) {
      throw new Error("nboVectorized requires a square topology matrix.");
    }
  }

  const couplingStrength = options.couplingStrength ?? 0.5;
  const [lo, hi] = normalizeBounds(options.bounds ?? [-0.3, 0.3]);
  const minProb = options.minProb ?? 1e-6;
  const boundaryMargin = options.boundaryMargin ?? 0.05;
  const boundPenalty = options.boundPenalty ?? 1.0;
  const ridge = options.ridge ?? 1e-3;
  const coordSweeps = options.coordSweeps ?? 4;
  const tol = options.tol ?? 1e-4;
  const maxIter = options.maxIter ?? 200;
  const curvatureDelta = options.curvatureDelta ?? 0.01;

  const baseField = new Array<number>(n);
  const wx = multiplyMatrixVector(topology, xVec);
  for (let i = 0; i < n; i += 1) {
    baseField[i] = Math.max(EPS, safeValue(signal[i]) + couplingStrength * wx[i]);
  }

  const origEnt = shannonEntropy(baseField);
  const origNeg = ksNegentropy(baseField);

  const penaltyTerm = (offsets: number[]): number => {
    let sum = 0;
    let minC = Number.POSITIVE_INFINITY;
    let minProximity = Number.POSITIVE_INFINITY;
    let ridgeSum = 0;
    for (let i = 0; i < n; i += 1) {
      const offset = offsets[i];
      const c = Math.max(EPS, baseField[i] + couplingStrength * offset);
      sum += c;
      minC = Math.min(minC, c);
      const proximity = Math.min(offset - lo, hi - offset);
      minProximity = Math.min(minProximity, proximity);
      if (ridge) ridgeSum += offset * offset;
    }
    const pMin = sum > 0 ? minC / sum : 0;
    let penalty = 0;
    if (pMin < minProb) {
      penalty += boundPenalty * (minProb - pMin) / minProb;
    }
    if (minProximity < boundaryMargin) {
      penalty += boundPenalty * (boundaryMargin - minProximity) / boundaryMargin;
    }
    if (ridge) {
      penalty += ridge * ridgeSum;
    }
    return penalty;
  };

  const entropyWithPenalty = (offsets: number[]): number => {
    let sum = 0;
    const c = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const value = Math.max(EPS, baseField[i] + couplingStrength * offsets[i]);
      c[i] = value;
      sum += value;
    }
    let h = 0;
    for (let i = 0; i < n; i += 1) {
      const p = c[i] / sum;
      h -= p * Math.log2(p);
    }
    return h + penaltyTerm(offsets);
  };

  const entropyAtScalarOffset = (xOffset: number): number =>
    entropyWithPenalty(new Array<number>(n).fill(xOffset));

  const xStarScalar = boundedMinimize(
    entropyAtScalarOffset,
    lo,
    hi,
    tol,
    maxIter,
  );

  const rawEntropyAtScalarOffset = (xOffset: number): number => {
    let sum = 0;
    const c = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const value = Math.max(EPS, baseField[i] + couplingStrength * xOffset);
      c[i] = value;
      sum += value;
    }
    let h = 0;
    for (let i = 0; i < n; i += 1) {
      const p = c[i] / sum;
      h -= p * Math.log2(p);
    }
    return h;
  };

  const delta = Math.max(curvatureDelta, 1e-6);
  const hCenter = rawEntropyAtScalarOffset(xStarScalar);
  const hLeft = rawEntropyAtScalarOffset(clamp(xStarScalar - delta, lo, hi));
  const hRight = rawEntropyAtScalarOffset(clamp(xStarScalar + delta, lo, hi));
  const curvatureRaw = Math.max((hLeft - 2 * hCenter + hRight) / (delta * delta), 1e-9);
  const basinWidthRaw = 1 / Math.sqrt(curvatureRaw);

  const penCenter = penaltyTerm(new Array<number>(n).fill(xStarScalar));
  const penLeft = penaltyTerm(new Array<number>(n).fill(clamp(xStarScalar - delta, lo, hi)));
  const penRight = penaltyTerm(new Array<number>(n).fill(clamp(xStarScalar + delta, lo, hi)));
  const curvaturePenalty = Math.max(
    (penLeft - 2 * penCenter + penRight) / (delta * delta),
    1e-9,
  );
  const basinWidthPenalty = 1 / Math.sqrt(curvaturePenalty);

  const offsets = new Array<number>(n).fill(0);
  for (let sweep = 0; sweep < coordSweeps; sweep += 1) {
    for (let i = 0; i < n; i += 1) {
      const f = (xi: number) => {
        const trial = offsets.slice();
        trial[i] = xi;
        return entropyWithPenalty(trial);
      };
      offsets[i] = boundedMinimize(f, lo, hi, tol, maxIter);
    }
  }

  const entropySingleOffset = (idx: number, offsetVal: number): number => {
    let sum = 0;
    const c = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const offset = i === idx ? offsetVal : 0;
      const value = Math.max(EPS, baseField[i] + couplingStrength * offset);
      c[i] = value;
      sum += value;
    }
    let h = 0;
    for (let i = 0; i < n; i += 1) {
      const p = c[i] / sum;
      h -= p * Math.log2(p);
    }
    return h;
  };

  const epiplexityPerNode = offsets.map((offset, idx) => origEnt - entropySingleOffset(idx, offset));
  const weightDenom = epiplexityPerNode.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  ) + EPS;
  const epiplexityWeights = epiplexityPerNode.map((value) => value / weightDenom);

  const coupledScalar = baseField.map((value) =>
    Math.max(EPS, value + couplingStrength * xStarScalar),
  );
  const finalEntScalar = shannonEntropy(coupledScalar);
  const finalNegScalar = ksNegentropy(coupledScalar);

  const coupledVec = baseField.map((value, i) =>
    Math.max(EPS, value + couplingStrength * offsets[i]),
  );
  const finalEntVec = shannonEntropy(coupledVec);
  const finalNegVec = ksNegentropy(coupledVec);

  return {
    origEnt,
    origNeg,
    scalar: {
      finalEnt: finalEntScalar,
      finalNeg: finalNegScalar,
      epiplexity: origEnt - finalEntScalar,
      negentropicGain: finalNegScalar - origNeg,
      stableState: xStarScalar,
      basinWidthRaw,
      basinWidthPenalty,
    },
    vector: {
      finalEnt: finalEntVec,
      finalNeg: finalNegVec,
      epiplexity: origEnt - finalEntVec,
      negentropicGain: finalNegVec - origNeg,
      stableStateVector: offsets.slice(),
      epiplexityPerNode: epiplexityPerNode.slice(),
      epiplexityWeights: epiplexityWeights.slice(),
    },
    bounds: [lo, hi],
    couplingStrength,
  };
}

export function summarizeNbo(
  result: NboResult,
  topN = 5,
  meta?: { updatedAt?: number; ageMs?: number },
): NboSummary {
  const weights = result.vector.epiplexityWeights;
  const epi = result.vector.epiplexityPerNode;
  const indices = weights.map((_, i) => i);
  indices.sort((a, b) => Math.abs(weights[b]) - Math.abs(weights[a]));
  const top = indices.slice(0, Math.min(topN, indices.length)).map((idx) => ({
    index: idx,
    weight: weights[idx],
    epiplexity: epi[idx],
    alignment:
      epi[idx] > 0 ? "stabilizing" : epi[idx] < 0 ? "destabilizing" : "neutral" as Alignment,
  }));
  return {
    epiplexity: result.vector.epiplexity,
    negentropicGain: result.vector.negentropicGain,
    stableState: result.scalar.stableState,
    basinWidthRaw: result.scalar.basinWidthRaw,
    basinWidthPenalty: result.scalar.basinWidthPenalty,
    topNodes: top,
    bounds: result.bounds,
    couplingStrength: result.couplingStrength,
    signalLength: result.vector.epiplexityPerNode.length,
    updatedAt: meta?.updatedAt ?? Date.now(),
    ageMs: meta?.ageMs ?? 0,
  };
}

function normalizeVector(values: number[]): number[] {
  const clipped = values.map((value) => Math.max(0, safeValue(value)));
  const sum = clipped.reduce((acc, value) => acc + value, 0);
  if (sum <= EPS) {
    const len = values.length;
    if (!len) return [];
    const uniform = 1 / len;
    return new Array<number>(len).fill(uniform);
  }
  return clipped.map((value) => value / sum);
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  const n = matrix.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = matrix[i];
    let sum = 0;
    for (let j = 0; j < n; j += 1) {
      sum += safeValue(row[j]) * safeValue(vector[j]);
    }
    out[i] = sum;
  }
  return out;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeBounds(bounds: [number, number]): [number, number] {
  const lo = bounds[0];
  const hi = bounds[1];
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function safeValue(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}


/* 
How to wire trust graph + flow signal into coherence NBO adapter
Use the new helpers from nbo.ts at the call site that has access to trust data:


import {
  buildTopologyFromEdgeMap,
  normalizeTopologyRows,
} from "../coherence/nbo";
import { buildF, buildEdges, buildEdgeMap } from "./services/trust/Edge";

// peers + gcsInclusions live in TrustManager or caller scope
const F = buildF(peers, gcsInclusions);
const edgeMap = buildEdgeMap(buildEdges(F));
const topology = normalizeTopologyRows(buildTopologyFromEdgeMap(peers, edgeMap));

attachCoherenceAdapter(framer, flow, {
  emit,
  nbo: {
    enabled: true,
    topologyMatrix: topology, // trust graph
    normalizeTopology: false, // already normalized
  },
});

If you want, I can add a small helper method on TrustManager to expose edgeMap (or a ready‑to‑use matrix) so this wiring is trivial.



*/
