import {
  performance,
  PerformanceObserver,
  constants as perfConstants,
  monitorEventLoopDelay,
  type EventLoopUtilization,
} from "node:perf_hooks";
import type { EventEmitter } from "node:events";
import {
  QWormholeClient,
  NativeTcpClient,
  createQWormholeServer,
  isNativeAvailable,
  QuicTransport,
  QuicServer,
  isQuicAvailable,
} from "../src/index";
import { shutdownFlowControllerMonitors } from "../src/core/flow-controller";
import { isNativeServerAvailable } from "../src/core/native-server";
import { BatchFramer } from "../src/core/batch-framer";
import { KcpServer } from "../src/transports/kcp/kcp-server";
import { KcpSession } from "../src/transports/kcp/kcp-session";
import type {
  FramingMode,
  NativeBackend,
  Payload,
  QWormholeServerOptions,
  Serializer,
} from "../src/types/types";
import * as dotenv from "dotenv";
import { ScenarioDiagnostics, Scenario, GcTotals, BatchFlushStats, DiagnosticsScope, SendBlockStats, ScenarioResult, DiagnosticsExtras } from "../test/testtypes";
dotenv.config();

// CSV output helpers for plotting
const CSV_FIELDS = [
  "scenario",
  "serverMode",
  "clientMode",
  "durationMs",
  "messagesReceived",
  "bytesReceived",
  "msgsPerSec",
  "mbPerSec",
  "framing",
  "kcpRttMs",
  "kcpLossRate",
  "kcpPending",
];
const formatCsvHeader = () => CSV_FIELDS.join(",") + "\n";
const formatCsvRow = (res: any) =>
  CSV_FIELDS.map(f =>
    typeof res[f] === "string" ? JSON.stringify(res[f]) : res[f],
  ).join(",") + "\n";

const getCsvPath = () => {
  const cli = process.argv.find(arg => arg.startsWith("--csv"));
  if (cli && cli.includes("=")) return cli.split("=")[1];
  if (cli) return ""; // --csv with no path: print to stdout
  if (process.env.QW_BENCH_CSV) return process.env.QW_BENCH_CSV;
  return undefined;
};

type Mode = "ts" | "native-lws" | "native-libsocket" | "kcp" | "kcp-arq";

interface BenchResult {
  scenario: string;
  serverMode: Mode;
  clientMode: Mode;
  durationMs: number;
  messagesReceived: number;
  bytesReceived: number;
  framing: FramingMode;
  skipped?: boolean;
  reason?: string;
  msgsPerSec?: number;
  mbPerSec?: number;
  preferredServerBackend?: NativeBackend;
  diagnostics?: ScenarioDiagnostics;
  kcpRttMs?: number;
  kcpLossRate?: number;
  kcpPending?: number;
}

const SOCKET_MODES: Mode[] = ["ts", "native-lws", "native-libsocket"];
const ALL_MODES: Mode[] = [...SOCKET_MODES, "kcp", "quic"];
function parseModeArg(): Mode[] {
  const arg = process.argv.find(a => a.startsWith("--mode="));
  if (!arg) return ALL_MODES;
  const val = arg.split("=")[1];
  if (val === "all") return ALL_MODES;
  if (ALL_MODES.includes(val as Mode)) return [val as Mode];
  return ALL_MODES;
}

const PAYLOAD = Buffer.alloc(1024, 1);
const TOTAL_MESSAGES = 10_000;
const TIMEOUT_MS = 5000;
const KCP_TIMEOUT_MS =
  Number(process.env.QW_KCP_TIMEOUT_MS ?? "20000") || 20000;
