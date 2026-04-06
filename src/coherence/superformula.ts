import { clamp } from "./invariants";

export interface PolarPoint {
  angle: number;
  radius: number;
}

export interface CartesianPoint {
  x: number;
  y: number;
}

export interface SuperformulaParams {
  m: number;
  n1: number;
  n2: number;
  n3: number;
  a: number;
  b: number;
}

export interface SuperformulaFitResult {
  lossMode: LossMode;
  losses: number[];
  seedStability: {
    fitErrorStdDev: number;
    mStdDev: number;
    n1StdDev: number;
    n2StdDev: number;
    n3StdDev: number;
  };
  seedResults: Array<{
    params: SuperformulaParams;
    fitError: number;
  }>;
  huberDelta?: number;
}

export interface GeometricSignature {
  symmetry: number;
  roughness: number;
  anisotropy: number;
  fitError?: number;
  fitErrorStability?: number;
  sampleSize: number;
  superformula?: SuperformulaFitResult;
}

export type LossMode = "mae" | "huber";

export interface FitSuperformulaOptions {
  seeds?: number;
  iterations?: number;
  randomSeed?: number;
  lossMode?: LossMode;
  huberDelta?: number;
}

export interface ExtractGeometricSignatureOptions {
  includeSuperformulaFit?: boolean;
  histogramBins?: number;
  harmonics?: number;
  fit?: FitSuperformulaOptions;
}

export interface GeometricCalibrationProfile {
  minSampleSize: number;
  stableFitStdDev: number;
  trustedFitError: number;
  weights: {
    symmetry: number;
    roughnessPenalty: number;
    anisotropyPenalty: number;
    fitErrorPenalty: number;
  };
}

export interface CalibratedGeometricScore {
  coherenceProxy: number;
  entropyProxy: number;
  advisoryWeight: number;
  score: number;
  diagnostics: string[];
}

const EPS = 1e-9;
const DEFAULT_CALIBRATION_PROFILE: GeometricCalibrationProfile = {
  minSampleSize: 24,
  stableFitStdDev: 0.08,
  trustedFitError: 0.2,
  weights: {
    symmetry: 0.55,
    roughnessPenalty: 0.2,
    anisotropyPenalty: 0.1,
    fitErrorPenalty: 0.15,
  },
};


export function generateSuperformulaPoints(params: SuperformulaParams, samples: number): PolarPoint[] {
  const points: PolarPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * 2 * Math.PI;
    const radius = superformulaRadius(angle, params);
    points.push({ angle, radius });
  }
  return points;
}

export function generateCircle(radius: number, samples: number): PolarPoint[] {
  const points: PolarPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * 2 * Math.PI;
    points.push({ angle, radius });
  }
  return points;
}

export function extractGeometricSignature(
  inputPoints: PolarPoint[],
  options: ExtractGeometricSignatureOptions = {},
): GeometricSignature {
  const points = sanitize(inputPoints);
  const histogramBins = Math.max(8, options.histogramBins ?? 36);
  const harmonics = Math.max(4, options.harmonics ?? 12);
  const histogram = buildAngularHistogram(points, histogramBins);
  const fft = radialProfileFFT(histogram, harmonics);
  const symmetry = computeSymmetryScore(histogram, fft.magnitudes);
  const roughness = clamp(fft.spectralFlatness, 0, 1);
  const anisotropy = clamp(1 - symmetry, 0, 1);

  const out: GeometricSignature = {
    symmetry,
    roughness,
    anisotropy,
    sampleSize: points.length,
  };

  if (options.includeSuperformulaFit) {
    const fit = fitSuperformula(points, options.fit ?? {});
    out.superformula = fit;
    out.fitError =
      fit.seedResults
        .map((result) => result.fitError)
        .reduce((a, b) => a + b, 0) / fit.seedResults.length;
    out.fitErrorStability = fit.seedStability.fitErrorStdDev;
  }

  return out;
}

