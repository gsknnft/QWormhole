import WebSocket, { WebSocketServer } from "ws";
import { resolve } from "path";
import { CoherenceLoop } from "./loop";
import { CommitmentDetector } from "./commitment-detector";
import { ResolutionDetector } from "./resolution";
import type { CoherenceConfig, CouplingParams, FieldSample } from "./types";
import { WSTransport, WSTransportServer } from "../transports/ws/ws-transport";
import type { MuxStream } from "../transports/mux/mux-stream";
import {
  signalTrialMessageSchema,
  type SignalTrialAction,
  type SignalTrialDifficulty,
  type SignalTrialMessage,
  type SignalTrialPhase,
  type SignalTrialProfile,
  type SignalTrialTelemetry,
  type SignalTrialResolutionTier,
  type SignalTrialTier,
} from "../schema/signal-trial";

const cfg: CoherenceConfig = {
  Hmin: 1.2,
  maxDelta: { batchSize: 4, paceMs: 10 },
  floors: { batchSize: 1 },
  ceilings: { batchSize: 128, paceMs: 1000 },
};

const baseCoupling: CouplingParams = {
  batchSize: 16,
  concurrency: 4,
  redundancy: 1,
  paceMs: 250,
};

const baseSample = {
  latencyP50: 64,
  latencyP95: 74,
  latencyP99: 82,
  errRate: 0.004,
  queueDepth: 10,
  queueSlope: 0.02,
  corrSpike: 0,
};

const sampleJitter = {
  latencyMs: 4,
  errRate: 0.002,
  queueSlope: 0.02,
  corrSpike: 0.12,
};

type GateConfig = {
  minUptimeMs: number;
  minActions: number;
  holdMs: number;
  quietHoldMs: number;
  collapseHoldMs: number;
};