const envNumber = (key: string): number | undefined => {
  const raw = process.env[key];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const KCP_INTERVAL_MS = envNumber("QW_KCP_INTERVAL_MS");
const KCP_SND_WND = envNumber("QW_KCP_SND_WND");
const KCP_RCV_WND = envNumber("QW_KCP_RCV_WND");
const KCP_MTU = envNumber("QW_KCP_MTU");
const BENCH_FRAMING: FramingMode =
  process.env.QWORMHOLE_BENCH_FRAMING === "none" ? "none" : "length-prefixed";
const BENCH_NEG_INDEX = (() => {
  const raw = process.env.QWORMHOLE_BENCH_NEG_INDEX;
  if (!raw) return 0.9;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return 0.9;
  return Math.min(Math.max(parsed, 0), 1);
})();
const FRAME_HEADER_BYTES = 4;
const ENABLE_DIAGNOSTICS =
  process.argv.includes("--diagnostics") ||
  process.env.QWORMHOLE_BENCH_DIAGNOSTICS === "1";

const encodeLengthPrefixed = (payload: Buffer): Buffer => {
  const framed = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
  framed.writeUInt32BE(payload.length, 0);
  payload.copy(framed, FRAME_HEADER_BYTES);
  return framed;
};

const NATIVE_CLIENT_PAYLOAD =
  BENCH_FRAMING === "length-prefixed" ? encodeLengthPrefixed(PAYLOAD) : PAYLOAD;

const detectNativeBackend = (backend: "lws" | "libsocket") => {
  try {
    const client = new NativeTcpClient(backend);
    const ok = client.backend === backend;
    client.close();
    return ok;
  } catch {
    return false;
  }
};

const availableLws = detectNativeBackend("lws");
const availableLibsocket = detectNativeBackend("libsocket");


const serverBackends: NativeBackend[] = [];
if (isNativeServerAvailable("lws")) {
  serverBackends.push("lws");
}
if (isNativeServerAvailable("libsocket")) {
  serverBackends.push("libsocket");
}

const scenarios: Scenario[] = [];
for (const preferNativeServer of [false, true]) {
  const serverTargets = preferNativeServer
    ? serverBackends.length
      ? serverBackends
      : [undefined]
    : [undefined];
  for (const backend of serverTargets) {
    for (const mode of SOCKET_MODES) {
      const serverLabel = preferNativeServer
        ? backend
          ? `native-server(${backend})`
          : "native-server"
        : "ts-server";

      scenarios.push({
        id: `${serverLabel}+${mode}`,
        preferNativeServer,
        clientMode: mode,
        serverBackend: backend,
      });
    }
  }
}

const toBytes: Serializer = (payload: Payload): Buffer => {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (typeof payload === "string") return Buffer.from(payload);
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (typeof payload === "object" && payload !== null) {
    return Buffer.from(JSON.stringify(payload));
  }
  return Buffer.from(String(payload ?? ""));
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const clientModeAvailable = (mode: Mode): boolean => {
  if (mode === "ts") return true;
  if (mode === "native-lws") return availableLws && isNativeAvailable();
  if (mode === "quic") return isQuicAvailable();
  return availableLibsocket && isNativeAvailable();
};

const serverModeAvailable = (
  preferNative: boolean,
  backend?: NativeBackend,
): boolean => {
  if (!preferNative) return true;
  return isNativeServerAvailable(backend);
};

const deriveBenchCoherence = (): "high" | "medium" | "low" | "chaos" => {
  if (BENCH_NEG_INDEX >= 0.85) return "high";
  if (BENCH_NEG_INDEX >= 0.65) return "medium";
  if (BENCH_NEG_INDEX >= 0.4) return "low";
  return "chaos";
};



const GC_KIND_LABELS: Record<number, string> = {
  [perfConstants.NODE_PERFORMANCE_GC_MAJOR]: "major",
  [perfConstants.NODE_PERFORMANCE_GC_MINOR]: "minor",
  [perfConstants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
  [perfConstants.NODE_PERFORMANCE_GC_WEAKCB]: "weak",
};

const globalGcTotals: GcTotals = {
  count: 0,
  durationMs: 0,
  byKind: {},
};

const gcObserver = new PerformanceObserver(entries => {
  for (const entry of entries.getEntries()) {
    globalGcTotals.count += 1;
    globalGcTotals.durationMs += entry.duration;
    const gcEntry = entry as PerformanceEntry & { detail?: { kind?: number } };
    const kind = gcEntry.detail?.kind;
    const kindLabel =
      typeof kind === "number"
        ? (GC_KIND_LABELS[kind] ?? "unknown")
        : "unknown";
    globalGcTotals.byKind[kindLabel] =
      (globalGcTotals.byKind[kindLabel] ?? 0) + 1;
  }
});
if (ENABLE_DIAGNOSTICS) {
  gcObserver.observe({ entryTypes: ["gc"], buffered: true });
}

const snapshotGcTotals = (): GcTotals => ({
  count: globalGcTotals.count,
  durationMs: globalGcTotals.durationMs,
  byKind: { ...globalGcTotals.byKind },
});

const diffGcTotals = (start: GcTotals): GcTotals => {
  const byKind: Record<string, number> = {};
  for (const [key, value] of Object.entries(globalGcTotals.byKind)) {
    byKind[key] = value - (start.byKind[key] ?? 0);
  }
  return {
    count: globalGcTotals.count - start.count,
    durationMs: Math.max(globalGcTotals.durationMs - start.durationMs, 0),
    byKind,
  };
};

let batchFramerPatched = false;
let activeBatchCollector: BatchFlushStats | null = null;

const ensureBatchFramerDiagnostics = () => {
  if (batchFramerPatched) return;
  const originalEmit = BatchFramer.prototype.emit;
  const wrappedEmit = function (
    this: BatchFramer,
    ...args: Parameters<typeof originalEmit>
  ): ReturnType<typeof originalEmit> {
    const [event, payload] = args;
    if (event === "flush" && payload && activeBatchCollector) {
      const flushPayload = payload as {
        bufferCount: number;
        totalBytes: number;
      };
      activeBatchCollector.flushes += 1;
      activeBatchCollector.totalBuffers += flushPayload.bufferCount;
      activeBatchCollector.totalBytes += flushPayload.totalBytes;
      activeBatchCollector.maxBuffers = Math.max(
        activeBatchCollector.maxBuffers,
        flushPayload.bufferCount,
      );
      activeBatchCollector.maxBytes = Math.max(
        activeBatchCollector.maxBytes,
        flushPayload.totalBytes,
      );
    }
    return originalEmit.apply(this, args);
  };
  BatchFramer.prototype.emit = wrappedEmit as typeof originalEmit;
  batchFramerPatched = true;
};

const microsToMillis = (value: number): number => value / 1000;
const nanosToMillis = (value: number): number => value / 1_000_000;

const startDiagnostics = (
  serverInstance: Pick<EventEmitter, "on" | "off">,
): DiagnosticsScope => {
  if (ENABLE_DIAGNOSTICS) {
    ensureBatchFramerDiagnostics();
  }

  const startGc = snapshotGcTotals();
  const startElu = performance.eventLoopUtilization();
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  let backpressureEvents = 0;
  let drainEvents = 0;
  let maxQueuedBytes = 0;

  const onBackpressure = ({ queuedBytes }: { queuedBytes?: number }) => {
    backpressureEvents += 1;
    if (typeof queuedBytes === "number") {
      maxQueuedBytes = Math.max(maxQueuedBytes, queuedBytes);
    }
  };
  const onDrain = () => {
    drainEvents += 1;
  };

  serverInstance.on("backpressure", onBackpressure as never);
  serverInstance.on("drain", onDrain as never);

  const batchStats: BatchFlushStats = {
    flushes: 0,
    totalBuffers: 0,
    totalBytes: 0,
    maxBuffers: 0,
    maxBytes: 0,
  };

  const previousCollector = activeBatchCollector;
  activeBatchCollector = batchStats;

  return {
    stop: (extras?: DiagnosticsExtras) => {
      serverInstance.off("backpressure", onBackpressure as never);
      serverInstance.off("drain", onDrain as never);
      activeBatchCollector = previousCollector;
      loopDelay.disable();

      const gc = diffGcTotals(startGc);
      const eluDelta: EventLoopUtilization =
        performance.eventLoopUtilization(startElu);
      const eventLoop = {
        utilization: Number(eluDelta.utilization) || 0,
        activeMs: microsToMillis(Number(eluDelta.active) || 0),
        idleMs: microsToMillis(Number(eluDelta.idle) || 0),
      };
      const eventLoopDelay = buildLoopDelayStats(loopDelay);

      const batching = {
        flushes: batchStats.flushes,
        avgBuffersPerFlush:
          batchStats.flushes > 0
            ? batchStats.totalBuffers / batchStats.flushes
            : 0,
        avgBytesPerFlush:
          batchStats.flushes > 0
            ? batchStats.totalBytes / batchStats.flushes
            : 0,
        maxBuffers: batchStats.maxBuffers,
        maxBytes: batchStats.maxBytes,
      };

      const backpressure = {
        events: backpressureEvents,
        drainEvents,
        maxQueuedBytes,
      };

      return {
        gc,
        eventLoop,
        eventLoopDelay,
        backpressure,
        batching,
        sendBlocks: extras?.sendBlocks,
      };
    },
  };
};

const buildLoopDelayStats = (
  histogram: ReturnType<typeof monitorEventLoopDelay>,
) => ({
  minMs: nanosToMillis(histogram.min),
  maxMs: nanosToMillis(histogram.max),
  meanMs: nanosToMillis(histogram.mean),
  stdMs: nanosToMillis(histogram.stddev),
  p50Ms: nanosToMillis(histogram.percentile(50)),
  p99Ms: nanosToMillis(histogram.percentile(99)),
});

const summarizeBlockDurations = (
  durations: number[],
  blockSize: number,
): SendBlockStats | undefined => {
  if (!durations.length) return undefined;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const d of durations) {
    sum += d;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return {
    blockSize,
    samples: durations.length,
    avgMs: sum / durations.length,
    minMs: min,
    maxMs: max,
  };
};

async function waitForCompletion(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

async function runScenario({
  id,
  preferNativeServer,
  clientMode,
  serverBackend,
}: Scenario): Promise<ScenarioResult> {
  if (!clientModeAvailable(clientMode)) {
    return {
      id,
      clientMode,
      serverMode: preferNativeServer ? "native-lws" : "ts",
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: BENCH_FRAMING,
      skipped: true,
      reason: "Native client backend unavailable",
    };
  }

  if (!serverModeAvailable(preferNativeServer, serverBackend)) {
    return {
      id,
      clientMode,
      serverMode: "ts",
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: BENCH_FRAMING,
      skipped: true,
      reason: serverBackend
        ? `Native server backend ${serverBackend} unavailable`
        : "Native server backend unavailable",
    };
  }

  type BenchServerOptions = QWormholeServerOptions<Buffer> & {
    preferNative?: boolean;
    preferredNativeBackend?: NativeBackend;
  };
  const serverResult = createQWormholeServer({
    host: "127.0.0.1",
    port: 0,
    framing: BENCH_FRAMING,
    serializer: toBytes,
    deserializer: (data: Buffer) => data as Buffer,
    preferNative: preferNativeServer,
    preferredNativeBackend: serverBackend,
  } as BenchServerOptions);
  if (preferNativeServer && serverResult.mode === "ts") {
    await serverResult.server.close();
    return {
      id,
      serverMode: serverResult.mode as Mode,
      clientMode,
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: BENCH_FRAMING,
      skipped: true,
      reason: "Native backend unavailable",
    };
  }
  const serverMode = serverResult.mode;
  const serverInstance = serverResult.server;

  const diagnosticsScope = ENABLE_DIAGNOSTICS
    ? startDiagnostics(serverInstance)
    : null;

  const address = await serverInstance.listen();
  const port = address.port;

  let tsClient: QWormholeClient<Buffer> | null = null;
  let nativeClient: NativeTcpClient | null = null;
  if (clientMode === "ts") {
    tsClient = new QWormholeClient<Buffer>({
      host: "127.0.0.1",
      port,
      framing: BENCH_FRAMING,
      serializer: toBytes,
      deserializer: (data: Buffer) => data,
      entropyMetrics: {
        negIndex: BENCH_NEG_INDEX,
        coherence: deriveBenchCoherence(),
        entropyVelocity: "low",
      },
    });
    await tsClient.connect();
  } else {
    const backend = clientMode === "native-lws" ? "lws" : "libsocket";
    nativeClient = new NativeTcpClient(backend);
    if (nativeClient.backend !== backend) {
      await serverInstance.close();
      return {
        id,
        serverMode: serverMode as Mode,
        clientMode,
        preferredServerBackend: serverBackend,
        durationMs: 0,
        messagesReceived: 0,
        bytesReceived: 0,
        framing: BENCH_FRAMING,
        skipped: true,
        reason: `Native client backend ${backend} unavailable`,
      };
    }
    nativeClient.connect("127.0.0.1", port);
  }

  let messagesReceived = 0;
  let bytesReceived = 0;
  const onMessage = ({ data }: { data: Buffer }) => {
    const buffer = Buffer.isBuffer(data) ? data : toBytes(data);
    messagesReceived += 1;
    bytesReceived += buffer.length;
  };
  serverInstance.on("message", onMessage as never);

  let duration = 0;
  let diagnostics: ScenarioDiagnostics | undefined;
  const sendBlockDurations: number[] = [];
  const blockSampleSize =
    Number(process.env.QWORMHOLE_BENCH_BLOCK_SIZE ?? "1000") || 1000;
  let blockCount = 0;
  let blockStart = ENABLE_DIAGNOSTICS ? performance.now() : 0;

  try {
    const start = performance.now();
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      if (tsClient) {
        tsClient.send(PAYLOAD);
      } else if (nativeClient) {
        nativeClient.send(NATIVE_CLIENT_PAYLOAD);
      }
      if (ENABLE_DIAGNOSTICS) {
        blockCount += 1;
        if (blockCount >= blockSampleSize || i === TOTAL_MESSAGES - 1) {
          const now = performance.now();
          sendBlockDurations.push(now - blockStart);
          blockStart = now;
          blockCount = 0;
        }
      }
    }

    await waitForCompletion(
      () => messagesReceived >= TOTAL_MESSAGES,
      TIMEOUT_MS,
    );
    duration = performance.now() - start;
  } finally {
    serverInstance.off("message", onMessage as never);
    if (tsClient) {
      tsClient.disconnect();
    }
    if (nativeClient) {
      nativeClient.close();
    }
    await serverInstance.close();
    const blockStats =
      ENABLE_DIAGNOSTICS && sendBlockDurations.length
        ? summarizeBlockDurations(sendBlockDurations, blockSampleSize)
        : undefined;
    diagnostics = diagnosticsScope?.stop({ sendBlocks: blockStats });
  }

  const seconds = duration / 1000;
  const msgsPerSec =
    seconds > 0 && messagesReceived > 0
      ? messagesReceived / seconds
      : undefined;
  const mbPerSec =
    seconds > 0 && bytesReceived > 0
      ? bytesReceived / seconds / (1024 * 1024)
      : undefined;

  return {
    id,
    serverMode: serverMode as Mode,
    clientMode,
    preferredServerBackend: serverBackend,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: BENCH_FRAMING,
    msgsPerSec,
    mbPerSec,
    diagnostics,
  };
}

/**
 * Simple KCP+Mux echo bench (client + server both KCP).
 */
async function runKcpScenario(): Promise<ScenarioResult> {
  const server = new KcpServer({
    listenPort: 0,
    conv: 12345,
    updateIntervalMs: KCP_INTERVAL_MS,
    sndWnd: KCP_SND_WND,
    rcvWnd: KCP_RCV_WND,
    mtu: KCP_MTU,
  });
  let serverPort = 0;
  let messagesReceived = 0;
  let bytesReceived = 0;
  let lastKcpMetrics: { rttMs?: number; lossRate?: number; pending?: number } = {};

  server.on("session", ({ mux }) => {
    mux.on("stream", (stream: { 
      on: (event: "data", listener: (data: Uint8Array) => void) => void; 
      write: (data: Uint8Array) => void; 
    }) => {
      stream.on("data", (data: Uint8Array) => {
      messagesReceived += 1;
      bytesReceived += data?.byteLength ?? 0;
      stream.write(data ?? new Uint8Array());
      });
    });
  });

  serverPort = await server.start();

  const client = new KcpSession(
    { address: "127.0.0.1", port: serverPort },
    {
      conv: 12345,
      updateIntervalMs: KCP_INTERVAL_MS,
      sndWnd: KCP_SND_WND,
      rcvWnd: KCP_RCV_WND,
      mtu: KCP_MTU,
    },
  );
  await client.connect();
  client.on("kcp:metrics", m => {
    lastKcpMetrics = {
      rttMs: m.rttMs,
      lossRate: m.lossRate,
      pending: m.pending,
    };
  });

  const stream = client.mux.createStream();
  stream.on("data", () => {
    // count is tracked in server handler; client doesn't need to duplicate
  });

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    stream.write(PAYLOAD);
  }

  await waitForCompletion(
    () => messagesReceived >= TOTAL_MESSAGES,
    KCP_TIMEOUT_MS,
  );
  const duration = performance.now() - start;

  try {
    stream.close();
    client.close();
    server.stop();
  } catch(e) {
    console.error("Error during KCP cleanup:", e);
  }


  const seconds = duration / 1000;
  const msgsPerSec =
    seconds > 0 && messagesReceived > 0
      ? messagesReceived / seconds
      : undefined;
  const mbPerSec =
    seconds > 0 && bytesReceived > 0
      ? bytesReceived / seconds / (1024 * 1024)
      : undefined;

  return {
    id: "kcp-server+kcp",
    serverMode: "kcp",
    clientMode: "kcp",
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: "kcp-arq",
    msgsPerSec,
    mbPerSec,
    kcpRttMs: lastKcpMetrics.rttMs,
    kcpLossRate: lastKcpMetrics.lossRate,
    kcpPending: lastKcpMetrics.pending,
  };
}

async function runQuicScenario(): Promise<ScenarioResult> {
  if (!isQuicAvailable()) {
    return {
      id: "quic-server+quic",
      serverMode: "quic",
      clientMode: "quic",
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "quic-stream",
      skipped: true,
      reason: "QUIC binding unavailable",
    };
  }

  const server = new QuicServer({ host: "127.0.0.1", port: 0 });
  await server.listen();
  const port = server.port ?? 0;
  if (port === 0) {
    server.close();
    return {
      id: "quic-server+quic",
      serverMode: "quic",
      clientMode: "quic",
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "quic-stream",
      skipped: true,
      reason: "QUIC server failed to bind",
    };
  }

  let messagesReceived = 0;
  let bytesReceived = 0;

  server.on("connection", conn => {
    conn.onData(data => {
      // echo
      conn.send(data);
    });
  });

  const client = new QuicTransport({ host: "127.0.0.1", port });
  await client.connect();
  client.onData(data => {
    messagesReceived += 1;
    bytesReceived += data.length;
  });

  const start = performance.now();
  try {
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      client.send(PAYLOAD);
    }

    await waitForCompletion(
      () => messagesReceived >= TOTAL_MESSAGES,
      TIMEOUT_MS,
    );
  } finally {
    await client.close();
    server.close();
  }

  const duration = performance.now() - start;
  const seconds = duration / 1000;
  const msgsPerSec =
    seconds > 0 && messagesReceived > 0
      ? messagesReceived / seconds
      : undefined;
  const mbPerSec =
    seconds > 0 && bytesReceived > 0
      ? bytesReceived / seconds / (1024 * 1024)
      : undefined;

  return {
    id: "quic-server+quic",
    serverMode: "quic",
    clientMode: "quic",
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: "quic-stream",
    msgsPerSec,
    mbPerSec,
  };
}

async function mainBench() {
  const modes = parseModeArg();
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (!modes.includes(scenario.clientMode)) continue;
    const res = await runScenario(scenario);
    results.push(res);
  }

  if (modes.includes("kcp")) {
    const kcpRes = await runKcpScenario();
    results.push(kcpRes);
  }
  if (modes.includes("quic")) {
    const quicRes = await runQuicScenario();
    results.push(quicRes);
  }

  const csvPath = getCsvPath();
  if (csvPath !== undefined) {
    const header = formatCsvHeader();
    const rows = results.map(formatCsvRow).join("");
    const csv = header + rows;
    if (csvPath) {
      await import("node:fs/promises").then(fs =>
        fs.writeFile(csvPath, csv, "utf8"),
      );
      console.log(`csv written to ${csvPath}`);
    } else {
      process.stdout.write(csv);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  }

  const pad = (s: string, n: number) => s.toString().padEnd(n);
  const header = `${pad("Scenario", 28)}${pad("Server", 15)}${pad("Client", 15)}${pad(
    "Duration (ms)",
    16,
  )}${pad("Messages", 12)}${pad("Bytes", 12)}${pad("Msg/s", 12)}${pad(
    "MB/s",
    12,
  )}${pad("Framing", 12)}${pad("Status", 10)}`;
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const res of results) {
    console.log(
      `${pad(res.id, 28)}${pad(res.serverMode, 15)}${pad(res.clientMode, 15)}${pad(
        res.durationMs ? res.durationMs.toFixed(2) : "-",
        16,
      )}${pad(`${res.messagesReceived ?? "-"}`, 12)}${pad(
        `${res.bytesReceived ?? "-"}`,
        12,
      )}${pad(
        res.msgsPerSec && Number.isFinite(res.msgsPerSec)
          ? res.msgsPerSec.toFixed(0)
          : "-",
        12,
      )}${pad(
        res.mbPerSec && Number.isFinite(res.mbPerSec)
          ? res.mbPerSec.toFixed(2)
          : "-",
        12,
      )}${pad(res.framing, 12)}${pad(res.skipped ? "skipped" : "ok", 10)}`,
    );
  }

  if (ENABLE_DIAGNOSTICS) {
    const diagHeader = `${pad("Scenario", 28)}${pad("GC", 12)}${pad(
      "GC ms",
      12,
    )}${pad("ELU%", 10)}${pad("BP", 12)}${pad("Drain", 10)}${pad(
      "MaxQueued",
      14,
    )}${pad("Flushes", 10)}${pad("AvgBuf", 10)}${pad("AvgKB", 10)}${pad(
      "MaxBuf",
      10,
    )}${pad("MaxKB", 10)}`;
    console.log("\n" + diagHeader);
    console.log("-".repeat(diagHeader.length));
    for (const res of results) {
      if (res.skipped || !res.diagnostics) continue;
      const diag = res.diagnostics;
      const eluPercent = (diag.eventLoop.utilization * 100).toFixed(2);
      const avgKb = (diag.batching.avgBytesPerFlush / 1024).toFixed(2);
      const maxKb = (diag.batching.maxBytes / 1024).toFixed(2);
      const gcDuration = diag.gc.durationMs.toFixed(2);
      console.log(
        `${pad(res.id, 28)}${pad(`${diag.gc.count}`, 12)}${pad(
          gcDuration,
          12,
        )}${pad(eluPercent, 10)}${pad(
          `${diag.backpressure.events}`,
          12,
        )}${pad(`${diag.backpressure.drainEvents}`, 10)}${pad(
          `${diag.backpressure.maxQueuedBytes}`,
          14,
        )}${pad(`${diag.batching.flushes}`, 10)}${pad(
          diag.batching.avgBuffersPerFlush.toFixed(2),
          10,
        )}${pad(avgKb, 10)}${pad(
          `${diag.batching.maxBuffers}`,
          10,
        )}${pad(maxKb, 10)}`,
      );
    }
  }
}

mainBench()
  .then(() => {
    // Ensure any event-loop monitors created by FlowController don't keep the process alive.
    shutdownFlowControllerMonitors();
    process.exit(0);
  })
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    shutdownFlowControllerMonitors();
    process.exit(1);
  });

export type {
  Scenario,
  ScenarioResult,
  ScenarioDiagnostics,
  BenchResult,
};

export {
  runScenario,
  runKcpScenario,
  mainBench,
  runScenario as _runScenario, // for testing
  toBytes as _toBytes, // for testing
  clientModeAvailable as _clientModeAvailable, // for testing
  serverModeAvailable as _serverModeAvailable, // for testing
};
