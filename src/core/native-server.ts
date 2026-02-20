import bindings from "bindings";
import type net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { defaultSerializer, bufferDeserializer } from "./codecs";
import { QWormholeError } from "../utils/errors";
import { TypedEventEmitter } from "../utils/typedEmitter";
import {
  computeEntropyMetrics,
  deriveEntropyPolicy,
  type EntropyMetrics,
} from "../handshake/entropy-policy";
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

const parsePreferredBackend = (raw?: string): NativeBackend | undefined => {
  if (raw === "lws" || raw === "libsocket") {
    return raw;
  }
  return undefined;
};

const requireFn = typeof require === "function" ? require : createRequire(__filename);
const envBindingPath = process.env.QWORMHOLE_NATIVE_PATH;
const platformArch = `${process.platform}-${process.arch}`;
const isTestRuntime =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  process.env.VITEST === "1" ||
  !!process.env.VITEST_WORKER_ID;
const allowPrebuiltProbeInTests =
  process.env.QWORMHOLE_ENABLE_TEST_PREBUILDS === "1";

const DEFAULT_NATIVE_SERVER_BACKEND =
  parsePreferredBackend(process.env.QWORMHOLE_NATIVE_SERVER_PREFERRED) ??
  parsePreferredBackend(process.env.QWORMHOLE_NATIVE_PREFERRED) ??
  (process.platform === "linux" ? "libsocket" : undefined);

const nativeDisabled = () => {
  const legacy = process.env.QWORMHOLE_NATIVE;
  if (legacy === "0") return true;
  if (legacy === "1") return false;
  return process.env.QWORMHOLE_DISABLE_NATIVE === "1";
};