const difficultyGates: Record<SignalTrialDifficulty, GateConfig> = {
  easy: { minUptimeMs: 8000, minActions: 1, holdMs: 3000, quietHoldMs: 3000, collapseHoldMs: 700 },
  standard: { minUptimeMs: 12000, minActions: 2, holdMs: 5000, quietHoldMs: 5000, collapseHoldMs: 900 },
  hard: { minUptimeMs: 16000, minActions: 3, holdMs: 7000, quietHoldMs: 7000, collapseHoldMs: 1100 },
  chaos: { minUptimeMs: 20000, minActions: 4, holdMs: 9000, quietHoldMs: 9000, collapseHoldMs: 1300 },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampRange = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const readNumber = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const observerDefaults = {
  historyWindow: 12,
  vEps: 0.02,
  mMin: 0.8,
  mStdMax: 0.02,
  latencyStdMax: 0.08,
  residualMax: 1.1,
  minEventGapSteps: 12,
  falsifyAfterSteps: 200,
  vScale: 0.02,
  dmDtScale: 0.02,
};

const buildObserverConfig = (tickMs: number) => ({
  historyWindow: Math.max(
    4,
    readNumber(process.env.SIGNAL_TRIAL_OBSERVER_WINDOW, observerDefaults.historyWindow),
  ),
  vEps: readNumber(process.env.SIGNAL_TRIAL_OBSERVER_V_EPS, observerDefaults.vEps),
  mMin: readNumber(process.env.SIGNAL_TRIAL_OBSERVER_M_MIN, observerDefaults.mMin),
  mStdMax: readNumber(process.env.SIGNAL_TRIAL_OBSERVER_M_STD_MAX, observerDefaults.mStdMax),
  latencyStdMax: readNumber(
    process.env.SIGNAL_TRIAL_OBSERVER_LAT_STD_MAX,
    observerDefaults.latencyStdMax,
  ),
  residualMax: readNumber(
    process.env.SIGNAL_TRIAL_OBSERVER_RES_MAX,
    observerDefaults.residualMax,
  ),
  minEventGapSteps: Math.max(
    1,
    readNumber(
      process.env.SIGNAL_TRIAL_OBSERVER_EVENT_GAP,
      observerDefaults.minEventGapSteps,
    ),
  ),
  falsifyAfterSteps: Math.max(
    1,
    readNumber(
      process.env.SIGNAL_TRIAL_OBSERVER_FALSIFY_AFTER,
      observerDefaults.falsifyAfterSteps,
    ),
  ),
  dtSeconds: tickMs / 1000,
  vScale: readNumber(process.env.SIGNAL_TRIAL_OBSERVER_V_SCALE, observerDefaults.vScale),
  dmDtScale: readNumber(process.env.SIGNAL_TRIAL_OBSERVER_DMDT_SCALE, observerDefaults.dmDtScale),
});

const makeId = () => Math.random().toString(36).slice(2, 10);
const makeSessionId = () => `ST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const latencyVariance = (sample: FieldSample) =>
  Math.abs(sample.latencyP99 - sample.latencyP50) / Math.max(1, sample.latencyP50);

type SampleImpact = Partial<
  Pick<
    FieldSample,
    | "latencyP50"
    | "latencyP95"
    | "latencyP99"
    | "errRate"
    | "queueDepth"
    | "queueSlope"
    | "corrSpike"
  >
>;

export type LoadMode = "synthetic" | "traffic" | "blend";

type LoadImpact = {
  bps?: number;
  jitterMs?: number;
  payloadScale?: number;
};

interface ActionSpec {
  type: SignalTrialAction["action"];
  label: string;
  delayRangeMs: [number, number];
  durationMs: number;
  impact: SampleImpact;
}

const ACTIONS: ActionSpec[] = [
  {
    type: "pulse",
    label: "Pulse",
    delayRangeMs: [3200, 5200],
    durationMs: 900,
    impact: { latencyP50: 12, latencyP95: 20, latencyP99: 30, errRate: 0.006, corrSpike: 0.18 },
  },
  {
    type: "pressure",
    label: "Pressure",
    delayRangeMs: [3400, 5200],
    durationMs: 3200,
    impact: { latencyP50: 10, latencyP95: 18, latencyP99: 24, queueDepth: 3, queueSlope: 0.05, errRate: 0.004 },
  },
  {
    type: "delay",
    label: "Delay",
    delayRangeMs: [3600, 5200],
    durationMs: 2200,
    impact: { latencyP50: 8, latencyP95: 14, latencyP99: 18, queueSlope: 0.03, corrSpike: 0.08 },
  },
  {
    type: "lock",
    label: "Lock",
    delayRangeMs: [3600, 5200],
    durationMs: 2800,
    impact: { latencyP95: -10, latencyP99: -12, queueDepth: -2, queueSlope: -0.05, errRate: -0.004 },
  },
  {
    type: "noise",
    label: "Noise",
    delayRangeMs: [3000, 4800],
    durationMs: 1400,
    impact: { latencyP95: 18, latencyP99: 26, queueDepth: 4, queueSlope: 0.06, errRate: 0.012, corrSpike: 0.25 },
  },
  {
    type: "damp",
    label: "Damp",
    delayRangeMs: [3400, 5200],
    durationMs: 2600,
    impact: { latencyP50: -6, latencyP95: -10, latencyP99: -14, queueDepth: -3, queueSlope: -0.06, errRate: -0.006 },
  },
];

type Effect = {
  id: string;
  type: SignalTrialAction["action"];
  label: string;
  startAt: number;
  endAt: number;
  impact: SampleImpact;
  backfire: boolean;
};

type LoadEffect = {
  id: string;
  type: SignalTrialAction["action"];
  startAt: number;
  endAt: number;
  impact: LoadImpact;
  backfire: boolean;
};

const LOAD_ACTIONS: Record<SignalTrialAction["action"], LoadImpact> = {
  pulse: { bps: 140_000, jitterMs: 10 },
  pressure: { bps: 70_000, jitterMs: 6 },
  delay: { bps: 25_000, jitterMs: 16 },
  lock: { bps: -30_000, jitterMs: -8 },
  noise: { bps: 95_000, jitterMs: 26 },
  damp: { bps: -40_000, jitterMs: -12 },
};

const invertImpact = (impact: SampleImpact): SampleImpact => {
  const inverted: SampleImpact = {};
  for (const key of Object.keys(impact) as (keyof SampleImpact)[]) {
    const value = impact[key];
    if (typeof value === "number") {
      inverted[key] = -value;
    }
  }
  return inverted;
};

const applyImpact = (target: SampleImpact, impact: SampleImpact, intensity: number) => {
  for (const key of Object.keys(impact) as (keyof SampleImpact)[]) {
    const value = impact[key];
    if (typeof value === "number") {
      target[key] = (target[key] ?? 0) + value * intensity;
    }
  }
};

const collectImpact = (effects: Effect[], now: number): SampleImpact => {
  const aggregated: SampleImpact = {};
  for (const effect of effects) {
    if (now < effect.startAt || now > effect.endAt) {
      continue;
    }
    const progress = (now - effect.startAt) / (effect.endAt - effect.startAt);
    const intensity = 1 - Math.abs(progress - 0.5) * 2;
    applyImpact(aggregated, effect.impact, intensity);
  }
  return aggregated;
};

const invertLoadImpact = (impact: LoadImpact): LoadImpact => ({
  bps: typeof impact.bps === "number" ? -impact.bps : undefined,
  jitterMs: typeof impact.jitterMs === "number" ? -impact.jitterMs : undefined,
  payloadScale:
    typeof impact.payloadScale === "number" ? -impact.payloadScale : undefined,
});

const applyLoadImpact = (target: LoadImpact, impact: LoadImpact, intensity: number) => {
  if (typeof impact.bps === "number") {
    target.bps = (target.bps ?? 0) + impact.bps * intensity;
  }
  if (typeof impact.jitterMs === "number") {
    target.jitterMs = (target.jitterMs ?? 0) + impact.jitterMs * intensity;
  }
  if (typeof impact.payloadScale === "number") {
    target.payloadScale = (target.payloadScale ?? 0) + impact.payloadScale * intensity;
  }
};

const collectLoadImpact = (effects: LoadEffect[], now: number): LoadImpact => {
  const aggregated: LoadImpact = {};
  for (const effect of effects) {
    if (now < effect.startAt || now > effect.endAt) {
      continue;
    }
    const progress = (now - effect.startAt) / (effect.endAt - effect.startAt);
    const intensity = 1 - Math.abs(progress - 0.5) * 2;
    applyLoadImpact(aggregated, effect.impact, intensity);
  }
  return aggregated;
};

const mergeImpact = (base: SampleImpact, extra: SampleImpact): SampleImpact => {
  const merged: SampleImpact = { ...base };
  for (const key of Object.keys(extra) as (keyof SampleImpact)[]) {
    const value = extra[key];
    if (typeof value === "number") {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
};

type LoadHarnessConfig = {
  port: number;
  clients: number;
  baseBps: number;
  maxBps: number;
  payloadBytes: number;
  baseJitterMs: number;
};

type TrafficSnapshot = {
  bps: number;
  messagesPerSec: number;
  jitterMs: number;
};

type LoadHarness = {
  port: number;
  mode: LoadMode;
  tick: (params: {
    dtMs: number;
    targetBps: number;
    targetJitterMs: number;
  }) => TrafficSnapshot;
  reset: () => void;
  stop: () => void;
};

type LoadClient = {
  transport: WSTransport;
  payload: Uint8Array;
  stream: MuxStream | null;
};

const buildPayload = (size: number) => {
  const payload = new Uint8Array(Math.max(32, size));
  for (let i = 0; i < payload.length; i += 1) {
    payload[i] = Math.floor(Math.random() * 256);
  }
  return payload;
};

const computeJitter = (samples: number[]) => {
  if (samples.length < 2) {
    return 0;
  }
  const mean = samples.reduce((acc, value) => acc + value, 0) / samples.length;
  const variance =
    samples.reduce((acc, value) => acc + (value - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
};

const createLoadHarness = (mode: LoadMode, cfg: LoadHarnessConfig): LoadHarness => {
  const server = new WSTransportServer(cfg.port);
  const stats = {
    bytes: 0,
    messages: 0,
    intervals: [] as number[],
    lastAt: 0,
  };

  server.on("connection", transport => {
    transport.onData((buf: Uint8Array) => {
      const now = Date.now();
      stats.bytes += buf.byteLength;
      stats.messages += 1;
      if (stats.lastAt) {
        stats.intervals.push(now - stats.lastAt);
        if (stats.intervals.length > 40) {
          stats.intervals.shift();
        }
      }
      stats.lastAt = now;
    });
  });

  server.start();

  const clients: LoadClient[] = [];

  for (let i = 0; i < Math.max(1, cfg.clients); i += 1) {
    const transport = new WSTransport(`ws://localhost:${cfg.port}`);
    const payload = buildPayload(cfg.payloadBytes);
    const client: LoadClient = { transport, payload, stream: null };
    transport
      .connect()
      .then(() => {
        client.stream = transport.mux?.createStream() ?? null;
      })
      .catch(() => {
        client.stream = null;
      });
    clients.push(client);
  }

  const sendLoad = (bytes: number, jitterMs: number) => {
    if (!clients.length) {
      return;
    }
    const burstiness = clamp01(jitterMs / Math.max(1, cfg.baseJitterMs * 6));
    if (burstiness > 0.2 && Math.random() < burstiness * 0.25) {
      return;
    }

    const totalBytes = Math.max(0, bytes);
    const perClient = totalBytes / clients.length;
    const jitterScale = 1 + rand(-burstiness, burstiness) * 0.35;
    const targetBytes = Math.max(0, perClient * jitterScale);

    for (const client of clients) {
      if (!client.stream) {
        continue;
      }
      const payloadSize = client.payload.length;
      const packets = Math.max(1, Math.floor(targetBytes / payloadSize));
      for (let i = 0; i < packets; i += 1) {
        client.stream.write(client.payload);
      }
    }
  };

  const snapshot = (dtMs: number): TrafficSnapshot => {
    const bps = dtMs > 0 ? (stats.bytes / dtMs) * 1000 : 0;
    const messagesPerSec = dtMs > 0 ? (stats.messages / dtMs) * 1000 : 0;
    const jitterMs = computeJitter(stats.intervals);
    stats.bytes = 0;
    stats.messages = 0;
    stats.intervals = [];
    return { bps, messagesPerSec, jitterMs };
  };

  return {
    port: cfg.port,
    mode,
    tick: ({ dtMs, targetBps, targetJitterMs }) => {
      const bytes = (Math.max(0, targetBps) * dtMs) / 1000;
      sendLoad(bytes, targetJitterMs);
      return snapshot(dtMs);
    },
    reset: () => {
      stats.bytes = 0;
      stats.messages = 0;
      stats.intervals = [];
      stats.lastAt = 0;
    },
    stop: () => {
      server.stop();
      for (const client of clients) {
        client.transport.close();
      }
    },
  };
};