export function fitSuperformula(
  inputPoints: PolarPoint[],
  options: FitSuperformulaOptions = {},
): SuperformulaFitResult {
  const points = sanitize(inputPoints);
  const seeds = Math.max(4, options.seeds ?? 12);
  const iterations = Math.max(20, options.iterations ?? 60);
  const lossMode = options.lossMode ?? "mae";
  const huberDelta = Math.max(0.001, options.huberDelta ?? 0.15);
  const rng = createRng(options.randomSeed);
  const seedParams = buildSeedParams(seeds, rng);
  const seedResults: Array<{ params: SuperformulaParams; fitError: number }> =
    [];

  for (const seed of seedParams) {
    seedResults.push(
      localSearch(points, seed, iterations, lossMode, huberDelta),
    );
  }

  seedResults.sort((a, b) => a.fitError - b.fitError);
  const top = seedResults.slice(0, Math.min(5, seedResults.length));
  return {
    seedResults,
    lossMode,
    huberDelta: lossMode === "huber" ? huberDelta : undefined,
    seedStability: {
      fitErrorStdDev: stddev(top.map((s) => s.fitError)),
      mStdDev: stddev(top.map((s) => s.params.m)),
      n1StdDev: stddev(top.map((s) => s.params.n1)),
      n2StdDev: stddev(top.map((s) => s.params.n2)),
      n3StdDev: stddev(top.map((s) => s.params.n3)),
    },
    losses: top.map((s) => s.fitError),
  };
}

export function calibrateGeometricSignal(
  signature: GeometricSignature,
  profile: Partial<GeometricCalibrationProfile> = {},
): CalibratedGeometricScore {
  const cfg: GeometricCalibrationProfile = {
    ...DEFAULT_CALIBRATION_PROFILE,
    ...profile,
    weights: {
      ...DEFAULT_CALIBRATION_PROFILE.weights,
      ...(profile.weights ?? {}),
    },
  };

  const diagnostics: string[] = [];
  const fitError = signature.fitError;
  const fitStability = signature.fitErrorStability;
  const hasFit =
    typeof fitError === "number" && typeof fitStability === "number";

  if (!hasFit) diagnostics.push("superformula fit disabled");
  if (signature.sampleSize < cfg.minSampleSize)
    diagnostics.push("low sample size");
  if (hasFit && (fitStability as number) > cfg.stableFitStdDev)
    diagnostics.push("fit instability");

  const coherenceProxy = clamp(
    cfg.weights.symmetry * signature.symmetry +
      (1 - cfg.weights.symmetry) * (1 - signature.roughness),
    0,
    1,
  );

  const entropyProxy = clamp(
    cfg.weights.roughnessPenalty * signature.roughness +
      cfg.weights.anisotropyPenalty * signature.anisotropy +
      cfg.weights.fitErrorPenalty * (hasFit ? (fitError as number) : 0.5),
    0,
    1,
  );

  const fitTrust =
    hasFit &&
    (fitError as number) <= cfg.trustedFitError &&
    (fitStability as number) <= cfg.stableFitStdDev
      ? 1
      : hasFit
        ? 0.6
        : 0.4;
  const sampleTrust = clamp(
    signature.sampleSize / Math.max(cfg.minSampleSize, 1),
    0.35,
    1,
  );
  const advisoryWeight = clamp(fitTrust * sampleTrust, 0, 1);

  return {
    coherenceProxy,
    entropyProxy,
    advisoryWeight,
    score: clamp(coherenceProxy * (1 - entropyProxy) * advisoryWeight, 0, 1),
    diagnostics,
  };
}

export function superformulaRadius(
  phi: number,
  params: SuperformulaParams,
): number {
  const a = Math.max(EPS, Math.abs(params.a));
  const b = Math.max(EPS, Math.abs(params.b));
  const n1 = clamp(params.n1, 0.15, 32);
  const n2 = clamp(params.n2, 0.15, 32);
  const n3 = clamp(params.n3, 0.15, 32);
  const m = clamp(params.m, 0.5, 64);

  const t1 = Math.pow(Math.abs(Math.cos((m * phi) / 4) / a), n2);
  const t2 = Math.pow(Math.abs(Math.sin((m * phi) / 4) / b), n3);
  const base = Math.max(EPS, t1 + t2);
  return Math.pow(base, -1 / n1);
}

