// --- Coherence Trace Types ---

import {
  performance,
  PerformanceObserver,
  constants as perfConstants,
  monitorEventLoopDelay,
  type EventLoopUtilization,
} from "node:perf_hooks";
import { fork } from "node:child_process";
import { once, type EventEmitter } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import {
  QWormholeClient,
  NativeTcpClient,
  createQWormholeServer,
  isNativeAvailable,
  QuicTransport,
  QuicServer,
  quicAvailable,
} from "../src/index";
import path from "node:path";
import { shutdownFlowControllerMonitors } from "../src/core/flow-controller";
import { isNativeServerAvailable } from "../src/core/native-server";
import { BatchFramer } from "../src/core/batch-framer";
import type {
  FlowController,
  FlowControllerDiagnostics,
} from "../src/core/flow-controller";
import { CoherenceController } from "../src/core/CoherenceController";
import type { BatchFramerStats } from "../src/core/batch-framer";
import type { PriorityQueueStats } from "../src/core/qos";
import { LengthPrefixedFramer } from "../src/core/framing";
import { KcpServer } from "../src/transports/kcp/kcp-server";
import { KcpSession } from "../src/transports/kcp/kcp-session";
import { inferMessageType } from "../src/utils/negentropic-diagnostics";
import type {
  FramingMode,
  NativeBackend,
  Payload,
  QWormholeServerOptions,
  Serializer,
} from "../src/types/types";
import WebSocket, { WebSocketServer } from "ws";
import * as dotenv from "dotenv";
import {
  ScenarioDiagnostics,
  Scenario,
  GcTotals,
  BatchFlushStats,
  DiagnosticsScope,
  SendBlockStats,
  ScenarioResult,
  DiagnosticsExtras,
  CoherenceDecisionSample,
} from "../test/testtypes";
dotenv.config({
  quiet: process.env.QWORMHOLE_BENCH_CHILD === "1",
});
interface TrustSnapshot {
  flowDiagnostics?: FlowControllerDiagnostics;
  batchStats?: BatchFramerStats;
  queueStats?: PriorityQueueStats;
}

interface EntropyMetrics {
  negIndex: number;
  coherence: "high" | "medium" | "low" | "chaos";
  entropyVelocity: string;
}

type PayloadSummary = {
  count: number;
  minBytes: number;
  maxBytes: number;
  avgBytes: number;
  types: string[];
  framing: FramingMode;
  frameHeaderBytes: number;
};

type BenchConfigSummary = {
  effectiveRateBytesPerSec?: number;
  flushCapBytes?: number;
  flushCapBuffers?: number;
  flushIntervalMs?: number;
  adaptiveMode?: string;
  macroBatchTargetBytes: number;
  yieldEvery?: number;
  flowFastPath: boolean;
  payload: PayloadSummary;
};

interface QWormholeClientOptions {
  host: string;
  port: number;
  framing: FramingMode;
  serializer: Serializer;
  deserializer: (data: Buffer) => Buffer;
  entropyMetrics: EntropyMetrics;
  onTrustSnapshot: (snapshot: TrustSnapshot) => void;
  peerIsNative: boolean;
  socketHighWaterMark?: number;
  coherence?: { enabled: boolean; mode: string };
}

const BENCH_COHERENCE = process.env.QWORMHOLE_BENCH_COHERENCE === "1";
const BENCH_COHERENCE_MODE =
  process.env.QWORMHOLE_BENCH_COHERENCE_MODE ?? "observe";
const BENCH_TRANSPORT_COHERENCE =
  process.env.QWORMHOLE_TRANSPORT_COHERENCE === "1";
const BENCH_TRACE = process.env.QWORMHOLE_BENCH_TRACE === "1";
const BENCH_FORK = process.env.QWORMHOLE_BENCH_FORK === "1";
const BENCH_CHILD = process.env.QWORMHOLE_BENCH_CHILD === "1";
const BENCH_REPEAT = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_REPEAT ?? "1") || 1,
);

type BenchChildInit = {
  type: "init";
  scenario: Scenario;
  framing: FramingMode;
  totalMessages: number;
  enableDiagnostics: boolean;
  benchCoherence: boolean;
};

type BenchChildReady = {
  type: "ready";
  port: number;
  serverMode: Mode;
};

type BenchChildDone = {
  type: "done";
  messagesReceived: number;
  bytesReceived: number;
  serverMode: Mode;
  diagnostics?: ScenarioDiagnostics;
  result?: ScenarioResult;
};

type BenchChildSkip = {
  type: "skip";
  reason: string;
  serverMode: Mode;
};

type BenchChildError = {
  type: "error";
  message: string;
  stack?: string;
};

type BenchChildMessage =
  | BenchChildInit
  | BenchChildReady
  | BenchChildDone
  | BenchChildSkip
  | BenchChildError
  | { type: "stop" };

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
const BENCH_CSV_PATH = getCsvPath();
const BENCH_JSONL_PATH = process.env.QWORMHOLE_BENCH_JSONL;
const BENCH_REPORT_PATH = process.env.QWORMHOLE_BENCH_REPORT;

type Mode =
  | "ts"
  | "native-lws"
  | "native-libsocket"
  | "net"
  | "ws"
  | "uwebsockets"
  | "kcp"
  | "kcp-arq"
  | "quic";

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
  benchConfig?: BenchConfigSummary;
  kcpRttMs?: number;
  kcpLossRate?: number;
  kcpPending?: number;
}

const SOCKET_MODES: Mode[] = ["ts", "native-lws", "native-libsocket", "quic"];
const BASELINE_MODES: Mode[] = ["net", "ws", "uwebsockets"];
const ALL_MODES: Mode[] = [...SOCKET_MODES, ...BASELINE_MODES, "kcp", "quic"];
const CORE_MODES: Mode[] = ["ts", "native-lws", "native-libsocket"];
const COMPARE_MODES: Mode[] = [...CORE_MODES, ...BASELINE_MODES];
function parseModeArg(): Mode[] {
  const arg = process.argv.find(a => a.startsWith("--mode="));
  if (!arg) return ALL_MODES;
  const val = arg.split("=")[1];
  if (val === "all") return ALL_MODES;
  if (val === "core") return CORE_MODES;
  if (val === "compare") return COMPARE_MODES;
  if (ALL_MODES.includes(val as Mode)) return [val as Mode];
  return ALL_MODES;
}

const PAYLOAD = Buffer.alloc(1024, 1);
const TOTAL_MESSAGES = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_MESSAGES ?? "10000") || 10000,
);
const BENCH_CLIENTS = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_CLIENTS ?? "1") || 1,
);
const MESSAGES_PER_CLIENT = Math.ceil(TOTAL_MESSAGES / BENCH_CLIENTS);
const WARMUP_MESSAGES = Math.max(
  0,
  Math.min(
    TOTAL_MESSAGES,
    Number(
      process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES ??
        String(Math.min(2000, Math.max(100, Math.floor(TOTAL_MESSAGES / 10)))),
    ) || 0,
  ),
);
const TIMEOUT_MS = 5000;
const KCP_TIMEOUT_MS =
  Number(process.env.QW_KCP_TIMEOUT_MS ?? "20000") || 20000;
const envNumber = (key: string): number | undefined => {
  const raw = process.env[key];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const BENCH_YIELD_EVERY = envNumber("QWORMHOLE_BENCH_YIELD_EVERY");
const parseHandshakeTags = (
  raw?: string,
): Record<string, string | number> | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const tags: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number") {
        tags[key] = value;
      }
    }
    return Object.keys(tags).length > 0 ? tags : undefined;
  } catch {
    return undefined;
  }
};
const KCP_INTERVAL_MS = envNumber("QW_KCP_INTERVAL_MS");
const KCP_SND_WND = envNumber("QW_KCP_SND_WND");
const KCP_RCV_WND = envNumber("QW_KCP_RCV_WND");
const KCP_MTU = envNumber("QW_KCP_MTU");
const BENCH_SOCKET_HWM = envNumber("QWORMHOLE_BENCH_HWM");
const BENCH_FRAMING: FramingMode =
  process.env.QWORMHOLE_BENCH_FRAMING === "none" ? "none" : "length-prefixed";
const BENCH_DISABLE_FLOW = process.env.QWORMHOLE_BENCH_NO_FLOW === "1";
const BENCH_FLOW_FAST = process.env.QWORMHOLE_BENCH_FLOW_FAST === "1";
const BENCH_DIVERSE_PAYLOADS =
  process.env.QWORMHOLE_BENCH_DIVERSITY === "1";
const BENCH_NEG_INDEX = (() => {
  const raw = process.env.QWORMHOLE_BENCH_NEG_INDEX;
  if (!raw) return 0.9;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return 0.9;
  return Math.min(Math.max(parsed, 0), 1);
})();
const FRAME_HEADER_BYTES = 4;
const DEFAULT_MAX_FRAME_LENGTH = 16 * 1024 * 1024;
const MACRO_BATCH_TARGET_BYTES = 128 * 1024;
const ENABLE_DIAGNOSTICS =
  process.argv.includes("--diagnostics") ||
  process.env.QWORMHOLE_BENCH_DIAGNOSTICS === "1";

const formatTransportMetric = (value?: number): string => {
  if (Number.isFinite(value)) {
    return (value as number).toFixed(3);
  }
  return BENCH_TRANSPORT_COHERENCE ? "-" : "off";
};

const padToBytes = (prefix: string, targetBytes: number): string => {
  const size = Buffer.byteLength(prefix);
  if (size >= targetBytes) return prefix.slice(0, targetBytes);
  return prefix + "x".repeat(targetBytes - size);
};

const buildSizedObject = (
  base: Record<string, unknown>,
  targetBytes: number,
): Record<string, unknown> => {
  const payload = { ...base, payload: "" };
  let json = JSON.stringify(payload);
  let remaining = Math.max(0, targetBytes - Buffer.byteLength(json));
  payload.payload = "x".repeat(remaining);
  json = JSON.stringify(payload);
  const extra = Buffer.byteLength(json) - targetBytes;
  if (extra > 0) {
    payload.payload = payload.payload.slice(
      0,
      Math.max(0, payload.payload.length - extra),
    );
  }
  return payload;
};

const buildPayloadVariants = (): Payload[] => {
  if (!BENCH_DIVERSE_PAYLOADS) return [PAYLOAD];
  const size = PAYLOAD.length;
  const textPayload = padToBytes("bench:text:", size);
  const bytesPayload = new Uint8Array(size);
  bytesPayload.fill(2);
  return [
    PAYLOAD,
    textPayload,
    bytesPayload,
    buildSizedObject({ type: "signal" }, size),
    buildSizedObject({ event: "bench" }, size),
    buildSizedObject({ action: "ping" }, size),
  ];
};

const BENCH_PAYLOADS = buildPayloadVariants();
const getBenchPayload = (i: number): Payload =>
  BENCH_PAYLOADS[i % BENCH_PAYLOADS.length];

const encodeLengthPrefixed = (payload: Buffer): Buffer => {
  const framed = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
  framed.writeUInt32BE(payload.length, 0);
  payload.copy(framed, FRAME_HEADER_BYTES);
  return framed;
};

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

let uwsModulePromise: Promise<any | null> | null = null;
const loadUwsModule = async (): Promise<any | null> => {
  if (!uwsModulePromise) {
    uwsModulePromise = (async () => {
      try {
        const importer = new Function(
          "specifier",
          "return import(specifier)",
        ) as (specifier: string) => Promise<any>;
        return await importer("uWebSockets.js");
      } catch {
        return null;
      }
    })();
  }
  return uwsModulePromise;
};

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

const baselineScenarios: Scenario[] = [
  {
    id: "net-server+net",
    preferNativeServer: false,
    clientMode: "net",
  },
  {
    id: "ws-server+ws",
    preferNativeServer: false,
    clientMode: "ws",
  },
  {
    id: "uwebsockets-server+ws",
    preferNativeServer: false,
    clientMode: "uwebsockets",
  },
];