const impactFromTraffic = (snapshot: TrafficSnapshot, cfg: LoadHarnessConfig): SampleImpact => {
  const range = Math.max(1, cfg.maxBps - cfg.baseBps);
  const loadRatio = clamp01((snapshot.bps - cfg.baseBps) / range);
  const jitterRatio = clamp01(snapshot.jitterMs / Math.max(1, cfg.baseJitterMs * 6));
  const pressure = clamp01(loadRatio + jitterRatio * 0.4);

  return {
    latencyP50: pressure * 10 + jitterRatio * 3,
    latencyP95: pressure * 18 + jitterRatio * 4,
    latencyP99: pressure * 24 + jitterRatio * 6,
    errRate: pressure * 0.018 + jitterRatio * 0.004,
    queueDepth: pressure * 2.2,
    queueSlope: (pressure - 0.3) * 0.08,
    corrSpike: jitterRatio * 0.25 + pressure * 0.08,
  };
};

const buildSample = (
  now: number,
  lastSampleAt: number,
  impact: SampleImpact,
  queueDepthRef: { current: number },
): FieldSample => {
  const dt = Math.max(0.1, (now - lastSampleAt) / 1000);
  const latencyJitter = rand(-sampleJitter.latencyMs, sampleJitter.latencyMs);

  const latencyP50 = Math.max(6, baseSample.latencyP50 + latencyJitter + (impact.latencyP50 ?? 0));
  const latencyP95 = Math.max(
    latencyP50 + 4,
    baseSample.latencyP95 + latencyJitter * 1.2 + (impact.latencyP95 ?? 0),
  );
  const latencyP99 = Math.max(
    latencyP95 + 4,
    baseSample.latencyP99 + latencyJitter * 1.6 + (impact.latencyP99 ?? 0),
  );

  const errRate = clamp01(
    baseSample.errRate + (impact.errRate ?? 0) + rand(-sampleJitter.errRate, sampleJitter.errRate),
  );

  const queueSlope = clampRange(
    baseSample.queueSlope + (impact.queueSlope ?? 0) + rand(-sampleJitter.queueSlope, sampleJitter.queueSlope),
    -0.2,
    0.25,
  );

  queueDepthRef.current = Math.max(0, queueDepthRef.current + queueSlope * dt * 10 + (impact.queueDepth ?? 0));

  const corrSpike = Math.max(
    0,
    (impact.corrSpike ?? 0) + Math.max(0, rand(-sampleJitter.corrSpike, sampleJitter.corrSpike)),
  );

  return {
    t: now,
    latencyP50,
    latencyP95,
    latencyP99,
    errRate,
    queueDepth: queueDepthRef.current,
    queueSlope,
    corrSpike,
  };
};