function sanitize(inputPoints: PolarPoint[]): PolarPoint[] {
  const cleaned = inputPoints
    .filter(
      (p) =>
        Number.isFinite(p.angle) && Number.isFinite(p.radius) && p.radius >= 0,
    )
    .map((p) => ({ angle: normalizeAngle(p.angle), radius: p.radius }));
  if (cleaned.length < 8) {
    throw new Error("Need at least 8 valid polar points.");
  }
  const maxRadius = Math.max(...cleaned.map((p) => p.radius), EPS);
  return cleaned
    .map((p) => ({ angle: p.angle, radius: p.radius / maxRadius }))
    .sort((a, b) => a.angle - b.angle);
}

function buildAngularHistogram(points: PolarPoint[], bins: number): number[] {
  const histogram = Array.from({ length: bins }, () => 0);
  for (const p of points) {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((normalizeAngle(p.angle) / (Math.PI * 2)) * bins)),
    );
    histogram[idx] += p.radius;
  }
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total <= EPS) return histogram;
  return histogram.map((v) => v / total);
}

function radialProfileFFT(
  histogram: number[],
  harmonics: number,
): {
  magnitudes: number[];
  dominantHarmonic: number;
  spectralFlatness: number;
} {
  const N = histogram.length;
  const mags: number[] = [];
  const K = Math.min(harmonics, Math.floor(N / 2));
  for (let k = 1; k <= K; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n += 1) {
      const a = (2 * Math.PI * k * n) / N;
      re += histogram[n] * Math.cos(a);
      im -= histogram[n] * Math.sin(a);
    }
    mags.push(Math.sqrt(re * re + im * im));
  }
  const dominantHarmonic =
    mags.findIndex((v) => v === Math.max(...mags, EPS)) + 1;
  const gmean = Math.exp(
    mags.reduce((sum, v) => sum + Math.log(Math.max(EPS, v)), 0) / mags.length,
  );
  const amean = mags.reduce((a, b) => a + b, 0) / Math.max(1, mags.length);
  return {
    magnitudes: mags,
    dominantHarmonic,
    spectralFlatness: amean > EPS ? gmean / amean : 0,
  };
}

export function spectralTexture(mags: number[]) {
  const gmean = Math.exp(
    mags.reduce((sum, v) => sum + Math.log(Math.max(EPS, v)), 0) / mags.length,
  );
  const amean = mags.reduce((a, b) => a + b, 0) / Math.max(1, mags.length);
  const spectralFlatness = amean > EPS ? gmean / amean : 0;
  return spectralFlatness;
}

export function computeSymmetryScore(
  histogram: number[],
  mags: number[],
): number {
  const N = histogram.length;
  if (N % 2 !== 0) return 0;
  let diff = 0;
  let sum = 0;
  for (let i = 0; i < N / 2; i += 1) {
    const a = histogram[i];
    const b = histogram[i + N / 2];
    diff += Math.abs(a - b);
    sum += Math.abs(a) + Math.abs(b);
  }
  const mirror = 1 - diff / Math.max(EPS, sum);
  const energy = mags.reduce((acc, v) => acc + v * v, 0);
  const lowEven = mags
    .map((v, i) => ({ v, i: i + 1 }))
    .filter((x) => x.i % 2 === 0 && x.i <= 6)
    .reduce((acc, x) => acc + x.v * x.v, 0);
  const evenRatio = energy > EPS ? lowEven / energy : 0;
  return clamp(0.6 * mirror + 0.4 * evenRatio, 0, 1);
}