const framingForClientMode = (mode: Mode): FramingMode =>
  isBaselineMode(mode) ? "none" : BENCH_FRAMING;

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
const benchSerializer: Serializer = (() => {
  const cache = new Map<Payload, Buffer>();
  return (payload: Payload): Buffer => {
    const cached = cache.get(payload);
    if (cached) return cached;
    const encoded = toBytes(payload);
    cache.set(payload, encoded);
    return encoded;
  };
})();
const summarizePayloadBytes = (framing: FramingMode): PayloadSummary => {
  const sizes = BENCH_PAYLOADS.map(payload => benchSerializer(payload).length);
  const count = sizes.length;
  const minBytes = count ? Math.min(...sizes) : 0;
  const maxBytes = count ? Math.max(...sizes) : 0;
  const avgBytes = count
    ? sizes.reduce((sum, value) => sum + value, 0) / count
    : 0;
  const types = Array.from(
    new Set(BENCH_PAYLOADS.map(payload => inferMessageType(payload))),
  ).filter(Boolean);
  return {
    count,
    minBytes,
    maxBytes,
    avgBytes,
    types,
    framing,
    frameHeaderBytes: framing === "length-prefixed" ? FRAME_HEADER_BYTES : 0,
  };
};
const PAYLOAD_SUMMARY = summarizePayloadBytes(BENCH_FRAMING);

const buildNativePayloads = (framing: FramingMode): Buffer[] =>
  BENCH_PAYLOADS.map(payload => {
    const bytes = toBytes(payload);
    return framing === "length-prefixed"
      ? encodeLengthPrefixed(bytes)
      : bytes;
  });
const NATIVE_PAYLOADS_BY_FRAMING: Record<FramingMode, Buffer[]> = {
  "length-prefixed": buildNativePayloads("length-prefixed"),
  none: buildNativePayloads("none"),
};
const getNativePayload = (i: number, framing: FramingMode): Buffer => {
  const payloads = NATIVE_PAYLOADS_BY_FRAMING[framing];
  return payloads[i % payloads.length];
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const NATIVE_SEND_BATCH_SIZE = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_NATIVE_SEND_BATCH ?? "64") || 64,
);

const sendBenchPayloadAt = (
  index: number,
  tsClient: QWormholeClient<Buffer> | null,
  nativeClient: NativeTcpClient | null,
  framing: FramingMode,
): void => {
  const payload = getBenchPayload(index);
  if (tsClient) {
    void tsClient.send(payload);
  } else if (nativeClient) {
    nativeClient.send(getNativePayload(index, framing));
  }
};

const flushNativeBenchBatch = (
  nativeClient: NativeTcpClient | null,
  batch: Buffer[],
): void => {
  if (!nativeClient || batch.length === 0) return;
  if (batch.length === 1) {
    nativeClient.send(batch[0]);
  } else {
    nativeClient.sendMany(batch);
  }
  batch.length = 0;
};