const mapDerived = (state: { M: number; V: number; R: number }, sample: FieldSample) => {
  const driftSignal = clamp01(Math.abs(state.V) * 6 + Math.max(0, sample.queueSlope) * 0.6);
  const errSignal = clamp01(sample.errRate * 10);
  const slopeSignal = clamp01(Math.max(0, sample.queueSlope) * 3);
  const tension = clamp01((1 - state.M) * 0.7 + errSignal + slopeSignal);
  const resonance = clamp01(state.R - (1 - state.M) * 0.2 - driftSignal * 0.25);

  return {
    stability: clamp01(state.M),
    tension,
    drift: driftSignal,
    resonance,
  };
};

type ProfilePreset = {
  bandWidthScale: number;
  bandDriftScale: number;
  bandSpeedScale: number;
  holdScale: number;
  quietScale: number;
};

const profilePresets: Record<SignalTrialProfile, ProfilePreset> = {
  balanced: {
    bandWidthScale: 1,
    bandDriftScale: 1,
    bandSpeedScale: 1,
    holdScale: 1,
    quietScale: 1,
  },
  precision: {
    bandWidthScale: 0.8,
    bandDriftScale: 1,
    bandSpeedScale: 1,
    holdScale: 1.2,
    quietScale: 1.2,
  },
  endurance: {
    bandWidthScale: 1.15,
    bandDriftScale: 0.9,
    bandSpeedScale: 0.85,
    holdScale: 1.3,
    quietScale: 1.1,
  },
  chase: {
    bandWidthScale: 0.95,
    bandDriftScale: 1.25,
    bandSpeedScale: 1.2,
    holdScale: 0.9,
    quietScale: 0.9,
  },
};

const resolveProfile = (value: unknown): SignalTrialProfile => {
  if (value === "precision" || value === "endurance" || value === "chase" || value === "balanced") {
    return value;
  }
  return "balanced";
};

const loadProfileOverrides = (): Partial<Record<SignalTrialProfile, Partial<ProfilePreset>>> => {
  const raw = process.env.SIGNAL_TRIAL_PROFILE_OVERRIDES;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ProfilePreset>>;
    const overrides: Partial<Record<SignalTrialProfile, Partial<ProfilePreset>>> = {};
    for (const key of Object.keys(profilePresets) as SignalTrialProfile[]) {
      if (parsed[key]) {
        overrides[key] = parsed[key];
      }
    }
    return overrides;
  } catch {
    return {};
  }
};

const applyProfilePreset = (
  base: ProfilePreset,
  override?: Partial<ProfilePreset>,
): ProfilePreset => ({
  bandWidthScale: readNumber(override?.bandWidthScale, base.bandWidthScale),
  bandDriftScale: readNumber(override?.bandDriftScale, base.bandDriftScale),
  bandSpeedScale: readNumber(override?.bandSpeedScale, base.bandSpeedScale),
  holdScale: readNumber(override?.holdScale, base.holdScale),
  quietScale: readNumber(override?.quietScale, base.quietScale),
});

// Moving target band keeps stability from being a static threshold.
const targetBandBase = { M: 0.84, V: 0, R: 0.76 };
const targetBandDrift = { M: 0.05, V: 0.015, R: 0.06 };
const targetBandWidth = { M: 0.06, V: 0.02, R: 0.08 };

const targetBandDriftScale: Record<SignalTrialDifficulty, number> = {
  easy: 0.85,
  standard: 1,
  hard: 1.1,
  chaos: 1.2,
};

const targetBandWidthScale: Record<SignalTrialDifficulty, number> = {
  easy: 1.1,
  standard: 1,
  hard: 0.9,
  chaos: 0.8,
};

const targetBandSpeed: Record<SignalTrialDifficulty, number> = {
  easy: 0.05,
  standard: 0.07,
  hard: 0.09,
  chaos: 0.12,
};

type TargetBand = {
  center: { M: number; V: number; R: number };
  width: { M: number; V: number; R: number };
};

const targetBandAt = (
  now: number,
  sessionStart: number,
  difficulty: SignalTrialDifficulty,
  phaseOffset: number,
  profilePreset: ProfilePreset,
): TargetBand => {
  const elapsed = Math.max(0, (now - sessionStart) / 1000);
  const driftScale = targetBandDriftScale[difficulty] * profilePreset.bandDriftScale;
  const widthScale = targetBandWidthScale[difficulty] * profilePreset.bandWidthScale;
  const phase =
    elapsed * targetBandSpeed[difficulty] * profilePreset.bandSpeedScale + phaseOffset;

  return {
    center: {
      M: clamp01(targetBandBase.M + Math.sin(phase * 1.1) * targetBandDrift.M * driftScale),
      V: clampRange(
        targetBandBase.V + Math.sin(phase * 0.9 + 1.1) * targetBandDrift.V * driftScale,
        -0.06,
        0.06,
      ),
      R: clamp01(targetBandBase.R + Math.cos(phase * 1.3 + 0.4) * targetBandDrift.R * driftScale),
    },
    width: {
      M: targetBandWidth.M * widthScale,
      V: targetBandWidth.V * widthScale,
      R: targetBandWidth.R * widthScale,
    },
  };
};