export function loss(points: PolarPoint[], params: SuperformulaParams): number {
  return computeLoss(points, params, "mae", 0.15);
}

export function computeLoss(
  points: PolarPoint[],
  params: SuperformulaParams,
  mode: LossMode,
  huberDelta: number,
): number {
  let total = 0;
  for (const p of points) {
    const pred = superformulaRadius(p.angle, params);
    const residual = (pred - p.radius) / Math.max(EPS, p.radius + 0.05);
    const absResidual = Math.abs(residual);
    if (mode === "huber") {
      total +=
        absResidual <= huberDelta
          ? 0.5 * residual * residual
          : huberDelta * (absResidual - 0.5 * huberDelta);
    } else {
      total += absResidual;
    }
  }
  return total / points.length;
}

export function localSearch(
  points: PolarPoint[],
  seed: SuperformulaParams,
  iterations: number,
  lossMode: LossMode,
  huberDelta: number,
): { params: SuperformulaParams; fitError: number } {
  let current = { ...seed };
  let currentLoss = computeLoss(points, current, lossMode, huberDelta);
  const step = { m: 2.2, n1: 1.1, n2: 1.2, n3: 1.2, a: 0.18, b: 0.18 };
  for (let it = 0; it < iterations; it += 1) {
    let improved = false;
    const keys: Array<keyof SuperformulaParams> = [
      "m",
      "n1",
      "n2",
      "n3",
      "a",
      "b",
    ];
    for (const key of keys) {
      const delta = step[key];
      const candidates: SuperformulaParams[] = [
        { ...current, [key]: current[key] + delta },
        { ...current, [key]: current[key] - delta },
      ];
      for (const c of candidates) {
        const bounded = boundParams(c);
        const v = computeLoss(points, bounded, lossMode, huberDelta);
        if (v + 1e-6 < currentLoss) {
          current = bounded;
          currentLoss = v;
          improved = true;
        }
      }
    }
    if (!improved) {
      step.m *= 0.78;
      step.n1 *= 0.74;
      step.n2 *= 0.74;
      step.n3 *= 0.74;
      step.a *= 0.72;
      step.b *= 0.72;
    }
  }
  return { params: boundParams(current), fitError: currentLoss };
}

function buildSeedParams(
  seeds: number,
  rng: () => number,
): SuperformulaParams[] {
  const out: SuperformulaParams[] = [
    { m: 4, n1: 2, n2: 2, n3: 2, a: 1, b: 1 },
    { m: 6, n1: 1.5, n2: 2.4, n3: 2.4, a: 1, b: 1 },
    { m: 8, n1: 1.2, n2: 3.2, n3: 3.2, a: 1, b: 1 },
    { m: 3, n1: 0.8, n2: 2.8, n3: 2.8, a: 1, b: 1 },
  ];
  while (out.length < seeds) {
    out.push({
      m: randIn(2, 24, rng),
      n1: randIn(0.4, 10, rng),
      n2: randIn(0.4, 10, rng),
      n3: randIn(0.4, 10, rng),
      a: randIn(0.7, 1.3, rng),
      b: randIn(0.7, 1.3, rng),
    });
  }
  return out.slice(0, seeds).map(boundParams);
}

function normalizeAngle(theta: number): number {
  const twoPi = Math.PI * 2;
  let t = theta % twoPi;
  if (t < 0) t += twoPi;
  return t;
}

function boundParams(params: SuperformulaParams): SuperformulaParams {
  return {
    m: clamp(params.m, 0.5, 64),
    n1: clamp(params.n1, 0.15, 32),
    n2: clamp(params.n2, 0.15, 32),
    n3: clamp(params.n3, 0.15, 32),
    a: clamp(params.a, 0.2, 3),
    b: clamp(params.b, 0.2, 3),
  };
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function randIn(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min);
}

function createRng(seed?: number): () => number {
  if (seed === undefined || !Number.isFinite(seed)) {
    return () => Math.random();
  }
  let state = Math.floor(seed) >>> 0 || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