const clientModeAvailable = (mode: Mode): boolean => {
  if (mode === "ts") return true;
  if (mode === "net" || mode === "ws") return true;
  if (mode === "uwebsockets") return true;
  if (mode === "native-lws") return availableLws && isNativeAvailable();
  if (mode === "quic") return quicAvailable();
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

const buildBenchConfigSummary = (
  flowController?: FlowController | null,
  framing: FramingMode = BENCH_FRAMING,
): BenchConfigSummary => {
  const summary: BenchConfigSummary = {
    macroBatchTargetBytes: MACRO_BATCH_TARGET_BYTES,
    yieldEvery: BENCH_YIELD_EVERY,
    flowFastPath: BENCH_FLOW_FAST,
    payload: summarizePayloadBytes(framing),
  };
  if (!flowController) return summary;
  const diag = flowController.getDiagnostics();
  const caps = flowController.resolveFramerCaps(diag.policy.peerIsNative);
  return {
    ...summary,
    effectiveRateBytesPerSec: diag.effectiveRateBytesPerSec,
    flushCapBytes: caps.maxBytes,
    flushCapBuffers: caps.maxBuffers,
    flushIntervalMs: caps.flushMs,
    adaptiveMode: diag.adaptive?.mode,
  };
};

const logBenchConfig = (label: string, summary: BenchConfigSummary): void => {
  if (BENCH_CSV_PATH === "") return;
  const payload = summary.payload;
  const payloadStats = {
    count: payload.count,
    minBytes: payload.minBytes,
    maxBytes: payload.maxBytes,
    avgBytes: Number(payload.avgBytes.toFixed(2)),
    types: payload.types,
  };
  const config = {
    effectiveRateBytesPerSec: summary.effectiveRateBytesPerSec,
    flushCapBytes: summary.flushCapBytes,
    flushCapBuffers: summary.flushCapBuffers,
    flushIntervalMs: summary.flushIntervalMs,
    macroBatchTargetBytes: summary.macroBatchTargetBytes,
    yieldEvery: summary.yieldEvery ?? 0,
    flowFastPath: summary.flowFastPath,
    adaptiveMode: summary.adaptiveMode,
    framing: payload.framing,
    frameHeaderBytes: payload.frameHeaderBytes,
    payloadBytes: payloadStats,
  };
  // eslint-disable-next-line no-console
  console.log(`[bench] ${label} config`, JSON.stringify(config));
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

let gcObserverActive = false;
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
  gcObserverActive = true;
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
type TransportCallStats = NonNullable<ScenarioDiagnostics["transportCalls"]>;
let transportCallsPatched = false;
let activeTransportCollector: TransportCallStats | null = null;

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

const ensureTransportCallDiagnostics = () => {
  if (transportCallsPatched) return;

  const batchFramerProto = BatchFramer.prototype as BatchFramer & {
    writevBatch?: (buffers: Buffer[], slotIndices?: number[]) => Promise<void>;
    writeBuffer?: (buffer: Buffer) => Promise<void>;
  };

  if (typeof batchFramerProto.writevBatch === "function") {
    const originalWritevBatch = batchFramerProto.writevBatch;
    batchFramerProto.writevBatch = async function (
      this: BatchFramer,
      buffers: Buffer[],
      slotIndices?: number[],
    ): Promise<void> {
      if (activeTransportCollector) {
        activeTransportCollector.batchWritevCalls += 1;
        activeTransportCollector.batchWritevBuffers += buffers.length;
        activeTransportCollector.batchWritevBytes += buffers.reduce(
          (sum, buffer) => sum + buffer.length,
          0,
        );
      }
      return originalWritevBatch.call(this, buffers, slotIndices);
    };
  }

  if (typeof batchFramerProto.writeBuffer === "function") {
    const originalWriteBuffer = batchFramerProto.writeBuffer;
    batchFramerProto.writeBuffer = async function (
      this: BatchFramer,
      buffer: Buffer,
    ): Promise<void> {
      if (activeTransportCollector) {
        activeTransportCollector.writeBufferCalls += 1;
        activeTransportCollector.writeBufferBytes += buffer.length;
      }
      return originalWriteBuffer.call(this, buffer);
    };
  }

  const nativeTcpProto = NativeTcpClient.prototype as NativeTcpClient & {
    sendMany?: (frames: Uint8Array[], fin?: boolean) => number | void;
    send?: (frame: Uint8Array | Buffer | string, fin?: boolean) => number | void;
  };

  if (typeof nativeTcpProto.sendMany === "function") {
    const originalSendMany = nativeTcpProto.sendMany;
    nativeTcpProto.sendMany = function (
      this: NativeTcpClient,
      frames: Uint8Array[],
      fin?: boolean,
    ): number | void {
      if (activeTransportCollector) {
        activeTransportCollector.nativeSendManyCalls += 1;
        activeTransportCollector.nativeSendManyItems += frames.length;
        activeTransportCollector.nativeSendManyBytes += frames.reduce(
          (sum, frame) => sum + frame.byteLength,
          0,
        );
      }
      return originalSendMany.call(this, frames, fin);
    };
  }

  if (typeof nativeTcpProto.send === "function") {
    const originalSend = nativeTcpProto.send;
    nativeTcpProto.send = function (
      this: NativeTcpClient,
      frame: Uint8Array | Buffer | string,
      fin?: boolean,
    ): number | void {
      if (activeTransportCollector) {
        activeTransportCollector.nativeSendCalls += 1;
      }
      return originalSend.call(this, frame, fin);
    };
  }

  transportCallsPatched = true;
};

const microsToMillis = (value: number): number => value / 1000;
const nanosToMillis = (value: number): number => value / 1_000_000;

const startDiagnostics = (
  serverInstance: Pick<EventEmitter, "on" | "off">,
): DiagnosticsScope => {
  if (ENABLE_DIAGNOSTICS) {
    ensureBatchFramerDiagnostics();
    ensureTransportCallDiagnostics();
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
  const transportCalls: TransportCallStats = {
    batchWritevCalls: 0,
    batchWritevBuffers: 0,
    batchWritevBytes: 0,
    writeBufferCalls: 0,
    writeBufferBytes: 0,
    nativeSendManyCalls: 0,
    nativeSendManyItems: 0,
    nativeSendManyBytes: 0,
    nativeSendCalls: 0,
  };

  const previousCollector = activeBatchCollector;
  const previousTransportCollector = activeTransportCollector;
  activeBatchCollector = batchStats;
  activeTransportCollector = transportCalls;

  return {
    stop: (extras?: DiagnosticsExtras) => {
      serverInstance.off("backpressure", onBackpressure as never);
      serverInstance.off("drain", onDrain as never);
      activeBatchCollector = previousCollector;
      activeTransportCollector = previousTransportCollector;
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
        transportCalls,
        flow: extras?.flowDiagnostics,
        clientFlow: extras?.clientFlowDiagnostics,
        clientBatch: extras?.clientBatchStats,
        clientQueue: extras?.clientQueueStats,
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

const summarizeMemory = (usage: NodeJS.MemoryUsage) => ({
  rss: usage.rss,
  heapTotal: usage.heapTotal,
  heapUsed: usage.heapUsed,
  external: usage.external,
  arrayBuffers: usage.arrayBuffers ?? 0,
});

const BENCH_ENV_KEYS = [
  "NODE_OPTIONS",
  "QWORMHOLE_BENCH_DIVERSITY",
  "QWORMHOLE_BENCH_DIAGNOSTICS",
  "QWORMHOLE_BENCH_MESSAGES",
  "QWORMHOLE_BENCH_CLIENTS",
  "QWORMHOLE_BENCH_YIELD_EVERY",
  "QWORMHOLE_BENCH_HWM",
  "QWORMHOLE_BENCH_FLOW_FAST",
  "QWORMHOLE_BENCH_COHERENCE",
  "QWORMHOLE_BENCH_COHERENCE_MODE",
  "QWORMHOLE_FORCE_RATE_BYTES",
  "QWORMHOLE_FORCE_SLICE",
  "QWORMHOLE_ADAPTIVE_SLICES",
  "QWORMHOLE_TS_FRAMER_MAX_BYTES",
  "QWORMHOLE_TS_FRAMER_MAX_BUFFERS",
  "QWORMHOLE_TS_FAST_MAX_BYTES",
  "QWORMHOLE_TS_FAST_MAX_BUFFERS",
  "QWORMHOLE_TS_FLUSH_INTERVAL_MS",
  "QW_WRITEV_FLUSH_MS",
  "QW_WRITEV_BATCH_SIZE",
];

const pickBenchEnv = () => {
  const out: Record<string, string> = {};
  for (const key of BENCH_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
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

const waitForSocketDrain = async (socket: net.Socket): Promise<void> => {
  await once(socket, "drain");
};

const waitForWsBufferBelow = async (
  socket: WebSocket,
  thresholdBytes: number,
): Promise<void> => {
  while (
    socket.readyState === WebSocket.OPEN &&
    socket.bufferedAmount > thresholdBytes
  ) {
    await sleep(1);
  }
};

const buildIncompleteScenarioResult = (
  base: Omit<ScenarioResult, "skipped" | "reason">,
  reason: string,
): ScenarioResult => ({
  ...base,
  skipped: true,
  reason,
});

const buildConcurrencySummary = () => ({
  clients: BENCH_CLIENTS,
  messagesPerClient: MESSAGES_PER_CLIENT,
  totalMessages: TOTAL_MESSAGES,
});

const isBaselineMode = (mode: Mode): boolean =>
  mode === "net" || mode === "ws" || mode === "uwebsockets";

const runBaselineScenario = async (
  mode: Mode,
  framing: FramingMode,
): Promise<ScenarioResult> => {
  if (mode === "net") return runNetBaselineScenario(framing);
  if (mode === "ws") return runWsBaselineScenario();
  if (mode === "uwebsockets") return runUwsBaselineScenario();
  throw new Error(`Unsupported baseline mode: ${mode}`);
};

const pickMedianResult = (results: ScenarioResult[]): ScenarioResult => {
  if (results.length === 1) return results[0];
  const viable = results.filter(
    result => !result.skipped && result.durationMs > 0 && result.messagesReceived > 0,
  );
  const source = viable.length > 0 ? viable : results;
  const sorted = [...source].sort((a, b) => a.durationMs - b.durationMs);
  return sorted[Math.floor(sorted.length / 2)] ?? results[0];
};

const sendNetPayloadAt = async (
  index: number,
  socket: net.Socket,
): Promise<void> => {
  const payload = encodeLengthPrefixed(toBytes(getBenchPayload(index)));
  if (!socket.write(payload)) {
    await waitForSocketDrain(socket);
  }
};

const sendWsPayloadAt = async (
  index: number,
  socket: WebSocket,
): Promise<void> => {
  socket.send(toBytes(getBenchPayload(index)));
  if (socket.bufferedAmount > MACRO_BATCH_TARGET_BYTES) {
    await waitForWsBufferBelow(socket, MACRO_BATCH_TARGET_BYTES / 2);
  }
};

async function runNetBaselineScenario(
  framing: FramingMode,
): Promise<ScenarioResult> {
  const concurrency = buildConcurrencySummary();
  if (framing !== "none") {
    return {
      id: "net-server+net",
      serverMode: "net",
      clientMode: "net",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "none",
      skipped: true,
      reason: "raw net baseline requires framing=none",
    };
  }

  let messagesReceived = 0;
  let bytesReceived = 0;

  const server = net.createServer(socket => {
    socket.setNoDelay(true);
    const framer = new LengthPrefixedFramer({
      maxFrameLength: DEFAULT_MAX_FRAME_LENGTH,
    });
    framer.on("message", frame => {
      socket.write(encodeLengthPrefixed(frame));
    });
    socket.on("data", chunk => framer.push(chunk));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port =
    address && typeof address === "object" && "port" in address
      ? address.port
      : 0;
  if (!port) {
    server.close();
    return {
      id: "net-server+net",
      serverMode: "net",
      clientMode: "net",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "length-prefixed",
      skipped: true,
      reason: "raw net server failed to bind",
    };
  }

  const clients = await Promise.all(
    Array.from({ length: BENCH_CLIENTS }, async () => {
      const client = net.createConnection({ host: "127.0.0.1", port });
      await once(client, "connect");
      client.setNoDelay(true);
      const clientFramer = new LengthPrefixedFramer({
        maxFrameLength: DEFAULT_MAX_FRAME_LENGTH,
      });
      clientFramer.on("message", frame => {
        bytesReceived += frame.length;
        messagesReceived += 1;
      });
      client.on("data", chunk => clientFramer.push(chunk));
      return client;
    }),
  );

  if (WARMUP_MESSAGES > 0) {
    for (let i = 0; i < WARMUP_MESSAGES; i++) {
      if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
        await sleep(0);
      }
      await sendNetPayloadAt(i, clients[i % clients.length]);
    }
    await waitForCompletion(
      () => messagesReceived >= WARMUP_MESSAGES,
      TIMEOUT_MS,
    );
    messagesReceived = 0;
    bytesReceived = 0;
  }

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
      await sleep(0);
    }
    await sendNetPayloadAt(
      i + WARMUP_MESSAGES,
      clients[i % clients.length],
    );
  }

  const completed = await waitForCompletion(
    () => messagesReceived >= TOTAL_MESSAGES,
    TIMEOUT_MS,
  );
  const duration = performance.now() - start;

  for (const client of clients) {
    client.destroy();
  }
  server.close();

  const seconds = duration / 1000;
  const result: ScenarioResult = {
    id: "net-server+net",
    serverMode: "net",
    clientMode: "net",
    concurrency,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: "length-prefixed",
    msgsPerSec: seconds > 0 ? messagesReceived / seconds : undefined,
    mbPerSec:
      seconds > 0 ? bytesReceived / seconds / (1024 * 1024) : undefined,
  };
  return completed
    ? result
    : buildIncompleteScenarioResult(
        result,
        `timed out after ${TIMEOUT_MS}ms (${messagesReceived}/${TOTAL_MESSAGES} messages)`,
      );
}

async function runWsBaselineScenario(): Promise<ScenarioResult> {
  const concurrency = buildConcurrencySummary();
  let messagesReceived = 0;
  let bytesReceived = 0;

  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("connection", socket => {
    socket.on("message", data => {
      socket.send(data, { binary: true });
    });
  });

  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  if (!port) {
    await new Promise(resolve => server.close(resolve));
    return {
      id: "ws-server+ws",
      serverMode: "ws",
      clientMode: "ws",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "none",
      skipped: true,
      reason: "ws server failed to bind",
    };
  }

  const clients = await Promise.all(
    Array.from({ length: BENCH_CLIENTS }, async () => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.binaryType = "nodebuffer";
      client.on("message", data => {
        const size = Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : Buffer.byteLength(String(data));
        bytesReceived += size;
        messagesReceived += 1;
      });
      await once(client, "open");
      return client;
    }),
  );

  if (WARMUP_MESSAGES > 0) {
    for (let i = 0; i < WARMUP_MESSAGES; i++) {
      if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
        await sleep(0);
      }
      await sendWsPayloadAt(i, clients[i % clients.length]);
    }
    await waitForCompletion(
      () => messagesReceived >= WARMUP_MESSAGES,
      TIMEOUT_MS,
    );
    messagesReceived = 0;
    bytesReceived = 0;
  }

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
      await sleep(0);
    }
    await sendWsPayloadAt(
      i + WARMUP_MESSAGES,
      clients[i % clients.length],
    );
  }

  const completed = await waitForCompletion(
    () => messagesReceived >= TOTAL_MESSAGES,
    TIMEOUT_MS,
  );
  const duration = performance.now() - start;

  for (const client of clients) {
    client.close();
  }
  await new Promise(resolve => server.close(resolve));

  const seconds = duration / 1000;
  const result: ScenarioResult = {
    id: "ws-server+ws",
    serverMode: "ws",
    clientMode: "ws",
    concurrency,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: "none",
    msgsPerSec: seconds > 0 ? messagesReceived / seconds : undefined,
    mbPerSec:
      seconds > 0 ? bytesReceived / seconds / (1024 * 1024) : undefined,
  };
  return completed
    ? result
    : buildIncompleteScenarioResult(
        result,
        `timed out after ${TIMEOUT_MS}ms (${messagesReceived}/${TOTAL_MESSAGES} messages)`,
      );
}

async function runUwsBaselineScenario(): Promise<ScenarioResult> {
  const concurrency = buildConcurrencySummary();
  const uws = await loadUwsModule();
  if (!uws) {
    return {
      id: "uwebsockets-server+ws",
      serverMode: "uwebsockets",
      clientMode: "ws",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "none",
      skipped: true,
      reason: "uWebSockets.js unavailable",
    };
  }

  let messagesReceived = 0;
  let bytesReceived = 0;
  let listenSocket: unknown = null;

  const port = await new Promise<number>((resolve, reject) => {
    uws
      .App()
      .ws("/*", {
        maxBackpressure: 64 * 1024 * 1024,
        closeOnBackpressureLimit: false,
        idleTimeout: 0,
        message: (socket: any, message: ArrayBuffer, isBinary: boolean) => {
          socket.send(message, isBinary, false);
        },
      })
      .listen("127.0.0.1", 0, (token: unknown) => {
        if (!token) {
          reject(new Error("uWebSockets.js failed to bind"));
          return;
        }
        listenSocket = token;
        resolve(uws.us_socket_local_port(token));
      });
  }).catch(() => 0);

  if (!port) {
    return {
      id: "uwebsockets-server+ws",
      serverMode: "uwebsockets",
      clientMode: "ws",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: "none",
      skipped: true,
      reason: "uWebSockets.js server failed to bind",
    };
  }

  const clients = await Promise.all(
    Array.from({ length: BENCH_CLIENTS }, async () => {
      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.binaryType = "nodebuffer";
      client.on("message", data => {
        const size = Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : Buffer.byteLength(String(data));
        bytesReceived += size;
        messagesReceived += 1;
      });
      await once(client, "open");
      return client;
    }),
  );

  if (WARMUP_MESSAGES > 0) {
    for (let i = 0; i < WARMUP_MESSAGES; i++) {
      if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
        await sleep(0);
      }
      await sendWsPayloadAt(i, clients[i % clients.length]);
    }
    await waitForCompletion(
      () => messagesReceived >= WARMUP_MESSAGES,
      TIMEOUT_MS,
    );
    messagesReceived = 0;
    bytesReceived = 0;
  }

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
      await sleep(0);
    }
    await sendWsPayloadAt(
      i + WARMUP_MESSAGES,
      clients[i % clients.length],
    );
  }

  const completed = await waitForCompletion(
    () => messagesReceived >= TOTAL_MESSAGES,
    TIMEOUT_MS,
  );
  const duration = performance.now() - start;

  for (const client of clients) {
    client.close();
  }
  if (listenSocket && typeof uws.us_listen_socket_close === "function") {
    uws.us_listen_socket_close(listenSocket);
  }

  const seconds = duration / 1000;
  const result: ScenarioResult = {
    id: "uwebsockets-server+ws",
    serverMode: "uwebsockets",
    clientMode: "ws",
    concurrency,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: "none",
    msgsPerSec: seconds > 0 ? messagesReceived / seconds : undefined,
    mbPerSec:
      seconds > 0 ? bytesReceived / seconds / (1024 * 1024) : undefined,
  };
  return completed
    ? result
    : buildIncompleteScenarioResult(
        result,
        `timed out after ${TIMEOUT_MS}ms (${messagesReceived}/${TOTAL_MESSAGES} messages)`,
      );
}

const resolveExecArgv = (): string[] => {
  if (process.execArgv.some(arg => arg.includes("tsx"))) {
    return process.execArgv;
  }
  return [...process.execArgv, "--loader", "tsx"];
};

const attachBenchClientErrorHandler = (client: QWormholeClient<Buffer>) => {
  client.on("error", err => {
    const code = (err as { code?: string }).code;
    if (code === "ECONNRESET") return;
    if (BENCH_TRACE) {
      // eslint-disable-next-line no-console
      console.warn("[bench] client error", err);
    }
  });
};