// const isInTargetBand = (state: { M: number; V: number; R: number }, band: TargetBand) =>
//   Math.abs(state.M - band.center.M) <= band.width.M &&
//   Math.abs(state.V - band.center.V) <= band.width.V &&
//   Math.abs(state.R - band.center.R) <= band.width.R;

type TargetBandTelemetry = {
  M: { center: number; width: number; delta: number; inBand: boolean };
  V: { center: number; width: number; delta: number; inBand: boolean };
  R: { center: number; width: number; delta: number; inBand: boolean };
};

const buildTargetBandTelemetry = (
  state: { M: number; V: number; R: number },
  band: TargetBand,
): TargetBandTelemetry => ({
  M: {
    center: band.center.M,
    width: band.width.M,
    delta: state.M - band.center.M,
    inBand: Math.abs(state.M - band.center.M) <= band.width.M,
  },
  V: {
    center: band.center.V,
    width: band.width.V,
    delta: state.V - band.center.V,
    inBand: Math.abs(state.V - band.center.V) <= band.width.V,
  },
  R: {
    center: band.center.R,
    width: band.width.R,
    delta: state.R - band.center.R,
    inBand: Math.abs(state.R - band.center.R) <= band.width.R,
  },
});

const computeBandDistance = (band: TargetBandTelemetry) => {
  const normM = Math.abs(band.M.delta) / Math.max(0.0001, band.M.width);
  const normV = Math.abs(band.V.delta) / Math.max(0.0001, band.V.width);
  const normR = Math.abs(band.R.delta) / Math.max(0.0001, band.R.width);
  return Math.sqrt((normM ** 2 + normV ** 2 + normR ** 2) / 3);
};

const applyProfileGates = (
  base: GateConfig,
  profilePreset: ProfilePreset,
  adaptiveHold?: { holdMs: number; quietHoldMs: number },
): GateConfig => {
  const holdBase = adaptiveHold?.holdMs ?? base.holdMs;
  const quietBase = adaptiveHold?.quietHoldMs ?? base.quietHoldMs;
  return {
    minUptimeMs: base.minUptimeMs,
    minActions: base.minActions,
    holdMs: Math.round(holdBase * profilePreset.holdScale),
    quietHoldMs: Math.round(quietBase * profilePreset.quietScale),
    collapseHoldMs: Math.round(base.collapseHoldMs * profilePreset.holdScale),
  };
};

