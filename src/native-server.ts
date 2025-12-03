import bindings from "bindings";
import type net from "node:net";
import { TypedEventEmitter } from "./typedEmitter";
import type {
  NativeBackend,
  Payload,
  QWormholeServerConnection,
  QWormholeServerEvents,
  QWormholeServerOptions,
} from "src/types/types";

const DEBUG_NATIVE_SERVER = process.env.QWORMHOLE_DEBUG_NATIVE === "1";
const logNativeServer = (msg: string) => {
  if (DEBUG_NATIVE_SERVER) {
    console.log(`[qwormhole][native-server] ${msg}`);
  }
};

type NativeServerHandle<TMessage> = NodeJS.EventEmitter & {
  listen(): Promise<net.AddressInfo>;
  close(): Promise<void>;
  broadcast(payload: Payload): void;
  shutdown?(gracefulMs?: number): Promise<void>;
  getConnection?(id: string): QWormholeServerConnection | undefined;
  getConnectionCount?(): number;
};

type NativeServerModule<TMessage> = {
  QWormholeServerWrapper: new (
    options: QWormholeServerOptions<TMessage>,
  ) => NativeServerHandle<TMessage>;
};

type LoadedServerBinding<TMessage> = {
  kind: NativeBackend;
  module: NativeServerModule<TMessage>;
};

const resolveBindings = () =>
  (globalThis as unknown as { bindings?: typeof bindings }).bindings ??
  bindings;

const tryLoadBinding = <TMessage>(
  name: string,
): NativeServerModule<TMessage> | null => {
  try {
    logNativeServer(`attempting to load server binding "${name}"`);
    const mod = resolveBindings()(name) as NativeServerModule<TMessage>;
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

export const getNativeServerBackend = (): NativeBackend | null =>
  nativeServerBinding?.kind ?? null;

export const isNativeServerAvailable = (): boolean =>
  Boolean(nativeServerBinding);

const reemitEvents = <TMessage>(
  emitter: NativeServerHandle<TMessage>,
  target: TypedEventEmitter<QWormholeServerEvents<TMessage>>,
) => {
  const events: Array<keyof QWormholeServerEvents<TMessage>> = [
    "listening",
    "connection",
    "message",
    "backpressure",
    "drain",
    "close",
    "clientClosed",
    "error",
  ];
  for (const event of events) {
    emitter.on?.(event, payload => {
      target.emit(event, payload as never);
    });
  }
};

export class NativeQWormholeServer<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeServerEvents<TMessage>
> {
  private readonly impl: NativeServerHandle<TMessage>;
  public readonly backend: NativeBackend;

  constructor(
    options: QWormholeServerOptions<TMessage>,
    preferred?: NativeBackend,
  ) {
    super();
    if (!nativeServerBinding || preferred) {
      nativeServerBinding =
        (loadNativeServer<TMessage>(
          preferred,
        ) as LoadedServerBinding<unknown> | null) ?? nativeServerBinding;
    }

    if (!nativeServerBinding?.module?.QWormholeServerWrapper) {
      logNativeServer("NativeQWormholeServer failed: wrapper unavailable");
      throw new Error(
        "Native qwormhole server binding not available. Run `pnpm run build:native` or disable preferNative.",
      );
    }

    this.backend = nativeServerBinding.kind;
    this.impl = new nativeServerBinding.module.QWormholeServerWrapper(options);
    reemitEvents(this.impl, this);
  }

  listen(): Promise<net.AddressInfo> {
    return this.impl.listen();
  }

  close(): Promise<void> {
    return this.impl.close();
  }

  broadcast(payload: Payload): void {
    this.impl.broadcast(payload);
  }

  shutdown(gracefulMs?: number): Promise<void> {
    if (typeof this.impl.shutdown === "function") {
      return this.impl.shutdown(gracefulMs);
    }
    return this.close();
  }

  getConnection(id: string): QWormholeServerConnection | undefined {
    if (typeof this.impl.getConnection === "function") {
      return this.impl.getConnection(id);
    }
    return undefined;
  }

  getConnectionCount(): number {
    if (typeof this.impl.getConnectionCount === "function") {
      return this.impl.getConnectionCount();
    }
    return 0;
  }
}