const snapshotClientDiagnostics = async (
  client: QWormholeClient<Buffer>,
): Promise<{
  flow?: FlowControllerDiagnostics;
  batch?: BatchFramerStats;
  queue?: PriorityQueueStats;
}> => {
  const internal = client as unknown as {
    flowController?: FlowController;
    outboundFramer?: BatchFramer;
    queue?: { snapshot?: (options?: { reset?: boolean }) => PriorityQueueStats };
  };
  if (!internal.flowController || !internal.outboundFramer) {
    return {};
  }
  const [flow, batch] = await Promise.all([
    withTimeout(
      internal.flowController.snapshot?.(internal.outboundFramer),
      250,
      "flow snapshot timed out",
    ),
    withTimeout(
      internal.outboundFramer.snapshot?.(),
      250,
      "batch snapshot timed out",
    ),
  ]);
  return {
    flow: flow ?? undefined,
    batch: batch ?? undefined,
    queue: internal.queue?.snapshot?.() ?? undefined,
  };
};

const withTimeout = async <T>(
  promise: Promise<T> | T | undefined,
  timeoutMs: number,
  _label: string,
): Promise<T | undefined> => {
  if (!promise) return undefined;
  return Promise.race([
    Promise.resolve(promise),
    sleep(timeoutMs).then(() => undefined),
  ]);
};

const forkBenchChild = () =>
  fork(path.resolve(__dirname, "bench.ts"), [], {
    env: { ...process.env, QWORMHOLE_BENCH_CHILD: "1" },
    execArgv: resolveExecArgv(),
    cwd: path.resolve(__dirname, ".."),
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

async function childMain(): Promise<void> {
  if (!process.send) {
    await mainBench();
    return;
  }

  let active = false;
  let serverMode: Mode = "ts";
  let messagesReceived = 0;
  let bytesReceived = 0;
  let totalMessages = 0;
  let diagnosticsScope: DiagnosticsScope | null = null;
  let flowDiagnostics: DiagnosticsExtras["flowDiagnostics"];
  let clientFlowDiagnostics: FlowControllerDiagnostics | undefined;
  let clientBatchStats: BatchFramerStats | undefined;
  let clientQueueStats: PriorityQueueStats | undefined;
  let clientSnapshotResolve: (() => void) | null = null;
  const clientSnapshotWaiter = new Promise<void>(resolve => {
    clientSnapshotResolve = resolve;
  });
  let benchConfig: BenchConfigSummary | undefined;
  let heapStart: NodeJS.MemoryUsage | undefined;
  let heapEnd: NodeJS.MemoryUsage | undefined;
  let heapPeakUsed = 0;
  let heapPeakRss = 0;
  let trustSnapshotResolve: (() => void) | null = null;
  const trustSnapshotWaiter = new Promise<void>(resolve => {
    trustSnapshotResolve = resolve;
  });
  let serverInstance:
    | ReturnType<typeof createQWormholeServer>["server"]
    | null = null;
  let onMessage: ((payload: { data: Buffer }) => void) | null = null;
  let finished = false;
  let doneSent = false;

  const reportDone = async () => {
    if (doneSent) return;
    doneSent = true;
    try {
      if (serverInstance && onMessage) {
        serverInstance.off("message", onMessage as never);
      }
      await Promise.race([trustSnapshotWaiter, sleep(50)]);
      const diagnostics = diagnosticsScope?.stop({ flowDiagnostics });
      process.send?.({
        type: "done",
        messagesReceived,
        bytesReceived,
        serverMode,
        diagnostics,
      } satisfies BenchChildDone);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.send?.({
        type: "error",
        message,
        stack: err instanceof Error ? err.stack : undefined,
      } satisfies BenchChildError);
    }
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    try {
      await reportDone();
      if (serverInstance) {
        await serverInstance.close();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.send?.({
        type: "error",
        message,
        stack: err instanceof Error ? err.stack : undefined,
      } satisfies BenchChildError);
    } finally {
      shutdownFlowControllerMonitors();
      process.exit(0);
    }
  };

  process.on("message", async (msg: BenchChildMessage) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "stop") {
      await finish();
      return;
    }
    if (msg.type !== "init" || active) return;
    active = true;
    totalMessages = msg.totalMessages;

    try {
      if (isBaselineMode(msg.scenario.clientMode)) {
        const result = await runBaselineScenario(msg.scenario.clientMode);
        process.send?.({
          type: "done",
          messagesReceived: result.messagesReceived,
          bytesReceived: result.bytesReceived,
          serverMode: result.serverMode,
          result,
        } satisfies BenchChildDone);
        shutdownFlowControllerMonitors();
        process.exit(0);
      }

      type BenchServerOptions = QWormholeServerOptions<Buffer> & {
        preferNative?: boolean;
        preferredNativeBackend?: NativeBackend;
      };
      const serverResult = createQWormholeServer({
        host: "127.0.0.1",
        port: 0,
        framing: msg.framing,
        serializer: benchSerializer,
        deserializer: (data: Buffer) => data as Buffer,
        preferNative: msg.scenario.preferNativeServer,
        preferredNativeBackend: msg.scenario.serverBackend,
        disableFlowController: BENCH_DISABLE_FLOW,
        flowFastPath: BENCH_FLOW_FAST,
        coherence: msg.benchCoherence
          ? { enabled: true, mode: BENCH_COHERENCE_MODE }
          : undefined,
        onTrustSnapshot: snapshot => {
          flowDiagnostics = snapshot.flowDiagnostics;
          trustSnapshotResolve?.();
        },
      } as BenchServerOptions);

      if (msg.scenario.preferNativeServer && serverResult.mode === "ts") {
        await serverResult.server.close();
        process.send?.({
          type: "skip",
          reason: "Native backend unavailable",
          serverMode: serverResult.mode as Mode,
        } satisfies BenchChildSkip);
        return;
      }

      serverMode = serverResult.mode as Mode;
      serverInstance = serverResult.server;
      if (msg.enableDiagnostics) {
        if (!gcObserverActive) {
          gcObserver.observe({ entryTypes: ["gc"], buffered: true });
          gcObserverActive = true;
        }
        ensureBatchFramerDiagnostics();
      }
      diagnosticsScope = msg.enableDiagnostics
        ? startDiagnostics(serverInstance)
        : null;
      const address = await serverInstance.listen();
      const port = address.port;

      process.send?.({
        type: "ready",
        port,
        serverMode,
      } satisfies BenchChildReady);

      onMessage = ({ data }: { data: Buffer }) => {
        const buffer = Buffer.isBuffer(data) ? data : toBytes(data);
        messagesReceived += 1;
        bytesReceived += buffer.length;
        if (messagesReceived >= totalMessages) {
          void reportDone();
        }
      };
      serverInstance.on("message", onMessage as never);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.send?.({
        type: "error",
        message,
        stack: err instanceof Error ? err.stack : undefined,
      } satisfies BenchChildError);
      shutdownFlowControllerMonitors();
      process.exit(1);
    }
  });
}

async function waitForChildDone(
  donePromise: Promise<BenchChildDone>,
  timeoutMs: number,
  child: ReturnType<typeof fork>,
): Promise<BenchChildDone> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<BenchChildDone>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("bench timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([donePromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function waitForChildExit(
  child: ReturnType<typeof fork>,
  timeoutMs: number,
): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  await new Promise<void>(resolve => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    child.once("close", () => {
      clearTimeout(timer);
      done();
    });
  });
}