const buildBandHints = (band: TargetBandTelemetry) => {
  const axes = [
    { label: "margin", delta: band.M.delta, width: band.M.width },
    { label: "velocity", delta: band.V.delta, width: band.V.width },
    { label: "reserve", delta: band.R.delta, width: band.R.width },
  ];
  const ranked = axes
    .map(axis => ({
      label: axis.label,
      delta: axis.delta,
      score: Math.abs(axis.delta) / Math.max(0.0001, axis.width),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 2).map(entry => `${entry.label} ${entry.delta > 0 ? "high" : "low"}`);
};

const buildResolutionHints = (
  target: "stable" | "collapsed",
  missing: string[],
  band: TargetBandTelemetry,
) => {
  const hints: string[] = [];
  if (missing.includes("minUptime")) hints.push("let session run");
  if (missing.includes("minActions")) hints.push("inject more perturbations");
  if (missing.includes("hold")) hints.push("hold steady");
  if (missing.includes("quiet")) hints.push("wait before acting");
  if (missing.includes("collapseHold")) hints.push("collapse not sustained");
  if (target === "stable" && missing.includes("targetBand")) {
    hints.push(...buildBandHints(band));
  }
  return hints;
};

const isStableCandidate = (state: { M: number; V: number; R: number }) =>
  state.M > 0.78 && Math.abs(state.V) < 0.02 && state.R > 0.7;

const isCollapseCandidate = (state: { M: number; R: number }, sample: FieldSample) =>
  state.M < 0.18 || state.R < 0.2 || sample.errRate > 0.05 || sample.queueDepth > 40;

const resolveResolutionTier = (
  state: { M: number; V: number; R: number },
  holdMs: number,
  baseHoldMs: number,
): SignalTrialResolutionTier => {
  if (
    state.M > 0.92 &&
    Math.abs(state.V) < 0.015 &&
    state.R > 0.86 &&
    holdMs >= baseHoldMs + 4000
  ) {
    return "anchor-iii";
  }
  if (
    state.M > 0.88 &&
    Math.abs(state.V) < 0.02 &&
    state.R > 0.78 &&
    holdMs >= baseHoldMs + 2000
  ) {
    return "anchor-ii";
  }
  return "anchor-i";
};

export interface SignalTrialBroadcastOptions {
  port?: number;
  tickMs?: number;
  difficulty?: SignalTrialDifficulty;
  tier?: SignalTrialTier;
  profile?: SignalTrialProfile;
  loadMode?: LoadMode;
  loadPort?: number;
  loadClients?: number;
  loadBaseBps?: number;
  loadMaxBps?: number;
  loadPayloadBytes?: number;
  loadJitterMs?: number;
}

export function startSignalTrialBroadcast(options: SignalTrialBroadcastOptions = {}) {
  const port = options.port ?? Number(process.env.SIGNAL_TRIAL_WS_PORT ?? 4183);
  const tickMs = options.tickMs ?? Number(process.env.SIGNAL_TRIAL_TICK_MS ?? 250);
  const tier: SignalTrialTier = options.tier ?? "instrument";
  const difficulty: SignalTrialDifficulty = options.difficulty ?? "standard";
  const observerConfig = buildObserverConfig(tickMs);
  const adaptiveHold = {
    holdMs: Math.round(observerConfig.historyWindow * tickMs * 1.1),
    quietHoldMs: Math.round(observerConfig.minEventGapSteps * tickMs),
  };
  const profileOverrides = loadProfileOverrides();
  let profile: SignalTrialProfile = resolveProfile(
    options.profile ?? process.env.SIGNAL_TRIAL_PROFILE,
  );
  let profilePreset = applyProfilePreset(profilePresets[profile], profileOverrides[profile]);
  let gate = applyProfileGates(difficultyGates[difficulty], profilePreset, adaptiveHold);
  const rawLoadMode = options.loadMode ?? process.env.SIGNAL_TRIAL_LOAD_MODE;
  const loadMode: LoadMode =
    rawLoadMode === "traffic" || rawLoadMode === "blend" || rawLoadMode === "synthetic"
      ? rawLoadMode
      : "blend";
  const loadPort = readNumber(options.loadPort ?? process.env.SIGNAL_TRIAL_LOAD_PORT, 4184);
  const loadClients = readNumber(options.loadClients ?? process.env.SIGNAL_TRIAL_LOAD_CLIENTS, 2);
  const loadBaseBps = readNumber(options.loadBaseBps ?? process.env.SIGNAL_TRIAL_LOAD_BASE_BPS, 24_000);
  const loadMaxBps = readNumber(options.loadMaxBps ?? process.env.SIGNAL_TRIAL_LOAD_MAX_BPS, 220_000);
  const loadPayloadBytes = readNumber(
    options.loadPayloadBytes ?? process.env.SIGNAL_TRIAL_LOAD_PAYLOAD_BYTES,
    512,
  );
  const loadJitterMs = readNumber(options.loadJitterMs ?? process.env.SIGNAL_TRIAL_LOAD_JITTER_MS, 8);
  const loadConfig: LoadHarnessConfig = {
    port: loadPort,
    clients: Math.max(1, loadClients),
    baseBps: Math.max(1, loadBaseBps),
    maxBps: Math.max(loadBaseBps + 1, loadMaxBps),
    payloadBytes: Math.max(64, loadPayloadBytes),
    baseJitterMs: Math.max(2, loadJitterMs),
  };
  const loadHarness = loadMode === "synthetic" ? null : createLoadHarness(loadMode, loadConfig);
  const nearMissConfidence = readNumber(process.env.SIGNAL_TRIAL_OBSERVER_NEAR_MISS, 0.74);

  // Telemetry/control channel for the UI (JSON messages), kept separate from muxed load traffic.
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  let sessionId = makeSessionId();
  let sessionStart = Date.now();
  let loop = new CoherenceLoop(cfg);
  let coupling: CouplingParams = { ...baseCoupling };
  let detector = new CommitmentDetector();
  let resolutionObserver = new ResolutionDetector(observerConfig);
  let effects: Effect[] = [];
  let loadEffects: LoadEffect[] = [];
  let queueDepth = { current: baseSample.queueDepth };
  let lastSampleAt = Date.now();
  let actionsCount = 0;
  let lastActionAt = 0;
  let stableSince: number | null = null;
  let collapseSince: number | null = null;
  let targetPhaseOffset = rand(0, Math.PI * 2);
  let lastStableAttemptKey: string | null = null;
  let lastCollapseAttemptKey: string | null = null;
  let lastBandDistance: number | null = null;
  let lastBandIn: boolean | null = null;
  let bandCrossings: number[] = [];
  let phase: SignalTrialPhase = "approaching";
  let resolution: "pending" | "stable" | "collapsed" = "pending";
  let sessionTimedOut = false;
  const sessionTimeoutMs = readNumber(
    process.env.SIGNAL_TRIAL_SESSION_TIMEOUT_MS,
    120_000,
  );
  let commitmentCount = 0;

  const broadcast = (message: SignalTrialMessage) => {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  const broadcastResolutionAttempt = (
    target: "stable" | "collapsed",
    missing: string[],
    at: number,
    state: { M: number; V: number; R: number; H: number },
    hints: string[],
    phaseState: SignalTrialPhase,
    reason?: string,
  ) => {
    broadcast({
      type: "resolution_attempt",
      sessionId,
      at,
      target,
      missing,
      hints: hints.length > 0 ? hints : undefined,
      phase: phaseState,
      reason,
      state,
    });
  };

  const resetSession = () => {
    sessionId = makeSessionId();
    sessionStart = Date.now();
    loop = new CoherenceLoop(cfg);
    coupling = { ...baseCoupling };
    detector = new CommitmentDetector();
    resolutionObserver = new ResolutionDetector(observerConfig);
    effects = [];
    loadEffects = [];
    queueDepth = { current: baseSample.queueDepth };
    lastSampleAt = Date.now();
    actionsCount = 0;
    lastActionAt = 0;
    stableSince = null;
    collapseSince = null;
    targetPhaseOffset = rand(0, Math.PI * 2);
    lastStableAttemptKey = null;
    lastCollapseAttemptKey = null;
    lastBandDistance = null;
    lastBandIn = null;
    bandCrossings = [];
    phase = "approaching";
    resolution = "pending";
    sessionTimedOut = false;
    commitmentCount = 0;
    loadHarness?.reset();

    broadcast({
      type: "session",
      sessionId,
      at: sessionStart,
      mode: "spawn",
      tier,
      difficulty,
      profile,
    });
  };

  const applyAction = (message: SignalTrialAction) => {
    const spec = ACTIONS.find(action => action.type === message.action);
    if (!spec) return;

    const now = Date.now();
    const delayMs = rand(spec.delayRangeMs[0], spec.delayRangeMs[1]);
    const backfire = Math.random() < 0.22;
    const useSynthetic = loadMode !== "traffic";
    const useTraffic = loadMode !== "synthetic";

    if (useSynthetic) {
      const impact = backfire ? invertImpact(spec.impact) : spec.impact;
      effects.push({
        id: makeId(),
        type: spec.type,
        label: spec.label,
        startAt: now + delayMs,
        endAt: now + delayMs + spec.durationMs,
        impact,
        backfire,
      });
    }

    if (useTraffic) {
      const loadSpec = LOAD_ACTIONS[spec.type];
      const impact = backfire ? invertLoadImpact(loadSpec) : loadSpec;
      loadEffects.push({
        id: makeId(),
        type: spec.type,
        startAt: now + delayMs,
        endAt: now + delayMs + spec.durationMs,
        impact,
        backfire,
      });
    }

    actionsCount += 1;
    lastActionAt = now;

    broadcast({
      type: "action",
      sessionId,
      at: now,
      action: spec.type,
      meta: message.meta,
    });
  };

  wss.on("connection", ws => {
    clients.add(ws);

    ws.on("message", data => {
      const text =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : Buffer.from(data as ArrayBuffer).toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      const result = signalTrialMessageSchema.safeParse(parsed);
      if (!result.success) {
        return;
      }
      const message = result.data;
      if (message.type === "action") {
        applyAction(message);
      }
      if (message.type === "session" && message.mode === "reset") {
          if (message.profile) {
            profile = resolveProfile(message.profile);
            profilePreset = applyProfilePreset(profilePresets[profile], profileOverrides[profile]);
            gate = applyProfileGates(difficultyGates[difficulty], profilePreset, adaptiveHold);
          }
        resetSession();
      }
    });

    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));

    ws.send(
      JSON.stringify({
        type: "session",
        sessionId,
        at: Date.now(),
        mode: "spawn",
        tier,
        difficulty,
        profile,
      }),
    );
  });

  resetSession();

  const interval = setInterval(() => {
    const now = Date.now();
    const dtMs = Math.max(1, now - lastSampleAt);

    effects = effects.filter(effect => effect.endAt >= now);
    let impact = collectImpact(effects, now);
    if (loadHarness) {
      loadEffects = loadEffects.filter(effect => effect.endAt >= now);
      const loadPlan = collectLoadImpact(loadEffects, now);
      const targetBps = Math.max(0, loadConfig.baseBps + (loadPlan.bps ?? 0));
      const targetJitterMs = Math.max(0, loadConfig.baseJitterMs + (loadPlan.jitterMs ?? 0));
      const snapshot = loadHarness.tick({ dtMs, targetBps, targetJitterMs });
      const loadImpact = impactFromTraffic(snapshot, loadConfig);
      if (loadMode === "traffic") {
        impact = loadImpact;
      } else if (loadMode === "blend") {
        impact = mergeImpact(impact, loadImpact);
      }
    }
    const sample = buildSample(now, lastSampleAt, impact, queueDepth);
    lastSampleAt = now;

    loop.sense(sample);
    const state = loop.estimate();
    coupling = loop.adapt(state, coupling);

    const observerSample = { ...sample, latency_var: latencyVariance(sample) };
    detector.detectCommitment(
      state.M,
      state.V,
      observerSample,
      coupling,
      now,
    );

    const observation = resolutionObserver.tick(
      state.M,
      state.V,
      observerSample,
      coupling,
      now,
    );
    const observerTelemetry = observation
      ? {
          confidence: observation.confidence,
          resolved: observation.resolved,
          residual: observation.residual,
          latencyStd: observation.latencyStd,
          vMeanAbs: observation.vMeanAbs,
          mStd: observation.mStd,
          dmDt: observation.dmDt,
          m: observation.m,
          v: observation.v,
        }
      : undefined;

    const nextCommitments = detector.getEvents();
    if (nextCommitments.length > commitmentCount) {
      const event = nextCommitments[nextCommitments.length - 1];
      commitmentCount = nextCommitments.length;
      broadcast({
        type: "commitment",
        sessionId,
        at: event.timestamp,
        m: event.m,
        v: event.v,
        resonance: event.resonance,
        reason: event.reason,
        coupling,
      });
    }

    const derived = mapDerived(state, sample);
    const targetBand = targetBandAt(
      now,
      sessionStart,
      difficulty,
      targetPhaseOffset,
      profilePreset,
    );
    const targetBandTelemetry = buildTargetBandTelemetry(state, targetBand);
    const targetBandOk =
      targetBandTelemetry.M.inBand &&
      targetBandTelemetry.V.inBand &&
      targetBandTelemetry.R.inBand;
    const stableCandidate = isStableCandidate(state);
    const stableQualified = stableCandidate && targetBandOk;

    const bandDistance = computeBandDistance(targetBandTelemetry);
    if (lastBandIn !== null && lastBandIn !== targetBandOk) {
      bandCrossings.push(now);
    }
    bandCrossings = bandCrossings.filter((stamp) => now - stamp < 6000);
    const distanceTrend =
      lastBandDistance !== null ? lastBandDistance - bandDistance : 0;
    const trendThreshold = 0.03;

    if (targetBandOk && stableCandidate) {
      phase = "tracking";
    } else if (lastBandIn === true && !targetBandOk) {
      phase = "overshoot";
    } else if (bandCrossings.length >= 3) {
      phase = "oscillating";
    } else if (distanceTrend > trendThreshold) {
      phase = "approaching";
    } else if (distanceTrend < -trendThreshold) {
      phase = "diverging";
    } else {
      phase = targetBandOk ? "tracking" : "approaching";
    }

    lastBandDistance = bandDistance;
    lastBandIn = targetBandOk;

    if (resolution === "pending") {
      if (stableQualified) {
        if (!stableSince) {
          stableSince = now;
        }
      } else {
        stableSince = null;
      }
    }

    const uptimeMs = now - sessionStart;
    const holdMs = stableSince ? now - stableSince : 0;
    const quietMs = lastActionAt ? now - lastActionAt : 0;

    const telemetry: SignalTrialTelemetry = {
      type: "telemetry",
      sessionId,
      at: now,
      tier,
      difficulty,
      profile,
      state,
      coupling,
      sample,
      derived,
      observer: observerTelemetry,
      targetBand: targetBandTelemetry,
      gates: {
        uptimeMs,
        minUptimeMs: gate.minUptimeMs,
        uptimeRemainingMs: Math.max(0, gate.minUptimeMs - uptimeMs),
        actions: actionsCount,
        minActions: gate.minActions,
        actionsRemaining: Math.max(0, gate.minActions - actionsCount),
        holdMs,
        holdRequiredMs: gate.holdMs,
        holdRemainingMs: Math.max(0, gate.holdMs - holdMs),
        quietMs,
        quietRequiredMs: gate.quietHoldMs,
        quietRemainingMs:
          lastActionAt === 0 && gate.minActions === 0
            ? 0
            : Math.max(0, gate.quietHoldMs - quietMs),
      },
      phase,
    };

    broadcast(telemetry);

    if (resolution === "pending" && !sessionTimedOut && now - sessionStart >= sessionTimeoutMs) {
      sessionTimedOut = true;
      broadcast({
        type: "session",
        sessionId,
        at: now,
        mode: "end",
        tier,
        difficulty,
        profile,
        reason: "no_resolution",
        durationMs: now - sessionStart,
      });
    }

    if (resolution === "pending") {
      const uptimeOk = uptimeMs >= gate.minUptimeMs;
      const actionsOk = actionsCount >= gate.minActions;
      const holdOk = holdMs >= gate.holdMs;
      const quietOk =
        lastActionAt === 0 ? gate.minActions === 0 : quietMs >= gate.quietHoldMs;

      if (stableCandidate) {
        const missing: string[] = [];
        if (!targetBandOk) missing.push("targetBand");
        if (!uptimeOk) missing.push("minUptime");
        if (!actionsOk) missing.push("minActions");
        if (!holdOk) missing.push("hold");
        if (!quietOk) missing.push("quiet");
        if (missing.length > 0) {
          const key = missing.join("|");
          if (key !== lastStableAttemptKey) {
            const hints = buildResolutionHints("stable", missing, targetBandTelemetry);
            const observerConfident =
              observation && observation.confidence >= nearMissConfidence;
            if (observerConfident) {
              hints.push(
                observation?.resolved
                  ? "observer sees stable pattern"
                  : "observer sees convergence forming",
              );
            }
            const reason = observerConfident ? "observer_confident" : undefined;
            broadcastResolutionAttempt("stable", missing, now, state, hints, phase, reason);
            lastStableAttemptKey = key;
          }
        } else {
          lastStableAttemptKey = null;
        }
      } else {
        lastStableAttemptKey = null;
      }

      if (stableQualified && uptimeOk && actionsOk && holdOk && quietOk) {
        resolution = "stable";
        const resolutionTier = resolveResolutionTier(state, holdMs, gate.holdMs);
        broadcast({
          type: "resolution",
          sessionId,
          at: now,
          result: "stable",
          tier: resolutionTier,
          reason: "gated stability achieved",
          state,
        });
      } else {
        const collapseCandidate = isCollapseCandidate(state, sample);
        if (collapseCandidate) {
          if (!collapseSince) {
            collapseSince = now;
          }
        } else {
          collapseSince = null;
        }

        const collapseHoldOk =
          gate.collapseHoldMs === 0 ||
          (collapseSince !== null && now - collapseSince >= gate.collapseHoldMs);
        const collapseUptimeOk = uptimeMs >= gate.minUptimeMs;
        const collapseActionsOk = gate.minActions === 0 || actionsCount >= gate.minActions;

        if (collapseCandidate) {
          const missing: string[] = [];
          if (!collapseHoldOk) missing.push("collapseHold");
          if (!collapseUptimeOk) missing.push("minUptime");
          if (!collapseActionsOk) missing.push("minActions");
          if (missing.length > 0) {
            const key = missing.join("|");
            if (key !== lastCollapseAttemptKey) {
              const hints = buildResolutionHints("collapsed", missing, targetBandTelemetry);
              broadcastResolutionAttempt("collapsed", missing, now, state, hints, phase);
              lastCollapseAttemptKey = key;
            }
          } else {
            lastCollapseAttemptKey = null;
          }
        } else {
          lastCollapseAttemptKey = null;
        }

        if (collapseCandidate && collapseHoldOk && collapseUptimeOk && collapseActionsOk) {
          resolution = "collapsed";
          broadcast({
            type: "resolution",
            sessionId,
            at: now,
            result: "collapsed",
            reason: "collapse threshold reached",
            state,
          });
        }
      }
    }
  }, tickMs);

  return {
    port,
    stop: () => {
      clearInterval(interval);
      wss.close();
      loadHarness?.stop();
    },
  };
}

export async function runCoherence() {
  startSignalTrialBroadcast();
}

const isDirectRun = () => {
  if (!process.argv[1]) {
    return false;
  }
  return __filename === resolve(process.argv[1]);
};

if (isDirectRun()) {
  startSignalTrialBroadcast();
}
