import {
  QWormholeClient,
  NativeTcpClient,
  createQWormholeServer,
  isNativeAvailable,
} from "../src/index";
import { isNativeServerAvailable } from "../src/core/native-server";
import { BatchFramer } from "../src/core/batch-framer";
import { KcpServer } from "../src/transports/kcp/kcp-server";
import { KcpSession } from "../src/transports/kcp/kcp-session";
import type { FlowControllerDiagnostics } from "../src/core/flow-controller";
import type { BatchFramerStats } from "../src/core/batch-framer";
import type {
  FramingMode,
  NativeBackend,
  Payload,
  QWormholeServerOptions,
  Serializer,
} from "../src/types/types";

type Mode = "ts" | "native-lws" | "native-libsocket" | "kcp" | "kcp-arq" | "quic";


interface Scenario {
  id: string;
  preferNativeServer: boolean;
  clientMode: Mode;
  serverBackend?: NativeBackend;
}


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
  kcpRttMs?: number;
  kcpLossRate?: number;
  kcpPending?: number;
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

type SendBlockStats = {
  blockSize: number;
  samples: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
};

type ScenarioDiagnostics = {
  gc: GcTotals;
  eventLoop: {
    utilization: number;
    activeMs: number;
    idleMs: number;
  };
  eventLoopDelay?: {
    minMs: number;
    maxMs: number;
    meanMs: number;
    stdMs: number;
    p50Ms: number;
    p99Ms: number;
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
  sendBlocks?: SendBlockStats;
  quic?: {
    jsToNativeCalls: number;
    callsPerSec: number;
    avgPayloadBytes: number;
    pendingMaxBytes: number;
  };
  flow?: FlowControllerDiagnostics;
  clientFlow?: FlowControllerDiagnostics;
  clientBatch?: BatchFramerStats;
};

type DiagnosticsExtras = {
  sendBlocks?: SendBlockStats;
  flowDiagnostics?: FlowControllerDiagnostics;
  clientFlowDiagnostics?: FlowControllerDiagnostics;
  clientBatchStats?: BatchFramerStats;
};

type DiagnosticsScope = {
  stop: (extras?: DiagnosticsExtras) => ScenarioDiagnostics;
};


export {
  Scenario,
  ScenarioResult,
  ScenarioDiagnostics,
  DiagnosticsScope,
  DiagnosticsExtras,
  BatchFlushStats,
  GcTotals,
  SendBlockStats,
};