async function runScenarioForked({
  id,
  preferNativeServer,
  clientMode,
  serverBackend,
}: Scenario): Promise<ScenarioResult> {
  const scenarioFraming = framingForClientMode(clientMode);
  if (isBaselineMode(clientMode)) {
    const child = forkBenchChild();
    let doneResolve: ((msg: BenchChildDone) => void) | null = null;
    let doneReject: ((err: Error) => void) | null = null;
    const donePromise = new Promise<BenchChildDone>((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    const onChildMessage = (msg: BenchChildMessage) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "done") {
        doneResolve?.(msg);
      } else if (msg.type === "error") {
        const err = new Error(msg.message);
        (err as Error & { stack?: string }).stack = msg.stack;
        doneReject?.(err);
      }
    };
    child.on("message", onChildMessage);

    child.send?.({
      type: "init",
      scenario: { id, preferNativeServer, clientMode, serverBackend },
      framing: scenarioFraming,
      totalMessages: TOTAL_MESSAGES,
      enableDiagnostics: false,
      benchCoherence: false,
    } satisfies BenchChildInit);

    try {
      const done = await waitForChildDone(donePromise, TIMEOUT_MS * 2, child);
      child.send?.({ type: "stop" });
      await waitForChildExit(child, 1000);
      return (
        done.result ?? {
          id,
          serverMode: clientMode,
          clientMode,
          durationMs: 0,
          messagesReceived: done.messagesReceived,
          bytesReceived: done.bytesReceived,
          framing: scenarioFraming,
          skipped: true,
          reason: "baseline child returned no result",
        }
      );
    } catch (err) {
      child.kill();
      return {
        id,
        serverMode: clientMode,
        clientMode,
        durationMs: 0,
        messagesReceived: 0,
        bytesReceived: 0,
        framing: scenarioFraming,
        skipped: true,
        reason: err instanceof Error ? err.message : "baseline child error",
      };
    }
  }

  if (!clientModeAvailable(clientMode)) {
    return {
      id,
      clientMode,
      serverMode: preferNativeServer ? "native-lws" : "ts",
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
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
      framing: scenarioFraming,
      skipped: true,
      reason: serverBackend
        ? `Native server backend ${serverBackend} unavailable`
        : "Native server backend unavailable",
    };
  }

  if (BENCH_TRACE) {
    console.log(`[bench] start ${id} (forked)`);
  }

  const child = forkBenchChild();
  let serverMode: Mode = preferNativeServer ? "native-lws" : "ts";

  let readyResolve: ((msg: BenchChildReady | BenchChildSkip) => void) | null =
    null;
  let readyReject: ((err: Error) => void) | null = null;
  const readyPromise = new Promise<BenchChildReady | BenchChildSkip>(
    (resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    },
  );

  let doneResolve: ((msg: BenchChildDone) => void) | null = null;
  let doneReject: ((err: Error) => void) | null = null;
  const donePromise = new Promise<BenchChildDone>((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });

  const onChildMessage = (msg: BenchChildMessage) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready" || msg.type === "skip") {
      readyResolve?.(msg);
    } else if (msg.type === "done") {
      doneResolve?.(msg);
    } else if (msg.type === "error") {
      const err = new Error(msg.message);
      (err as Error & { stack?: string }).stack = msg.stack;
      readyReject?.(err);
      doneReject?.(err);
    }
  };
  child.on("message", onChildMessage);

  child.send?.({
    type: "init",
    scenario: { id, preferNativeServer, clientMode, serverBackend },
    framing: scenarioFraming,
    totalMessages: TOTAL_MESSAGES,
    enableDiagnostics: ENABLE_DIAGNOSTICS,
    benchCoherence: BENCH_COHERENCE,
  } satisfies BenchChildInit);

  let ready: BenchChildReady | BenchChildSkip;
  try {
    ready = await readyPromise;
  } catch (err) {
    child.kill();
    return {
      id,
      serverMode,
      clientMode,
      concurrency: buildConcurrencySummary(),
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
      skipped: true,
      reason: err instanceof Error ? err.message : "child error",
    };
  }

  if (ready.type === "skip") {
    child.kill();
    await waitForChildExit(child, 1000);
    return {
      id,
      serverMode: ready.serverMode,
      clientMode,
      concurrency: buildConcurrencySummary(),
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
      skipped: true,
      reason: ready.reason,
    };
  }

  serverMode = ready.serverMode;

  let clientFlowDiagnostics: FlowControllerDiagnostics | undefined;
  let clientBatchStats: BatchFramerStats | undefined;
  let clientQueueStats: PriorityQueueStats | undefined;
  let clientSnapshotResolve: (() => void) | null = null;
  const clientSnapshotWaiter = new Promise<void>(resolve => {
    clientSnapshotResolve = resolve;
  });

  const concurrency = buildConcurrencySummary();
  let tsClients: QWormholeClient<Buffer>[] = [];
  let nativeClients: NativeTcpClient[] = [];
  if (clientMode === "ts") {
    tsClients = await Promise.all(
      Array.from({ length: BENCH_CLIENTS }, async (_unused, index) => {
        const client = new QWormholeClient<Buffer>({
          host: "127.0.0.1",
          port: (ready as BenchChildReady).port,
          framing: scenarioFraming,
          serializer: benchSerializer,
          deserializer: (data: Buffer): Buffer => data,
          entropyMetrics: {
            negIndex: BENCH_NEG_INDEX,
            coherence: deriveBenchCoherence(),
            entropyVelocity: "low",
          },
          onTrustSnapshot: (snapshot: TrustSnapshot) => {
            if (index !== 0) return;
            clientFlowDiagnostics = snapshot.flowDiagnostics;
            clientBatchStats = snapshot.batchStats;
            clientQueueStats = snapshot.queueStats;
            clientSnapshotResolve?.();
          },
          peerIsNative: serverMode !== "ts",
          socketHighWaterMark: BENCH_SOCKET_HWM,
          coherence: BENCH_COHERENCE
            ? { enabled: true, mode: BENCH_COHERENCE_MODE }
            : undefined,
        } as QWormholeClientOptions);
        attachBenchClientErrorHandler(client);
        await client.connect();
        return client;
      }),
    );
    const internal = tsClients[0] as any;
    benchConfig = buildBenchConfigSummary(
      internal.flowController ?? null,
      scenarioFraming,
    );
    if (benchConfig) {
      logBenchConfig(`${id} (forked)`, benchConfig);
    }
  } else {
    const backend = clientMode === "native-lws" ? "lws" : "libsocket";
    nativeClients = Array.from(
      { length: BENCH_CLIENTS },
      () => new NativeTcpClient(backend),
    );
    if (nativeClients.some(client => client.backend !== backend)) {
      for (const client of nativeClients) {
        client.close();
      }
      child.send?.({ type: "stop" });
      child.kill();
      return {
        id,
        serverMode,
        clientMode,
        concurrency,
        preferredServerBackend: serverBackend,
        durationMs: 0,
        messagesReceived: 0,
        bytesReceived: 0,
        framing: scenarioFraming,
        skipped: true,
        reason: `Native client backend ${backend} unavailable`,
      };
    }
    for (const client of nativeClients) {
      client.connect("127.0.0.1", ready.port);
    }
  }

  let duration = 0;
  let diagnostics: ScenarioDiagnostics | undefined;
  const sendBlockDurations: number[] = [];
  const blockSampleSize =
    Number(process.env.QWORMHOLE_BENCH_BLOCK_SIZE ?? "1000") || 1000;
  let blockCount = 0;
  let blockStart = ENABLE_DIAGNOSTICS ? performance.now() : 0;
  const nativeBatches = Array.from({ length: BENCH_CLIENTS }, () => [] as Buffer[]);

  let done: BenchChildDone | null = null;
  try {
    const start = performance.now();
    if (ENABLE_DIAGNOSTICS) {
      heapStart = process.memoryUsage();
      heapPeakUsed = heapStart.heapUsed;
      heapPeakRss = heapStart.rss;
    }
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
        nativeClients.forEach((client, index) =>
          flushNativeBenchBatch(client, nativeBatches[index]),
        );
        await sleep(0);
      }
      const clientIndex = i % BENCH_CLIENTS;
      if (tsClients.length > 0) {
        tsClients[clientIndex].send(getBenchPayload(i));
      } else if (nativeClients.length > 0) {
        const nativeBatch = nativeBatches[clientIndex];
        nativeBatch.push(getNativePayload(i, scenarioFraming));
        if (nativeBatch.length >= NATIVE_SEND_BATCH_SIZE) {
          flushNativeBenchBatch(nativeClients[clientIndex], nativeBatch);
        }
      }
      if (ENABLE_DIAGNOSTICS) {
        blockCount += 1;
        if (blockCount >= blockSampleSize || i === TOTAL_MESSAGES - 1) {
          const now = performance.now();
          sendBlockDurations.push(now - blockStart);
          blockStart = now;
          blockCount = 0;
          const usage = process.memoryUsage();
          heapPeakUsed = Math.max(heapPeakUsed, usage.heapUsed);
          heapPeakRss = Math.max(heapPeakRss, usage.rss);
        }
      }
    }
    nativeClients.forEach((client, index) =>
      flushNativeBenchBatch(client, nativeBatches[index]),
    );
    done = await waitForChildDone(donePromise, TIMEOUT_MS, child);
    duration = performance.now() - start;
  } catch (err) {
    child.send?.({ type: "stop" });
    done = null;
  } finally {
    if (ENABLE_DIAGNOSTICS) {
      heapEnd = process.memoryUsage();
    }
    if (tsClients.length > 0) {
      const clientSnapshot = await snapshotClientDiagnostics(tsClients[0]);
      clientFlowDiagnostics = clientSnapshot.flow ?? clientFlowDiagnostics;
      clientBatchStats = clientSnapshot.batch ?? clientBatchStats;
      clientQueueStats = clientSnapshot.queue ?? clientQueueStats;
      for (const client of tsClients) {
        client.disconnect();
      }
      await Promise.race([clientSnapshotWaiter, sleep(50)]);
    }
    if (nativeClients.length > 0) {
      for (const client of nativeClients) {
        client.close();
      }
    }
    child.send?.({ type: "stop" });
    await waitForChildExit(child, 1000);
  }

  const blockStats =
    ENABLE_DIAGNOSTICS && sendBlockDurations.length
      ? summarizeBlockDurations(sendBlockDurations, blockSampleSize)
      : undefined;

  if (done?.diagnostics) {
    diagnostics = {
      ...done.diagnostics,
      sendBlocks: blockStats ?? done.diagnostics.sendBlocks,
      clientFlow: clientFlowDiagnostics,
      clientBatch: clientBatchStats,
      clientQueue: clientQueueStats,
    };
    if (heapStart && heapEnd) {
      diagnostics = {
        ...diagnostics,
        heap: {
          start: summarizeMemory(heapStart),
          end: summarizeMemory(heapEnd),
          peakHeapUsed: heapPeakUsed,
          peakRss: heapPeakRss,
        },
      };
    }
  } else {
    diagnostics = undefined;
  }

  const messagesReceived = done?.messagesReceived ?? 0;
  const bytesReceived = done?.bytesReceived ?? 0;
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
    serverMode,
    clientMode,
    concurrency,
    preferredServerBackend: serverBackend,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: BENCH_FRAMING,
    framing: scenarioFraming,
    msgsPerSec,
    mbPerSec,
    benchConfig,
    diagnostics,
    skipped: done ? undefined : true,
    reason: done ? undefined : "timeout",
  };
}

async function runScenarioRepeated(scenario: Scenario): Promise<ScenarioResult> {
  const runs: ScenarioResult[] = [];
  for (let i = 0; i < BENCH_REPEAT; i++) {
    if (BENCH_CSV_PATH !== "") {
      console.log(
        `[bench] starting ${scenario.id}${BENCH_REPEAT > 1 ? ` (run ${i + 1}/${BENCH_REPEAT})` : ""}`,
      );
    }
    const result = isBaselineMode(scenario.clientMode)
      ? await runBaselineScenario(
          scenario.clientMode,
          framingForClientMode(scenario.clientMode),
        )
      : BENCH_FORK && !BENCH_CHILD
        ? await runScenarioForked(scenario)
        : await runScenario(scenario);
    runs.push(result);
    if (BENCH_CSV_PATH !== "") {
      console.log(
        `[bench] finished ${scenario.id}: ${result.skipped ? result.reason ?? "skipped" : `${formatNumber(result.msgsPerSec, 0)} msg/s`}`,
      );
    }
    if (result.skipped) {
      break;
    }
  }
  return pickMedianResult(runs);
}

