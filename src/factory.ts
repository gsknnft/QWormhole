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
