import {
  performance,
  PerformanceObserver,
  constants as perfConstants,
  type EventLoopUtilization,
} from "node:perf_hooks";
import type { EventEmitter } from "node:events";
import {
  QWormholeClient,
  NativeTcpClient,
  createQWormholeServer,
  isNativeAvailable,
} from "../src/index";
import { isNativeServerAvailable } from "../src/native-server";
import { BatchFramer } from "../src/batch-framer";
import type {
  FramingMode,
  NativeBackend,
  Payload,
  QWormholeServerOptions,
  Serializer,
} from "../src/types/types";

type Mode = "ts" | "native-lws" | "native-libsocket";

const MODES: Mode[] = ["ts", "native-lws", "native-libsocket"];
function parseModeArg(): Mode[] {
  const arg = process.argv.find(a => a.startsWith("--mode="));
  if (!arg) return MODES;
  const val = arg.split("=")[1];
  if (val === "all") return MODES;
  if (MODES.includes(val as Mode)) return [val as Mode];
  return MODES;
}

const PAYLOAD = Buffer.alloc(1024, 1);
const TOTAL_MESSAGES = 10_000;
const TIMEOUT_MS = 5000;
const BENCH_FRAMING: FramingMode =
  process.env.QWORMHOLE_BENCH_FRAMING === "none" ? "none" : "length-prefixed";
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

interface Scenario {
  id: string;
  preferNativeServer: boolean;
  clientMode: Mode;
  serverBackend?: NativeBackend;
}

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
    for (const mode of MODES) {
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
  return availableLibsocket && isNativeAvailable();
};

const serverModeAvailable = (
  preferNative: boolean,
  backend?: NativeBackend,
): boolean => {
  if (!preferNative) return true;
  return isNativeServerAvailable(backend);
};

type ScenarioResult = {
  id: string;
  serverMode: Mode;
  clientMode: Mode;
  preferredServerBackend?: NativeBackend;
  durationMs: number;
  messagesReceived: number;
  bytesReceived: number;
  framing: FramingMode;
  skipped?: boolean;
  reason?: string;
  msgsPerSec?: number;
  mbPerSec?: number;
  diagnostics?: ScenarioDiagnostics;
};

type BatchFlushStats = {
  flushes: number;
  totalBuffers: number;
  totalBytes: number;
  maxBuffers: number;
  maxBytes: number;
};

type GcTotals = {
  count: number;
  durationMs: number;
  byKind: Record<string, number>;
};

type ScenarioDiagnostics = {
  gc: GcTotals;
  eventLoop: {
    utilization: number;
    activeMs: number;
    idleMs: number;
  };
  backpressure: {
    events: number;
    drainEvents: number;
    maxQueuedBytes: number;
  };
  batching: {
    flushes: number;
    avgBuffersPerFlush: number;
    avgBytesPerFlush: number;
    maxBuffers: number;
    maxBytes: number;
  };
};

type DiagnosticsScope = {
  stop: () => ScenarioDiagnostics;
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

const startDiagnostics = (
  serverInstance: Pick<EventEmitter, "on" | "off">,
): DiagnosticsScope => {
  if (ENABLE_DIAGNOSTICS) {
    ensureBatchFramerDiagnostics();
  }

  const startGc = snapshotGcTotals();
  const startElu = performance.eventLoopUtilization();

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
    stop: () => {
      serverInstance.off("backpressure", onBackpressure as never);
      serverInstance.off("drain", onDrain as never);
      activeBatchCollector = previousCollector;

      const gc = diffGcTotals(startGc);
      const eluDelta: EventLoopUtilization =
        performance.eventLoopUtilization(startElu);
      const eventLoop = {
        utilization: Number(eluDelta.utilization) || 0,
        activeMs: microsToMillis(Number(eluDelta.active) || 0),
        idleMs: microsToMillis(Number(eluDelta.idle) || 0),
      };

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

      return {
        gc,
        eventLoop,
        backpressure: {
          events: backpressureEvents,
          drainEvents,
          maxQueuedBytes,
        },
        batching,
      };
    },
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
if (preferNativeServer && serverResult.mode !== "native-lws") {
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

  try {
    const start = performance.now();
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      if (tsClient) {
        tsClient.send(PAYLOAD);
      } else if (nativeClient) {
        nativeClient.send(NATIVE_CLIENT_PAYLOAD);
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
    diagnostics = diagnosticsScope?.stop();
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

async function main() {
  const modes = parseModeArg();
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (!modes.includes(scenario.clientMode)) continue;
    const res = await runScenario(scenario);
    results.push(res);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));

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

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