async function runScenario({
  id,
  preferNativeServer,
  clientMode,
  serverBackend,
}: Scenario): Promise<ScenarioResult> {
  const concurrency = buildConcurrencySummary();
  const scenarioFraming = framingForClientMode(clientMode);
  // --- Coherence Trace Setup ---
  const coherenceTrace: CoherenceDecisionSample[] = [];
  let lastCoherenceMode: string | undefined = undefined;
  const traceInterval = 10; // ms, minimum interval between samples
  let lastTraceTime = 0;
  if (BENCH_FORK && !BENCH_CHILD) {
    return runScenarioForked({
      id,
      preferNativeServer,
      clientMode,
      serverBackend,
    });
  }
  if (BENCH_TRACE) {
    console.log(`[bench] start ${id}`);
  }
  let flowDiagnostics: DiagnosticsExtras["flowDiagnostics"];
  let clientFlowDiagnostics: FlowControllerDiagnostics | undefined;
  let clientBatchStats: BatchFramerStats | undefined;
  let clientQueueStats: PriorityQueueStats | undefined;
  let clientSnapshotResolve: (() => void) | null = null;
  const clientSnapshotWaiter = new Promise<void>(resolve => {
    clientSnapshotResolve = resolve;
  });
  let trustSnapshotResolve: (() => void) | null = null;
  const trustSnapshotWaiter = new Promise<void>(resolve => {
    trustSnapshotResolve = resolve;
  });
  let benchConfig: BenchConfigSummary | undefined;
  let heapStart: NodeJS.MemoryUsage | undefined;
  let heapEnd: NodeJS.MemoryUsage | undefined;
  let heapPeakUsed = 0;
  let heapPeakRss = 0;
  if (!clientModeAvailable(clientMode)) {
    return {
      id,
      clientMode,
      serverMode: preferNativeServer ? "native-lws" : "ts",
      concurrency,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
      skipped: true,
      reason: "Native client backend unavailable",
    };
  }

  if (!serverModeAvailable(preferNativeServer, serverBackend)) {
    return {
      id,
      clientMode,
      serverMode: "ts",
      concurrency,
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
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
    framing: scenarioFraming,
    serializer: benchSerializer,
    deserializer: (data: Buffer) => data as Buffer,
    preferNative: preferNativeServer,
    preferredNativeBackend: serverBackend,
    disableFlowController: BENCH_DISABLE_FLOW,
    flowFastPath: BENCH_FLOW_FAST,
    coherence: BENCH_COHERENCE
      ? { enabled: true, mode: BENCH_COHERENCE_MODE }
      : undefined,
    onTrustSnapshot: snapshot => {
      flowDiagnostics = snapshot.flowDiagnostics;
      trustSnapshotResolve?.();
    },
  } as BenchServerOptions);
  if (preferNativeServer && serverResult.mode === "ts") {
    await serverResult.server.close();
      return {
        id,
        serverMode: serverResult.mode as Mode,
        clientMode,
        concurrency,
        preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: scenarioFraming,
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

  let tsClients: QWormholeClient<Buffer>[] = [];
  let nativeClients: NativeTcpClient[] = [];
  let coherenceController: CoherenceController | null = null;
  let flowController: FlowController | null = null;
  let batchFramer: BatchFramer | null = null;
  if (clientMode === "ts") {
    tsClients = await Promise.all(
      Array.from({ length: BENCH_CLIENTS }, async (_unused, index) => {
        const client = new QWormholeClient<Buffer>({
          host: "127.0.0.1",
          port,
          framing: scenarioFraming,
          serializer: benchSerializer,
          deserializer: (data: Buffer) => data,
          entropyMetrics: {
            negIndex: BENCH_NEG_INDEX,
            coherence: deriveBenchCoherence(),
            entropyVelocity: "low",
          },
          onTrustSnapshot: (snapshot: TrustSnapshot) => {
            if (index !== 0) return;
            clientFlowDiagnostics = snapshot.flowDiagnostics;
            clientBatchStats = snapshot.batchStats;
            clientSnapshotResolve?.();
          },
          peerIsNative: serverMode !== "ts",
          socketHighWaterMark: BENCH_SOCKET_HWM,
          disableFlowController: BENCH_DISABLE_FLOW,
          flowFastPath: BENCH_FLOW_FAST,
          coherence: BENCH_COHERENCE
            ? { enabled: true, mode: BENCH_COHERENCE_MODE }
            : undefined,
        });
        attachBenchClientErrorHandler(client);
        await client.connect();
        return client;
      }),
    );
    // Extract FlowController and BatchFramer for coherence loop
    const internal = tsClients[0] as any;
    flowController = internal.flowController ?? null;
    batchFramer = internal.outboundFramer ?? null;
    if (BENCH_COHERENCE && flowController && batchFramer) {
      coherenceController = new CoherenceController();
    }
    benchConfig = buildBenchConfigSummary(flowController, scenarioFraming);
    if (benchConfig) {
      logBenchConfig(id, benchConfig);
    }
  } else {
    const backend = clientMode === "native-lws" ? "lws" : "libsocket";
    nativeClients = Array.from(
      { length: BENCH_CLIENTS },
      () => new NativeTcpClient(backend),
    );
    if (nativeClients.some(client => client.backend !== backend)) {
      for (const client of nativeClients) {
        client.close();
      }
      await serverInstance.close();
      return {
        id,
        serverMode: serverMode as Mode,
        clientMode,
        concurrency,
        preferredServerBackend: serverBackend,
        durationMs: 0,
        messagesReceived: 0,
        bytesReceived: 0,
        framing: BENCH_FRAMING,
        skipped: true,
        reason: `Native client backend ${backend} unavailable`,
      };
    }
    for (const client of nativeClients) {
      client.connect("127.0.0.1", port);
    }
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
  const nativeBatches = Array.from({ length: BENCH_CLIENTS }, () => [] as Buffer[]);

  try {
    if (WARMUP_MESSAGES > 0) {
      for (let i = 0; i < WARMUP_MESSAGES; i++) {
        if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
          nativeClients.forEach((client, index) =>
            flushNativeBenchBatch(client, nativeBatches[index]),
          );
          await sleep(0);
        }
        const clientIndex = i % BENCH_CLIENTS;
        if (tsClients.length > 0) {
          sendBenchPayloadAt(i, tsClients[clientIndex], null, scenarioFraming);
        } else if (nativeClients.length > 0) {
          const nativeBatch = nativeBatches[clientIndex];
          nativeBatch.push(getNativePayload(i, scenarioFraming));
          if (nativeBatch.length >= NATIVE_SEND_BATCH_SIZE) {
            flushNativeBenchBatch(nativeClients[clientIndex], nativeBatch);
          }
        }
      }
      nativeClients.forEach((client, index) =>
        flushNativeBenchBatch(client, nativeBatches[index]),
      );
      const warmupCompleted = await waitForCompletion(
        () => messagesReceived >= WARMUP_MESSAGES,
        TIMEOUT_MS,
      );
      if (!warmupCompleted) {
        return {
          id,
          serverMode: serverMode as Mode,
          clientMode,
          preferredServerBackend: serverBackend,
          durationMs: 0,
          messagesReceived,
          bytesReceived,
          framing: scenarioFraming,
          benchConfig,
          skipped: true,
          reason: `warmup timed out after ${TIMEOUT_MS}ms (${messagesReceived}/${WARMUP_MESSAGES} messages)`,
        };
      }
      messagesReceived = 0;
      bytesReceived = 0;
      sendBlockDurations.length = 0;
      blockCount = 0;
      blockStart = ENABLE_DIAGNOSTICS ? performance.now() : 0;
    }
    const start = performance.now();
    const benchStart = performance.now();
    if (ENABLE_DIAGNOSTICS) {
      heapStart = process.memoryUsage();
      heapPeakUsed = heapStart.heapUsed;
      heapPeakRss = heapStart.rss;
    }
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
        nativeClients.forEach((client, index) =>
          flushNativeBenchBatch(client, nativeBatches[index]),
        );
        await sleep(0);
      }
      const clientIndex = i % BENCH_CLIENTS;
      if (tsClients.length > 0) {
        sendBenchPayloadAt(
          i + WARMUP_MESSAGES,
          tsClients[clientIndex],
          null,
          scenarioFraming,
        );
      } else if (nativeClients.length > 0) {
        const nativeBatch = nativeBatches[clientIndex];
        nativeBatch.push(getNativePayload(i + WARMUP_MESSAGES, scenarioFraming));
        if (nativeBatch.length >= NATIVE_SEND_BATCH_SIZE) {
          flushNativeBenchBatch(nativeClients[clientIndex], nativeBatch);
        }
      }
      if (ENABLE_DIAGNOSTICS) {
        blockCount += 1;
        if (blockCount >= blockSampleSize || i === TOTAL_MESSAGES - 1) {
          const now = performance.now();
          sendBlockDurations.push(now - blockStart);
          blockStart = now;
          blockCount = 0;
          if (ENABLE_DIAGNOSTICS) {
            const usage = process.memoryUsage();
            heapPeakUsed = Math.max(heapPeakUsed, usage.heapUsed);
            heapPeakRss = Math.max(heapPeakRss, usage.rss);
          }
          // After each block flush, update coherence control and sample trace
          if (coherenceController && flowController && batchFramer) {
            const diag = flowController.getDiagnostics();
            const framerStats = batchFramer.getStats();
            const tMs = now - benchStart;
            const metrics = {
              bytesSent: diag.totalBytes,
              bytesAcked: 0,
              messagesSent: framerStats.totalFrames,
              messagesAcked: 0,
              batchSize: flowController.currentSliceSize * 1024,
              batchMessages: flowController.currentSliceSize,
              batchIntervalMs: diag.adaptive?.flushIntervalAvgMs ?? 0,
              bufferedBytes: framerStats.pendingBytes,
              bufferedMessages: framerStats.pendingFrames,
              socketBackpressure: (diag.backpressureEvents ?? 0) > 0,
              eventLoopJitterMs: diag.adaptive?.flushIntervalAvgMs ?? 0,
              gcPauseMs: diag.adaptive?.gcPauseMaxMs ?? 0,
              marginEstimate: diag.policy.coherence,
              reserveEstimate: 1.0,
              rttMs: undefined,
              timestamp: Date.now(),
            };
            const decision = coherenceController.decide(metrics);
            flowController.setExternalSliceSize(
              Math.floor(decision.batchTarget / 1024),
            );
            batchFramer.setBatchTiming(
              Math.floor(decision.batchTarget / 1024),
              decision.flushIntervalMs,
            );
            batchFramer.setFlushCaps(undefined, decision.maxBufferedBytes);
            // Always log a sample after every block flush
            coherenceTrace.push({
              tMs,
              mode: decision.mode,
              margin: metrics.marginEstimate,
              velocity: metrics.batchIntervalMs,
              reserve: metrics.reserveEstimate,
              batchTarget: decision.batchTarget,
              flushIntervalMs: decision.flushIntervalMs,
              maxBufferedBytes: decision.maxBufferedBytes,
              reason: decision.reason,
            });
            lastCoherenceMode = decision.mode;
            lastTraceTime = tMs;
          }
        }
      }
    }
    nativeClients.forEach((client, index) =>
      flushNativeBenchBatch(client, nativeBatches[index]),
    );
    const completed = await waitForCompletion(
      () => messagesReceived >= TOTAL_MESSAGES,
      TIMEOUT_MS,
    );
    if (!completed) {
      return {
        id,
        serverMode: serverMode as Mode,
        clientMode,
        preferredServerBackend: serverBackend,
        durationMs: performance.now() - start,
        messagesReceived,
        bytesReceived,
        framing: scenarioFraming,
        msgsPerSec:
          messagesReceived > 0
            ? messagesReceived / ((performance.now() - start) / 1000)
            : undefined,
        mbPerSec:
          bytesReceived > 0
            ? bytesReceived / ((performance.now() - start) / 1000) / (1024 * 1024)
            : undefined,
        benchConfig,
        skipped: true,
        reason: `timed out after ${TIMEOUT_MS}ms (${messagesReceived}/${TOTAL_MESSAGES} messages)`,
      };
    }
    duration = performance.now() - start;
  } finally {
    if (ENABLE_DIAGNOSTICS) {
      heapEnd = process.memoryUsage();
    }
    serverInstance.off("message", onMessage as never);
    if (tsClients.length > 0) {
      const clientSnapshot = await snapshotClientDiagnostics(tsClients[0]);
      clientFlowDiagnostics = clientSnapshot.flow ?? clientFlowDiagnostics;
      clientBatchStats = clientSnapshot.batch ?? clientBatchStats;
      clientQueueStats = clientSnapshot.queue ?? clientQueueStats;
      for (const client of tsClients) {
        client.disconnect();
      }
    }
    if (nativeClients.length > 0) {
      for (const client of nativeClients) {
        client.close();
      }
    }
    await serverInstance.close();
    await Promise.race([trustSnapshotWaiter, sleep(50)]);
    if (tsClients.length > 0) {
      await Promise.race([clientSnapshotWaiter, sleep(50)]);
    }
    const blockStats =
      ENABLE_DIAGNOSTICS && sendBlockDurations.length
        ? summarizeBlockDurations(sendBlockDurations, blockSampleSize)
        : undefined;
    diagnostics = diagnosticsScope?.stop({
      sendBlocks: blockStats,
      flowDiagnostics,
      clientFlowDiagnostics,
      clientBatchStats,
      clientQueueStats,
    });
    if (diagnostics && heapStart && heapEnd) {
      diagnostics = {
        ...diagnostics,
        heap: {
          start: summarizeMemory(heapStart),
          end: summarizeMemory(heapEnd),
          peakHeapUsed: heapPeakUsed,
          peakRss: heapPeakRss,
        },
      };
    }
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
    concurrency,
    preferredServerBackend: serverBackend,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: BENCH_FRAMING,
    framing: scenarioFraming,
    msgsPerSec,
    mbPerSec,
    benchConfig,
    diagnostics: diagnostics ? { ...diagnostics, coherenceTrace } : undefined,
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
  let lastKcpMetrics: { rttMs?: number; lossRate?: number; pending?: number } =
    {};

  server.on("session", ({ mux }) => {
    mux.on(
      "stream",
      (stream: {
        on: (event: "data", listener: (data: Uint8Array) => void) => void;
        write: (data: Uint8Array) => void;
      }) => {
        stream.on("data", (data: Uint8Array) => {
          messagesReceived += 1;
          bytesReceived += data?.byteLength ?? 0;
          stream.write(data ?? new Uint8Array());
        });
      },
    );
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
    if (BENCH_YIELD_EVERY && i > 0 && i % BENCH_YIELD_EVERY === 0) {
      await sleep(0);
    }
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
  } catch (e) {
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
  const QUIC_TIMEOUT_MS =
    Number(process.env.QW_QUIC_TIMEOUT_MS ?? "20000") || 20000;
  const QUIC_YIELD_EVERY = Number(process.env.QW_QUIC_YIELD_EVERY ?? "50") || 0;
  const QUIC_PROTOCOL_VERSION = process.env.QWORMHOLE_PROTOCOL_VERSION;
  const QUIC_HANDSHAKE_TAGS = parseHandshakeTags(
    process.env.QWORMHOLE_HANDSHAKE_TAGS,
  );
  const QUIC_MAX_FRAME_LENGTH =
    envNumber("QW_QUIC_MAX_FRAME_LENGTH") ?? 16 * 1024 * 1024;
  const QUIC_STREAMS = Math.max(
    1,
    Number(process.env.QW_QUIC_STREAMS ?? "8") || 8,
  );
  const QUIC_BATCH_SIZE = Number(process.env.QW_QUIC_BATCH_SIZE ?? "32") || 32;
  const QUIC_BATCH_BYTES =
    Number(process.env.QW_QUIC_BATCH_BYTES ?? String(96 * 1024)) || 96 * 1024;
  const QUIC_STATS = ENABLE_DIAGNOSTICS || process.env.QW_QUIC_STATS === "1";
  const quicUseFraming = BENCH_FRAMING !== "none";
  const quicStreamFraming = quicUseFraming ? "length-prefixed" : "none";

  if (!quicAvailable()) {
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

  const certPath = path.resolve(
    __dirname,
    "..",
    "libwebsockets",
    "build",
    "libwebsockets-test-server.pem",
  );
  const keyPath = path.resolve(
    __dirname,
    "..",
    "libwebsockets",
    "build",
    "libwebsockets-test-server.key.pem",
  );
  const alpn = ["h3"];

  const server = new QuicServer({
    host: "127.0.0.1",
    port: 0,
    certPath,
    keyPath,
    alpn,
    pollIntervalMs: 1,
    protocolVersion: QUIC_PROTOCOL_VERSION,
    useMux: true,
    maxFrameLength: QUIC_MAX_FRAME_LENGTH,
    streamFraming: quicStreamFraming,
  });
  server.on("error", err => {
    // eslint-disable-next-line no-console
    console.error("quic server error", err);
  });
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
    interface QuicConnection {
      onData: (cb: (data: Uint8Array) => void) => void;
      send: (data: Uint8Array) => void;
      on: (event: string, listener: (...args: any[]) => void) => void;
    }

    (conn as QuicConnection).onData((data: Uint8Array) => {
      // echo
      (conn as QuicConnection).send(data);
    });
    conn.on("rawStream", (stream: any) => {
      stream.onData((data: Uint8Array) => {
        stream.send(data);
      });
    });
  });

  const client = new QuicTransport({
    host: "127.0.0.1",
    port,
    alpn,
    sni: "localhost",
    verifyPeer: false,
    pollIntervalMs: 1,
    protocolVersion: QUIC_PROTOCOL_VERSION,
    handshakeTags: QUIC_HANDSHAKE_TAGS,
    useMux: true,
    maxFrameLength: QUIC_MAX_FRAME_LENGTH,
    streamFraming: quicStreamFraming,
  });
  client.on("error", err => {
    // eslint-disable-next-line no-console
    console.error("quic client error", err);
  });
  const connected = new Promise<void>(resolve => {
    server.once("connection", () => resolve());
  });
  await client.connect();
  await connected;

  const framedPayload =
    quicUseFraming && quicStreamFraming === "none"
      ? encodeLengthPrefixed(PAYLOAD)
      : PAYLOAD;
  const useFlowFraming = quicStreamFraming === "length-prefixed";
  const streams: Array<{
    id: number;
    send: (data: Uint8Array) => number | void;
    sendMany?: (frames: Uint8Array[], fin?: boolean) => number | void;
    onData: (cb: (data: Uint8Array) => void) => void;
  }> = [];
  const pendingByStream = new Map<number, Uint8Array[]>();
  let streamIndex = 0;
  let jsToNativeCalls = 0;
  let jsToNativeBytes = 0;
  let pendingMaxBytes = 0;

  const consumeWritten = (
    frames: Uint8Array[],
    bytesWritten: number,
  ): Uint8Array[] => {
    if (bytesWritten <= 0) return frames;
    let remainingBytes = bytesWritten;
    let idx = 0;
    while (idx < frames.length && remainingBytes >= frames[idx].length) {
      remainingBytes -= frames[idx].length;
      idx += 1;
    }
    if (idx >= frames.length) return [];
    const remainder: Uint8Array[] = [];
    if (remainingBytes > 0) {
      remainder.push(frames[idx].subarray(remainingBytes));
      idx += 1;
    }
    for (; idx < frames.length; idx++) remainder.push(frames[idx]);
    return remainder;
  };

  const sendFramesOnStream = (
    stream: (typeof streams)[number],
    frames: Uint8Array[],
  ) => {
    const pending = pendingByStream.get(stream.id);
    const toSend =
      pending && pending.length > 0 ? pending.concat(frames) : frames;
    if (toSend.length === 0) return;
    let written = 0;
    if (typeof stream.sendMany === "function") {
      const result = stream.sendMany(toSend);
      if (typeof result === "number") {
        written = result;
      } else {
        written = toSend.reduce((sum, frame) => sum + frame.length, 0);
      }
      jsToNativeCalls += 1;
    } else {
      for (const frame of toSend) {
        const res = stream.send(frame);
        const sent = typeof res === "number" ? res : frame.length;
        written += sent;
        if (typeof res === "number" && sent < frame.length) {
          break;
        }
      }
      jsToNativeCalls += toSend.length;
    }
    jsToNativeBytes += toSend.reduce((sum, frame) => sum + frame.length, 0);
    const remaining = consumeWritten(toSend, written);
    if (remaining.length > 0) {
      pendingByStream.set(stream.id, remaining);
      const pendingBytes = remaining.reduce(
        (sum, frame) => sum + frame.length,
        0,
      );
      pendingMaxBytes = Math.max(pendingMaxBytes, pendingBytes);
    } else {
      pendingByStream.delete(stream.id);
    }
  };

  for (let i = 0; i < QUIC_STREAMS; i++) {
    const stream = await client.openStream({ framing: quicStreamFraming });
    streams.push(stream);
    if (quicUseFraming && quicStreamFraming === "none") {
      const framer = new LengthPrefixedFramer({
        maxFrameLength: QUIC_MAX_FRAME_LENGTH,
      });
      framer.on("message", frame => {
        bytesReceived += frame.length;
        messagesReceived += 1;
      });
      stream.onData(chunk => framer.push(Buffer.from(chunk)));
    } else {
      stream.onData(chunk => {
        bytesReceived += chunk.length;
        if (quicUseFraming) {
          messagesReceived += 1;
        } else {
          messagesReceived = Math.floor(bytesReceived / PAYLOAD.length);
        }
      });
    }
  }

  let statsTimer: NodeJS.Timeout | null = null;
  if (QUIC_STATS) {
    statsTimer = setInterval(() => {
      // eslint-disable-next-line no-console
      console.log("quic stats", client.getStats?.());
    }, 1000);
    statsTimer.unref?.();
  }

  const start = performance.now();
  try {
    if (useFlowFraming) {
      for (let i = 0; i < TOTAL_MESSAGES; i++) {
        const stream = streams[streamIndex++ % streams.length];
        stream.send(PAYLOAD);
        jsToNativeCalls += 1;
        jsToNativeBytes += PAYLOAD.length;
        if (QUIC_YIELD_EVERY > 0 && i % QUIC_YIELD_EVERY === 0) {
          await sleep(0);
        }
      }
    } else {
      let batch: Uint8Array[] = [];
      let batchBytes = 0;
      for (let i = 0; i < TOTAL_MESSAGES; i++) {
        batch.push(framedPayload);
        batchBytes += framedPayload.length;
        if (batch.length >= QUIC_BATCH_SIZE || batchBytes >= QUIC_BATCH_BYTES) {
          const stream = streams[streamIndex++ % streams.length];
          sendFramesOnStream(stream, batch);
          batch = [];
          batchBytes = 0;
        }
        // Yield periodically so recv/acks progress and prevent JS from hogging loop.
        if (QUIC_YIELD_EVERY > 0 && i % QUIC_YIELD_EVERY === 0) {
          await sleep(0);
        }
      }
      if (batch.length > 0) {
        const stream = streams[streamIndex++ % streams.length];
        sendFramesOnStream(stream, batch);
      }

      const drainStart = performance.now();
      while (
        pendingByStream.size > 0 &&
        performance.now() - drainStart < QUIC_TIMEOUT_MS
      ) {
        for (const stream of streams) {
          if (pendingByStream.has(stream.id)) {
            sendFramesOnStream(stream, []);
          }
        }
        await sleep(0);
      }
    }

    await waitForCompletion(
      () => messagesReceived >= TOTAL_MESSAGES,
      QUIC_TIMEOUT_MS,
    );
  } finally {
    // eslint-disable-next-line no-console
    if (statsTimer) {
      clearInterval(statsTimer);
    }
    // eslint-disable-next-line no-console
    console.log("quic stats", client.getStats?.());
    await client.close();
    server.close();
  }

  const duration = performance.now() - start;
  const seconds = duration / 1000;
  const quicCallsPerSec =
    seconds > 0 && jsToNativeCalls > 0 ? jsToNativeCalls / seconds : 0;
  const quicAvgPayloadBytes =
    jsToNativeCalls > 0 ? jsToNativeBytes / jsToNativeCalls : 0;
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
    diagnostics: ENABLE_DIAGNOSTICS
      ? {
          gc: { count: 0, durationMs: 0, byKind: {} },
          eventLoop: { utilization: 0, activeMs: 0, idleMs: 0 },
          eventLoopDelay: {
            minMs: 0,
            maxMs: 0,
            meanMs: 0,
            stdMs: 0,
            p50Ms: 0,
            p99Ms: 0,
          },
          backpressure: { events: 0, drainEvents: 0, maxQueuedBytes: 0 },
          batching: {
            flushes: 0,
            avgBuffersPerFlush: 0,
            avgBytesPerFlush: 0,
            maxBuffers: 0,
            maxBytes: 0,
          },
          sendBlocks: undefined,
          quic: {
            jsToNativeCalls,
            callsPerSec: quicCallsPerSec,
            avgPayloadBytes: quicAvgPayloadBytes,
            pendingMaxBytes,
          },
        }
      : undefined,
  };
}

const buildJsonlEntry = (
  res: ScenarioResult,
  env: Record<string, string>,
): Record<string, unknown> => {
  const diag = res.diagnostics;
  const flow = diag?.clientFlow ?? diag?.flow;
  const payload =
    res.benchConfig?.payload ??
    summarizePayloadBytes(
      res.framing === "none" ? "none" : "length-prefixed",
    );
  return {
    timestamp: new Date().toISOString(),
    scenario: res.id,
    serverMode: res.serverMode,
    clientMode: res.clientMode,
    concurrency: res.concurrency,
    framing: res.framing,
    messagesReceived: res.messagesReceived,
    bytesReceived: res.bytesReceived,
    durationMs: res.durationMs,
    msgsPerSec: res.msgsPerSec,
    mbPerSec: res.mbPerSec,
    skipped: res.skipped ?? false,
    reason: res.reason,
    flags: {
      diversity: BENCH_DIVERSE_PAYLOADS,
      diagnostics: ENABLE_DIAGNOSTICS,
      coherence: BENCH_COHERENCE,
      coherenceMode: BENCH_COHERENCE_MODE,
      flowFastPath: BENCH_FLOW_FAST,
    },
    limiter: {
      effectiveRateBytesPerSec:
        res.benchConfig?.effectiveRateBytesPerSec ??
        flow?.effectiveRateBytesPerSec,
      flushCapBytes: res.benchConfig?.flushCapBytes,
      flushCapBuffers: res.benchConfig?.flushCapBuffers,
      flushIntervalMs: res.benchConfig?.flushIntervalMs,
      adaptiveMode: res.benchConfig?.adaptiveMode,
      macroBatchTargetBytes: res.benchConfig?.macroBatchTargetBytes,
      yieldEvery: res.benchConfig?.yieldEvery,
    },
    governance: flow?.governance,
    payload: {
      count: payload.count,
      minBytes: payload.minBytes,
      maxBytes: payload.maxBytes,
      avgBytes: payload.avgBytes,
      types: payload.types,
      framing: payload.framing,
      frameHeaderBytes: payload.frameHeaderBytes,
    },
    latency: {
      loopDelayP50Ms: diag?.eventLoopDelay?.p50Ms,
      loopDelayP99Ms: diag?.eventLoopDelay?.p99Ms,
      sendBlockAvgMs: diag?.sendBlocks?.avgMs,
      sendBlockMinMs: diag?.sendBlocks?.minMs,
      sendBlockMaxMs: diag?.sendBlocks?.maxMs,
    },
    heap: diag?.heap,
    clientBatch: diag?.clientBatch,
    clientQueue: diag?.clientQueue,
    eventLoop: diag?.eventLoop,
    eventLoopDelay: diag?.eventLoopDelay,
    backpressure: diag?.backpressure,
    batching: diag?.batching,
    env,
  };
};

const renderMarkdownTable = (
  headers: string[],
  rows: Array<Array<string | number>>,
): string => {
  const headerRow = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(row => `| ${row.map(value => String(value)).join(" | ")} |`);
  return [headerRow, divider, ...body].join("\n");
};

const formatNumber = (
  value: number | undefined,
  digits = 2,
  fallback = "-",
): string => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return value.toFixed(digits);
};

