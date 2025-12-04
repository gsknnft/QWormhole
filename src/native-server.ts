import bindings from "bindings";
import type net from "node:net";
import path from "node:path";
import { defaultSerializer, bufferDeserializer } from "./codecs";
import { QWormholeError } from "./errors";
import { TypedEventEmitter } from "./typedEmitter";
import type {
  Deserializer,
  NativeBackend,
  Payload,
  QWormholeServerConnection,
  QWormholeServerEvents,
  QWormholeServerOptions,
  Serializer,
} from "src/types/types";

const DEBUG_NATIVE_SERVER = process.env.QWORMHOLE_DEBUG_NATIVE === "1";
const logNativeServer = (msg: string) => {
  if (DEBUG_NATIVE_SERVER) {
    console.log(`[qwormhole][native-server] ${msg}`);
  }
};

type NativeServerHandle = NodeJS.EventEmitter & {
  listen(): Promise<net.AddressInfo>;
  close(): Promise<void>;
  broadcast(payload: Payload): void;
  shutdown?(gracefulMs?: number): Promise<void>;
  getConnection?(id: string): QWormholeServerConnection | undefined;
  getConnectionCount?(): number;
  closeConnection?(id: string): void;
};

type NativeConnectionSnapshot = Pick<
  QWormholeServerConnection,
  "id" | "remoteAddress" | "remotePort" | "handshake"
>;

type NativeMessagePayload = {
  client: NativeConnectionSnapshot;
  data: Buffer;
};

type NativeFlowPayload = {
  client: NativeConnectionSnapshot;
  queuedBytes?: number;
  threshold?: number;
};

type NativeClientClosedPayload = {
  client: NativeConnectionSnapshot;
  hadError: boolean;
};

type InternalServerOptions<TMessage> = {
  serializer: Serializer;
  deserializer: Deserializer<TMessage>;
  verifyHandshake?: QWormholeServerOptions<TMessage>["verifyHandshake"];
};

type NativeConnectionState = {
  managed: QWormholeServerConnection;
  accepted: boolean;
  pending: Buffer[];
};

type NativeServerModule<TMessage> = {
  QWormholeServerWrapper: new (
    options: QWormholeServerOptions<TMessage>,
  ) => NativeServerHandle;
};

type LoadedServerBinding<TMessage> = {
  kind: NativeBackend;
  module: NativeServerModule<TMessage>;
};

const resolveBindings = () =>
  (globalThis as unknown as { bindings?: typeof bindings }).bindings ??
  bindings;

const bindingModuleRoot = path.resolve(__dirname, "..");

type BindingLoader = (
  target: string | { module_root: string; bindings: string },
) => unknown;

const tryLoadBinding = <TMessage>(
  name: string,
): NativeServerModule<TMessage> | null => {
  try {
    logNativeServer(`attempting to load server binding "${name}"`);
    const loader = resolveBindings() as BindingLoader;
    const mod = loader({
      module_root: bindingModuleRoot,
      bindings: name,
    }) as NativeServerModule<TMessage>;
    if (!mod?.QWormholeServerWrapper) {
      logNativeServer(
        `server binding "${name}" missing QWormholeServerWrapper export`,
      );
      return null;
    }
    logNativeServer(`successfully loaded server binding "${name}"`);
    return mod;
  } catch (err) {
    logNativeServer(
      `server binding "${name}" not found: ${(err as Error).message}`,
    );
    return null;
  }
};

const loadNativeServer = <TMessage>(
  preferred?: NativeBackend,
): LoadedServerBinding<TMessage> | null => {
  const order: NativeBackend[] = preferred
    ? [preferred, preferred === "lws" ? "libsocket" : "lws"]
    : ["lws", "libsocket"];

  for (const kind of order) {
    const bindingName = kind === "lws" ? "qwormhole_lws" : "qwormhole";
    logNativeServer(`trying server backend: ${kind} (${bindingName})`);
    const module = tryLoadBinding<TMessage>(bindingName);
    if (module?.QWormholeServerWrapper) {
      logNativeServer(
        `loaded native server backend "${kind}" from ${bindingName}`,
      );
      return { kind, module };
    }
    logNativeServer(`server backend "${kind}" unavailable`);
  }
  logNativeServer("no native server backend loaded; TS transport will be used");
  return null;
};

