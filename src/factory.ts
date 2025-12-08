import { QWormholeClient } from "./client";
import { QWormholeServer } from "./server";
import { getNativeBackend, isNativeAvailable, NativeTcpClient } from "./native";
import {
  getNativeServerBackend,
  isNativeServerAvailable,
  NativeQWormholeServer,
} from "./native-server";
// import { QWormholeError } from "./errors";
import type {
  QWormholeClientOptions,
  QWormholeServerOptions,
  NativeBackend,
  TransportMode,
  FramingMode,
} from "types";
import { BatchFramer } from "./batch-framer";
import { QWormholeContext } from "types/context";

export interface CreateClientOptions<
  TMessage,
> extends QWormholeClientOptions<TMessage> {
  preferNative?: boolean;
  forceTs?: boolean;
}

export interface CreateClientResult<TMessage> {
  client: QWormholeClient<TMessage> | NativeTcpClient;
  mode: TransportMode;
  nativeAvailable: boolean;
  nativeBackend: NativeBackend | null;
}

/**
 * Creates a client, preferring native when available (unless forceTs is set).
 */
export function createQWormholeClient<TMessage = Buffer>(
  options: CreateClientOptions<TMessage>,
): CreateClientResult<TMessage> {
  const backend = getNativeBackend();
  const nativeReady = isNativeAvailable();

  if (!options.forceTs && options.preferNative && nativeReady) {
    const resolvedBackend = backend ?? "lws";
    return {
      client: new NativeTcpClient(resolvedBackend),
      mode: resolvedBackend === "lws" ? "native-lws" : "native-libsocket",
      nativeAvailable: true,
      nativeBackend: resolvedBackend,
    };
  }

  // Always fall back to TS if native is unavailable or forceTs is set
  return {
    client: new QWormholeClient<TMessage>(options),
    mode: "ts",
    nativeAvailable: nativeReady,
    nativeBackend: backend,
  };
}

export interface CreateServerOptions<
  TMessage,
> extends QWormholeServerOptions<TMessage> {
  host: string;
  port: number;
  framing?: FramingMode;
  preferNative?: boolean;
  forceTs?: boolean;
  preferredNativeBackend?: NativeBackend;
}

export interface CreateServerResult<TMessage> {
  server: QWormholeServer<TMessage> | NativeQWormholeServer<TMessage>;
  mode: TransportMode;
  nativeAvailable: boolean;
  nativeBackend: NativeBackend | null;
}

/**
 * Creates a server. Native server support is not available, so this always returns the TS server.
 */
export function createQWormholeServer<TMessage = Buffer>(
  options: CreateServerOptions<TMessage>,
): CreateServerResult<TMessage> {
  const backend = getNativeServerBackend(options.preferredNativeBackend);
  const nativeReady = isNativeServerAvailable(options.preferredNativeBackend);

  if (!options.forceTs && options.preferNative && nativeReady && backend) {
    const resolvedBackend = backend;
    return {
      server: new NativeQWormholeServer<TMessage>(options, resolvedBackend),
      mode: resolvedBackend === "lws" ? "native-lws" : "native-libsocket",
      nativeAvailable: true,
      nativeBackend: resolvedBackend,
    };
  }

  return {
    server: new QWormholeServer<TMessage>(options),
    mode: "ts",
    nativeAvailable: nativeReady,
    nativeBackend: backend,
  };
}

export function createQWormholeContext(): QWormholeContext {
  const instances: Record<string, {
    client?: QWormholeClient;
    server?: QWormholeServer;
    framer?: BatchFramer;
  }> = {};
  const metricsData: Record<string, {
    bytesIn: number;
    bytesOut: number;
    flushes: number;
    backpressure: number;
  }> = {};
  return {
    registerInstance(name, instance) {
      instances[name] = instance;
      metricsData[name] = { bytesIn: 0, bytesOut: 0, flushes: 0, backpressure: 0 };
    }
    ,
    onFlush(name, _info) {
      metricsData[name].flushes += 1;
    },
    onBackpressure(name, _info) {
      metricsData[name].backpressure += 1;
    },
    onFrame(name, info) {
      if (info.direction === "in") {
        metricsData[name].bytesIn += info.bytes;
      } else {
        metricsData[name].bytesOut += info.bytes;
      }
    },
    metrics() {
      const totals = {  bytesIn: 0, bytesOut: 0, backpressureEvents: 0, flushes: 0 };
      for (const name in metricsData) {
        const data = metricsData[name];
        totals.bytesIn += data.bytesIn;
        totals.bytesOut += data.bytesOut;
        totals.backpressureEvents += data.backpressure;
        totals.flushes += data.flushes;
      }
      return { totals, byInstance: metricsData };
    }
  };
}





/* 
const ctx = createQWormholeContext();
ctx.registerInstance("telemetry", { client, framer });
framer.onFlush = info => ctx.onFlush?.("telemetry", info);
framer.onBackpressure = info => ctx.onBackpressure?.("telemetry", info);
// ...in your bus or adapter:
ctx.onFrame?.("telemetry", { direction: "out", bytes: 1024, ts: Date.now() });
console.log(ctx.metrics());
*/