type NativeServerHandle = NodeJS.EventEmitter & {
  listen(): Promise<net.AddressInfo>;
  close(): Promise<void>;
  broadcast(payload: Payload): void;
  sendTo?(id: string, payload: Payload): void;
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
  maxBackpressureBytes?: number;
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

/**
 * bindings() resolves native .node relative to module_root/build/Release.
 * From src/ (ts-node) or dist/ (compiled), we need to climb two levels to the
 * package root so build/Release can be found.
 */
const bindingModuleRoot = path.resolve(__dirname, "..", "..");

type BindingLoader = (
  target: string | { module_root: string; bindings: string },
) => unknown;

const tryLoadBindingPath = <TMessage>(
  targetPath: string,
): NativeServerModule<TMessage> | null => {
  try {
    logNativeServer(`attempting to load server binding path "${targetPath}"`);
    const mod = requireFn(targetPath) as NativeServerModule<TMessage>;
    if (!mod?.QWormholeServerWrapper) {
      logNativeServer(
        `server binding path "${targetPath}" missing QWormholeServerWrapper export`,
      );
      return null;
    }
    logNativeServer(
      `successfully loaded server binding path "${targetPath}"`,
    );
    return mod;
  } catch (err) {
    logNativeServer(
      `server binding path "${targetPath}" not found: ${(err as Error).message}`,
    );
    return null;
  }
};

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

const bindingPathCandidates = (bindingName: string): string[] => {
  const candidates: string[] = [];
  if (envBindingPath) candidates.push(envBindingPath);
  if (isTestRuntime && !allowPrebuiltProbeInTests) {
    return candidates;
  }
  candidates.push(
    path.join(bindingModuleRoot, "dist", "native", `${bindingName}.node`),
    path.join(bindingModuleRoot, "prebuilds", platformArch, `${bindingName}.node`),
    path.join(
      bindingModuleRoot,
      "dist",
      "native",
      "prebuilds",
      platformArch,
      `${bindingName}.node`,
    ),
  );
  return candidates;
};

const loadServerBackend = <TMessage>(
  kind: NativeBackend,
): LoadedServerBinding<TMessage> | null => {
  const bindingName = kind === "lws" ? "qwormhole_lws" : "qwormhole";
  logNativeServer(`trying server backend: ${kind} (${bindingName})`);
  for (const candidatePath of bindingPathCandidates(bindingName)) {
    const mod = tryLoadBindingPath<TMessage>(candidatePath);
    if (mod?.QWormholeServerWrapper) {
      logNativeServer(
        `loaded native server backend "${kind}" from ${candidatePath}`,
      );
      return { kind, module: mod };
    }
  }
  const module = tryLoadBinding<TMessage>(bindingName);
  if (module?.QWormholeServerWrapper) {
    logNativeServer(
      `loaded native server backend "${kind}" from ${bindingName}`,
    );
    return { kind, module };
  }
  logNativeServer(`server backend "${kind}" unavailable`);
  return null;
};

const loadNativeServer = <TMessage>(
  preferred?: NativeBackend,
): LoadedServerBinding<TMessage> | null => {
  if (preferred) {
    return (
      loadServerBackend<TMessage>(preferred) ??
      loadServerBackend<TMessage>(preferred === "lws" ? "libsocket" : "lws")
    );
  }
  return (
    loadServerBackend<TMessage>("lws") ??
    loadServerBackend<TMessage>("libsocket")
  );
};

const bindingCache: Partial<
  Record<NativeBackend, LoadedServerBinding<unknown>>
> = {};
let nativeServerBinding: LoadedServerBinding<unknown> | null = null;

const ensureNativeServerBinding = (
  preferred?: NativeBackend,
): LoadedServerBinding<unknown> | null => {
  if (nativeDisabled()) return null;
  if (preferred) {
    if (!bindingCache[preferred]) {
      const loaded = loadServerBackend<unknown>(preferred);
      if (loaded) {
        bindingCache[preferred] = loaded;
      }
    }
    if (bindingCache[preferred]) {
      nativeServerBinding = bindingCache[preferred] ?? nativeServerBinding;
      return bindingCache[preferred] ?? null;
    }
    return null;
  }

  if (nativeServerBinding) {
    return nativeServerBinding;
  }

  let resolved: LoadedServerBinding<unknown> | null = null;
  if (DEFAULT_NATIVE_SERVER_BACKEND) {
    resolved =
      bindingCache[DEFAULT_NATIVE_SERVER_BACKEND] ??
      loadServerBackend<unknown>(DEFAULT_NATIVE_SERVER_BACKEND);
    if (resolved) {
      bindingCache[resolved.kind] = resolved;
    }
  }

  if (!resolved) {
    resolved = loadNativeServer<unknown>();
    if (resolved) {
      bindingCache[resolved.kind] = resolved;
    }
  }

  nativeServerBinding = resolved ?? nativeServerBinding;
  return nativeServerBinding;
};

export const getNativeServerBackend = (
  preferred?: NativeBackend,
): NativeBackend | null => {
  const binding = ensureNativeServerBinding(preferred);
  return binding?.kind ?? null;
};

export const isNativeServerAvailable = (preferred?: NativeBackend): boolean => {
  return Boolean(ensureNativeServerBinding(preferred));
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
        "Native qwormhole server binding not available. Run `pnpm run rebuild` or disable preferNative.",
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
      maxBackpressureBytes: options.maxBackpressureBytes,
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
    const send: QWormholeServerConnection["send"] = async payload => {
      const state = this.connections.get(snapshot.id);
      if (
        state?.managed.backpressured &&
        this.options.maxBackpressureBytes !== undefined
      ) {
        throw new QWormholeError(
          "E_BACKPRESSURE",
          "Backpressure limit exceeded",
        );
      }
      if (typeof this.impl.sendTo === "function") {
        const serialized = this.options.serializer(payload);
        this.impl.sendTo(snapshot.id, serialized);
        return;
      }
      return sendNotSupported();
    };

    const handshake = this.normalizeHandshake(snapshot.handshake);

    return {
      id: snapshot.id,
      remoteAddress: snapshot.remoteAddress,
      remotePort: snapshot.remotePort,
      handshake,
      backpressured: false,
      socket: {} as net.Socket,
      send,
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
      const normalized = this.normalizeHandshake(handshake);
      const payload = normalized
        ? ({ type: "handshake", ...normalized } as unknown)
        : ({ type: "handshake" } as unknown);
      const result = await verifier(payload);
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
      state.managed.backpressured = true;
      this.emit(event, {
        client: state.managed,
        queuedBytes: payload.queuedBytes ?? 0,
        threshold: payload.threshold ?? Number.POSITIVE_INFINITY,
      } as never);
      return;
    }
    state.managed.backpressured = false;
    this.emit(event, { client: state.managed } as never);
  }

  private normalizeHandshake(
    handshake?: QWormholeServerConnection["handshake"],
  ): QWormholeServerConnection["handshake"] | undefined {
    if (!handshake) return undefined;
    const nIndex = handshake.nIndex ?? handshake.entropyMetrics?.negIndex ?? 0.5;
    const entropyMetrics: EntropyMetrics =
      handshake.entropyMetrics ?? computeEntropyMetrics(nIndex);
    const policy = deriveEntropyPolicy(entropyMetrics);
    return {
      ...handshake,
      entropyMetrics,
      policy,
    };
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
