import WebSocket, { WebSocketServer } from "ws";
import { resolve } from "path";
import { CoherenceLoop } from "./loop";
import { CommitmentDetector } from "./commitment-detector";
import type { CoherenceConfig, CouplingParams, FieldSample } from "./types";
import { WSTransport, WSTransportServer } from "../transports/ws/ws-transport";
import type { MuxStream } from "../transports/mux/mux-stream";
import {
  signalTrialMessageSchema,
  type SignalTrialAction,
  type SignalTrialDifficulty,
  type SignalTrialMessage,
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

const difficultyGates: Record<SignalTrialDifficulty, { minUptimeMs: number; minActions: number; holdMs: number }> = {
  easy: { minUptimeMs: 8000, minActions: 1, holdMs: 3000 },
  standard: { minUptimeMs: 12000, minActions: 2, holdMs: 5000 },
  hard: { minUptimeMs: 16000, minActions: 3, holdMs: 7000 },
  chaos: { minUptimeMs: 20000, minActions: 4, holdMs: 9000 },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampRange = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const readNumber = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

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
  const gate = difficultyGates[difficulty];
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

  // Telemetry/control channel for the UI (JSON messages), kept separate from muxed load traffic.
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  let sessionId = makeSessionId();
  let sessionStart = Date.now();
  let loop = new CoherenceLoop(cfg);
  let coupling: CouplingParams = { ...baseCoupling };
  let detector = new CommitmentDetector();
  let effects: Effect[] = [];
  let loadEffects: LoadEffect[] = [];
  let queueDepth = { current: baseSample.queueDepth };
  let lastSampleAt = Date.now();
  let actionsCount = 0;
  let lastActionAt = 0;
  let stableSince: number | null = null;
  let resolution: "pending" | "stable" | "collapsed" = "pending";
  let commitmentCount = 0;

  const broadcast = (message: SignalTrialMessage) => {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  const resetSession = () => {
    sessionId = makeSessionId();
    sessionStart = Date.now();
    loop = new CoherenceLoop(cfg);
    coupling = { ...baseCoupling };
    detector = new CommitmentDetector();
    effects = [];
    loadEffects = [];
    queueDepth = { current: baseSample.queueDepth };
    lastSampleAt = Date.now();
    actionsCount = 0;
    lastActionAt = 0;
    stableSince = null;
    resolution = "pending";
    commitmentCount = 0;
    loadHarness?.reset();

    broadcast({
      type: "session",
      sessionId,
      at: sessionStart,
      mode: "spawn",
      tier,
      difficulty,
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

    detector.detectCommitment(
      state.M,
      state.V,
      { ...sample, latency_var: latencyVariance(sample) },
      coupling,
      now,
    );

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

    const telemetry: SignalTrialTelemetry = {
      type: "telemetry",
      sessionId,
      at: now,
      tier,
      difficulty,
      state,
      coupling,
      sample,
      derived,
    };

    broadcast(telemetry);

    if (resolution === "pending") {
      const stableCandidate = isStableCandidate(state);
      if (stableCandidate) {
        if (!stableSince) {
          stableSince = now;
        }
      } else {
        stableSince = null;
      }

      const uptimeOk = now - sessionStart >= gate.minUptimeMs;
      const actionsOk = actionsCount >= gate.minActions;
      const holdOk = stableSince !== null && now - stableSince >= gate.holdMs;
      const quietOk = lastActionAt === 0 ? gate.minActions === 0 : now - lastActionAt >= gate.holdMs;

      if (stableCandidate && uptimeOk && actionsOk && holdOk && quietOk) {
        resolution = "stable";
        const holdMs = stableSince ? now - stableSince : 0;
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
      } else if (isCollapseCandidate(state, sample)) {
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