let nativeServerBinding: LoadedServerBinding<unknown> | null = null;

const ensureNativeServerBinding = (
  preferred?: NativeBackend,
): LoadedServerBinding<unknown> | null => {
  if (preferred || !nativeServerBinding) {
    nativeServerBinding =
      (loadNativeServer<unknown>(
        preferred,
      ) as LoadedServerBinding<unknown> | null) ?? nativeServerBinding;
  }
  return nativeServerBinding;
};

export const getNativeServerBackend = (): NativeBackend | null => {
  ensureNativeServerBinding();
  return nativeServerBinding?.kind ?? null;
};

export const isNativeServerAvailable = (): boolean => {
  ensureNativeServerBinding();
  return Boolean(nativeServerBinding);
};

export class NativeQWormholeServer<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeServerEvents<TMessage>
> {
  private readonly impl: NativeServerHandle;
  private readonly options: InternalServerOptions<TMessage>;
  private readonly connections = new Map<string, NativeConnectionState>();
  public readonly backend: NativeBackend;

  constructor(
    options: QWormholeServerOptions<TMessage>,
    preferred?: NativeBackend,
  ) {
    super();
    this.options = this.buildOptions(options);
    if (preferred) {
      ensureNativeServerBinding(preferred);
    } else {
      ensureNativeServerBinding();
    }

    if (!nativeServerBinding?.module?.QWormholeServerWrapper) {
      logNativeServer("NativeQWormholeServer failed: wrapper unavailable");
      throw new Error(
        "Native qwormhole server binding not available. Run `pnpm run build:native` or disable preferNative.",
      );
    }

    this.backend = nativeServerBinding.kind;
    this.impl = new nativeServerBinding.module.QWormholeServerWrapper(options);
    this.interceptNativeEmits();
  }

  private buildOptions(
    options: QWormholeServerOptions<TMessage>,
  ): InternalServerOptions<TMessage> {
    const deserializer = (options.deserializer ??
      bufferDeserializer) as Deserializer<TMessage>;
    return {
      serializer: options.serializer ?? defaultSerializer,
      deserializer,
      verifyHandshake: options.verifyHandshake,
    };
  }

  private interceptNativeEmits(): void {
    const originalEmit =
      typeof this.impl.emit === "function"
        ? this.impl.emit.bind(this.impl)
        : null;
    this.impl.emit = ((event: string, ...args: unknown[]) => {
      this.routeNativeEvent(event, args);
      if (originalEmit) {
        return originalEmit(event, ...args);
      }
      return true;
    }) as typeof this.impl.emit;
  }

  private routeNativeEvent(event: string, args: unknown[]): void {
    logNativeServer(`native emit ${event}`);
    switch (event) {
      case "listening":
        this.emit("listening", args[0] as net.AddressInfo);
        return;
      case "error":
        this.emit("error", args[0] as Error);
        return;
      case "close":
        this.emit("close", undefined as never);
        return;
      case "connection":
        this.handleNativeConnection(args[0] as NativeConnectionSnapshot);
        return;
      case "message":
        this.handleNativeMessage(args[0] as NativeMessagePayload);
        return;
      case "clientClosed":
        this.handleNativeClientClosed(args[0] as NativeClientClosedPayload);
        return;
      case "backpressure":
        this.forwardFlowEvent("backpressure", args[0] as NativeFlowPayload);
        return;
      case "drain":
        this.forwardFlowEvent("drain", args[0] as NativeFlowPayload);
        return;
      default:
        break;
    }
  }

  private handleNativeConnection(snapshot: NativeConnectionSnapshot): void {
    logNativeServer(`connection event for ${snapshot.id}`);
    const managed = this.createManagedConnection(snapshot);
    const state: NativeConnectionState = {
      managed,
      accepted: !this.options.verifyHandshake,
      pending: [],
    };

    this.connections.set(managed.id, state);
    if (!state.accepted) {
      void this.verifyNativeHandshake(state, snapshot.handshake);
      return;
    }
    this.emit("connection", managed);
  }

  private createManagedConnection(
    snapshot: NativeConnectionSnapshot,
  ): QWormholeServerConnection {
    const close = () => this.closeConnection(snapshot.id);
    const sendNotSupported = async () => {
      throw new Error(
        "Native backend does not support per-connection send yet",
      );
    };

    return {
      id: snapshot.id,
      remoteAddress: snapshot.remoteAddress,
      remotePort: snapshot.remotePort,
      handshake: snapshot.handshake,
      socket: {} as net.Socket,
      send: sendNotSupported,
      end: close,
      destroy: close,
    } as QWormholeServerConnection;
  }

  private handleNativeMessage(payload: NativeMessagePayload): void {
    const state = this.connections.get(payload.client.id);
    if (!state) return;
    const data = Buffer.isBuffer(payload.data)
      ? payload.data
      : Buffer.from(payload.data ?? []);
    logNativeServer(
      `received chunk from ${payload.client.id} (${data.length} bytes)`,
    );
    if (!state.accepted) {
      state.pending.push(data);
      return;
    }
    this.emitMessage(state, data);
  }

  private emitMessage(state: NativeConnectionState, payload: Buffer): void {
    const data = this.options.deserializer(payload);
    this.emit("message", { client: state.managed, data } as never);
  }

  private async verifyNativeHandshake(
    state: NativeConnectionState,
    handshake?: QWormholeServerConnection["handshake"],
  ): Promise<void> {
    const verifier = this.options.verifyHandshake;
    if (!verifier) {
      this.acceptConnection(state);
      return;
    }
    try {
      const result = await verifier(handshake ?? {});
      if (!result) {
        this.rejectConnection(
          state,
          new QWormholeError("E_INVALID_HANDSHAKE", "Handshake rejected"),
        );
        return;
      }
      this.acceptConnection(state);
    } catch (err) {
      this.rejectConnection(
        state,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  private acceptConnection(state: NativeConnectionState): void {
    if (state.accepted) return;
    state.accepted = true;
    this.emit("connection", state.managed);
    if (!state.pending.length) return;
    const queued = [...state.pending];
    state.pending.length = 0;
    queued.forEach(buffer => this.emitMessage(state, buffer));
  }

  private rejectConnection(state: NativeConnectionState, error: Error): void {
    this.emit("error", error);
    this.closeConnection(state.managed.id);
  }

  private closeConnection(id: string): void {
    this.impl.closeConnection?.(id);
  }

  private handleNativeClientClosed(payload: NativeClientClosedPayload): void {
    const id = payload.client?.id;
    const state = id ? this.connections.get(id) : undefined;
    if (state) {
      this.connections.delete(id!);
    }
    const client =
      state?.managed ?? this.createManagedConnection(payload.client);
    this.emit("clientClosed", { client, hadError: payload.hadError } as never);
  }

  private forwardFlowEvent(
    event: "backpressure" | "drain",
    payload: NativeFlowPayload,
  ): void {
    const state = payload.client?.id
      ? this.connections.get(payload.client.id)
      : undefined;
    if (!state) return;
    if (event === "backpressure") {
      this.emit(event, {
        client: state.managed,
        queuedBytes: payload.queuedBytes ?? 0,
        threshold: payload.threshold ?? Number.POSITIVE_INFINITY,
      } as never);
      return;
    }
    this.emit(event, { client: state.managed } as never);
  }

  listen(): Promise<net.AddressInfo> {
    return this.impl.listen();
  }

  close(): Promise<void> {
    return this.impl.close();
  }

  broadcast(payload: Payload): void {
    const serialized = this.options.serializer(payload);
    this.impl.broadcast(serialized);
  }

  shutdown(gracefulMs?: number): Promise<void> {
    if (typeof this.impl.shutdown === "function") {
      return this.impl.shutdown(gracefulMs);
    }
    return this.close();
  }

  getConnection(id: string): QWormholeServerConnection | undefined {
    const state = this.connections.get(id);
    if (state) return state.managed;
    if (typeof this.impl.getConnection === "function") {
      return this.impl.getConnection(id);
    }
    return undefined;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