const writeBenchReport = async (results: ScenarioResult[]): Promise<void> => {
  if (!BENCH_REPORT_PATH) return;

  const env = pickBenchEnv();
  const isCompareRun = results.some(
    res => isBaselineMode(res.clientMode) || isBaselineMode(res.serverMode),
  );
  const summaryRows = results.map(res => [
    res.id,
    res.serverMode,
    res.clientMode,
    res.concurrency?.clients ?? BENCH_CLIENTS,
    res.durationMs ? formatNumber(res.durationMs) : "-",
    res.messagesReceived,
    res.bytesReceived,
    formatNumber(res.msgsPerSec, 0),
    formatNumber(res.mbPerSec),
    res.framing,
    res.skipped ? "skipped" : "ok",
  ]);

  const diagnosticsRows = results
    .filter(res => !res.skipped && res.diagnostics)
    .map(res => {
      const diag = res.diagnostics!;
      const transportCoherence =
        diag.clientFlow?.transportCoherence ?? diag.flow?.transportCoherence;
      return [
        res.id,
        diag.gc.count,
        formatNumber(diag.gc.durationMs),
        formatNumber(diag.eventLoop.utilization * 100),
        diag.backpressure.events,
        diag.backpressure.drainEvents,
        diag.backpressure.maxQueuedBytes,
        diag.batching.flushes,
        formatNumber(diag.batching.avgBuffersPerFlush),
        formatNumber(diag.batching.avgBytesPerFlush / 1024),
        diag.batching.maxBuffers,
        formatNumber(diag.batching.maxBytes / 1024),
        diag.transportCalls?.batchWritevCalls ?? 0,
        diag.transportCalls?.nativeSendManyCalls ?? 0,
        diag.clientFlow?.governance?.mode ?? diag.flow?.governance?.mode ?? "-",
        formatTransportMetric(transportCoherence?.transportSNI),
        formatTransportMetric(transportCoherence?.transportSPI),
        formatTransportMetric(transportCoherence?.transportMetastability),
      ];
    });

  const transportRows = results
    .filter(res => !res.skipped && res.diagnostics)
    .map(res => {
      const diag = res.diagnostics!;
      const transportCoherence =
        diag.clientFlow?.transportCoherence ?? diag.flow?.transportCoherence;
      return {
        id: res.id,
        msgsPerSec: res.msgsPerSec ?? 0,
        transportSNI: transportCoherence?.transportSNI,
        transportSPI: transportCoherence?.transportSPI,
        transportMetastability: transportCoherence?.transportMetastability,
      };
    })
    .filter(row => Number.isFinite(row.transportSPI));

  const transportSummaryRows = [...transportRows]
    .sort((a, b) => (b.transportSPI ?? 0) - (a.transportSPI ?? 0))
    .map((row, index) => [
      index + 1,
      row.id,
      formatNumber(row.msgsPerSec, 0),
      formatNumber(row.transportSNI, 3),
      formatNumber(row.transportSPI, 3),
      formatNumber(row.transportMetastability, 3),
      classifyTransportHealth(
        row.transportSPI ?? undefined,
        row.transportMetastability ?? undefined,
      ),
    ]);

  const bestTransport = transportRows[0]
    ? [...transportRows].sort(
        (a, b) => (b.transportSPI ?? 0) - (a.transportSPI ?? 0),
      )[0]
    : undefined;
  const fastestTransport = transportRows[0]
    ? [...transportRows].sort((a, b) => (b.msgsPerSec ?? 0) - (a.msgsPerSec ?? 0))[0]
    : undefined;
  const transportFindings = [
    BENCH_TRANSPORT_COHERENCE
      ? `Transport coherence sampling: enabled`
      : `Transport coherence sampling: disabled in this raw lane. Run \`${isCompareRun ? "bench:compare:structure" : "bench:core:structure"}\` for tSNI / tSPI / tMeta.`,
    bestTransport
      ? `Best transport persistence: \`${bestTransport.id}\` (tSPI ${formatNumber(bestTransport.transportSPI, 3)}, tMeta ${formatNumber(bestTransport.transportMetastability, 3)})`
      : `Best transport persistence: unavailable`,
    !BENCH_TRANSPORT_COHERENCE
      ? `Fastest transport-coherence row: unavailable (sampling disabled in this lane)`
      : fastestTransport
        ? `Fastest transport-coherence row: \`${fastestTransport.id}\` (${formatNumber(fastestTransport.msgsPerSec, 0)} msg/s)`
        : `Fastest transport-coherence row: unavailable`,
    bestTransport && fastestTransport && bestTransport.id !== fastestTransport.id
      ? `Transport winner differs from throughput winner. Prefer tSPI when selecting a default path.`
      : bestTransport && fastestTransport
        ? `Throughput leader and transport-stability leader are aligned in this run.`
        : `Transport/throughput alignment unavailable in this lane.`,
  ];

  const report = [
    `# QWormhole Bench Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Environment`,
    ``,
    "```json",
    JSON.stringify(env, null, 2),
    "```",
    ``,
    `## Summary`,
    ``,
    renderMarkdownTable(
      [
        "Scenario",
        "Server",
        "Client",
        "Clients",
        "Duration (ms)",
        "Messages",
        "Bytes",
        "Msg/s",
        "MB/s",
        "Framing",
        "Status",
      ],
      summaryRows,
    ),
    ``,
    `## Diagnostics`,
    ``,
    renderMarkdownTable(
      [
        "Scenario",
        "GC",
        "GC ms",
        "ELU%",
        "BP",
        "Drain",
        "MaxQueued",
        "Flushes",
        "AvgBuf",
        "AvgKB",
        "MaxBuf",
        "MaxKB",
        "WV",
        "SM",
        "Gov",
        "tSNI",
        "tSPI",
        "tMeta",
      ],
      diagnosticsRows,
    ),
    ``,
    `## Transport Coherence`,
    ``,
    ...transportFindings.map(line => `- ${line}`),
    ``,
    ...(transportSummaryRows.length > 0
      ? [
          renderMarkdownTable(
            [
              "Rank",
              "Scenario",
              "Msg/s",
              "tSNI",
              "tSPI",
              "tMeta",
              "Health",
            ],
            transportSummaryRows,
          ),
        ]
      : [
          BENCH_TRANSPORT_COHERENCE
            ? "_No transport coherence rows were produced in this run._"
            : "_Transport coherence metrics are intentionally off in the raw lane._",
        ]),
    ``,
    `## Raw JSON`,
    ``,
    "```json",
    JSON.stringify(results, null, 2),
    "```",
    ``,
  ].join("\n");

  await fs.mkdir(path.dirname(BENCH_REPORT_PATH), { recursive: true });
  await fs.writeFile(BENCH_REPORT_PATH, report, "utf8");
  if (BENCH_CSV_PATH !== "") {
    console.log(`[bench] report written to ${BENCH_REPORT_PATH}`);
  }
};

const writeJsonlResults = async (results: ScenarioResult[]): Promise<void> => {
  if (!BENCH_JSONL_PATH) return;
  const env = pickBenchEnv();
  const lines = results
    .map(res => JSON.stringify(buildJsonlEntry(res, env)))
    .join("\n")
    .concat("\n");
  await fs.appendFile(BENCH_JSONL_PATH, lines, "utf8");
  if (BENCH_CSV_PATH !== "") {
    // eslint-disable-next-line no-console
    console.log(`[bench] jsonl appended to ${BENCH_JSONL_PATH}`);
  }
};

function classifyTransportHealth(
  transportSPI?: number,
  transportMetastability?: number,
): string {
  if (!Number.isFinite(transportSPI) || !Number.isFinite(transportMetastability)) {
    return "unavailable";
  }
  if ((transportSPI as number) >= 0.7 && (transportMetastability as number) <= 0.35) {
    return "stable";
  }
  if ((transportSPI as number) >= 0.55 && (transportMetastability as number) <= 0.5) {
    return "watch";
  }
  return "unstable";
}

async function mainBench() {
  const modes = parseModeArg();
  const isCompareRun = modes.some(mode => BASELINE_MODES.includes(mode));
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (!modes.includes(scenario.clientMode)) continue;
    const res = await runScenarioRepeated(scenario);
    results.push(res);
  }

  for (const scenario of baselineScenarios) {
    if (!modes.includes(scenario.clientMode)) continue;
    const res = await runScenarioRepeated(scenario);
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

  await writeJsonlResults(results);
  await writeBenchReport(results);

  const csvPath = BENCH_CSV_PATH;
  if (csvPath !== undefined) {
    const header = formatCsvHeader();
    const rows = results.map(formatCsvRow).join("");
    const csv = header + rows;
    if (csvPath) {
      await fs.writeFile(csvPath, csv, "utf8");
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
    "Clients",
    10,
  )}${pad(
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
        `${res.concurrency?.clients ?? BENCH_CLIENTS}`,
        10,
      )}${pad(
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
    )}${pad("MaxKB", 10)}${pad("Gov", 12)}${pad(
      "tSNI",
      8,
    )}${pad("tSPI", 8)}${pad("tMeta", 8)}`;
    console.log("\n" + diagHeader);
    console.log("-".repeat(diagHeader.length));
    for (const res of results) {
      if (res.skipped || !res.diagnostics) continue;
        const diag = res.diagnostics;
        const transportCoherence =
          diag.clientFlow?.transportCoherence ?? diag.flow?.transportCoherence;
        const eluPercent = (diag.eventLoop.utilization * 100).toFixed(2);
        const avgKb = (diag.batching.avgBytesPerFlush / 1024).toFixed(2);
        const maxKb = (diag.batching.maxBytes / 1024).toFixed(2);
        const gcDuration = diag.gc.durationMs.toFixed(2);
        const governanceMode =
          diag.clientFlow?.governance?.mode ?? diag.flow?.governance?.mode ?? "-";
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
          )}${pad(maxKb, 10)}${pad(governanceMode, 12)}${pad(
            formatTransportMetric(transportCoherence?.transportSNI),
            8,
          )}${pad(
            formatTransportMetric(transportCoherence?.transportSPI),
            8,
          )}${pad(
            formatTransportMetric(
              transportCoherence?.transportMetastability,
            ),
            8,
          )}`,
        );
      }
    if (!BENCH_TRANSPORT_COHERENCE) {
      console.log(
        "\n[bench] transport coherence metrics are intentionally disabled in the raw lane; use bench:core:structure for tSNI/tSPI/tMeta.",
      );
    }
    }
}

if (BENCH_CHILD) {
  childMain().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    shutdownFlowControllerMonitors();
    process.exit(1);
  });
} else {
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
}

export type { Scenario, ScenarioResult, ScenarioDiagnostics, BenchResult };

export {
  runScenario,
  runKcpScenario,
  runNetBaselineScenario,
  runWsBaselineScenario,
  runUwsBaselineScenario,
  mainBench,
  runScenario as _runScenario, // for testing
  toBytes as _toBytes, // for testing
  clientModeAvailable as _clientModeAvailable, // for testing
  serverModeAvailable as _serverModeAvailable, // for testing
};
