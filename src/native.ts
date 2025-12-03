import bindings from "bindings";
import type {
  NativeBackend,
  NativeSocketOptions,
  QWTlsOptions,
} from "src/types/types";

const DEBUG_NATIVE = process.env.QWORMHOLE_DEBUG_NATIVE === "1";
const logNative = (msg: string) => {
  if (DEBUG_NATIVE) {
    console.log(`[qwormhole][native] ${msg}`);
  }
};

type TlsBufferInput = string | Buffer | Array<string | Buffer> | undefined;

const normalizeTlsBuffer = (value?: TlsBufferInput): Buffer | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return normalizeTlsBuffer(value[0]);
  if (typeof value === "string") return Buffer.from(value);
  if (Buffer.isBuffer(value)) return value;
  return undefined;
};

const serializeAlpn = (protocols?: string[]): string | undefined => {
  if (!protocols || protocols.length === 0) return undefined;
  return protocols.join(",");
};

type NativeBindingClient = {
  connect(host: string, port: number): void;
  connect(opts: NativeSocketOptions): void;
  send(data: string | Buffer): void;
  recv(length?: number): Buffer;
  close(): void;
};

type NativeModule = {
  TcpClientWrapper: new () => NativeBindingClient;
};

type LoadedBinding = {
  kind: NativeBackend;
  module: NativeModule;
};

const resolveBindings = () =>
  (globalThis as unknown as { bindings?: typeof bindings }).bindings ??
  bindings;

const tryLoadBinding = (name: string): NativeModule | null => {
  try {
    logNative(`attempting to load binding "${name}"`);
    const mod = resolveBindings()(name) as NativeModule;
    logNative(`successfully loaded binding "${name}"`);
    return mod;
  } catch (err) {
    logNative(`binding "${name}" not found: ${(err as Error).message}`);
    return null;
  }
};

const loadNative = (preferred?: NativeBackend): LoadedBinding | null => {
  const order: NativeBackend[] = preferred
    ? [preferred, preferred === "lws" ? "libsocket" : "lws"]
    : ["lws", "libsocket"];

  for (const kind of order) {
    const bindingName = kind === "lws" ? "qwormhole_lws" : "qwormhole";
    logNative(`trying backend: ${kind} (${bindingName})`);
    const module = tryLoadBinding(bindingName);
    if (module?.TcpClientWrapper) {
      logNative(`loaded native backend "${kind}" from ${bindingName}`);
      return { kind, module };
    } else {
      logNative(`backend "${kind}" not available (missing TcpClientWrapper)`);
    }
  }
  logNative("no native backend loaded; TS transport will be used");
  return null;
};

let nativeBinding: LoadedBinding | null = loadNative();

export const getNativeBackend = (): NativeBackend | null =>
  nativeBinding?.kind ?? null;

export const isNativeAvailable = (): boolean => Boolean(nativeBinding);

/**
 * Explicit native client. Prefers libwebsockets backend when available, falls back to libsocket.
 */
export class NativeTcpClient implements NativeBindingClient {
  private readonly impl: NativeBindingClient;
  public readonly backend: NativeBackend;

  constructor(preferred?: NativeBackend) {
    logNative(`NativeTcpClient constructor called with preferred=${preferred}`);
    nativeBinding = nativeBinding ?? loadNative(preferred);

    if (preferred && (!nativeBinding || nativeBinding.kind !== preferred)) {
      logNative(`Preferred backend ${preferred} not loaded, retrying...`);
      const retry = loadNative(preferred);
      if (retry) {
        nativeBinding = retry;
        logNative(`Retry loaded backend: ${nativeBinding.kind}`);
      }
    }

    if (!nativeBinding?.module?.TcpClientWrapper) {
      logNative(`NativeTcpClient failed: no TcpClientWrapper in loaded module`);
      throw new Error(
        "Native qwormhole binding not available. Run `pnpm run build:native` (libsocket) or `pnpm run build:native:lws` (libwebsockets).",
      );
    }

    this.backend = nativeBinding.kind;
    logNative(`NativeTcpClient using backend: ${this.backend}`);
    this.impl = new nativeBinding.module.TcpClientWrapper();
  }

  connect(hostOrOptions: string | NativeSocketOptions, port?: number): void {
    if (typeof hostOrOptions === "string") {
      const resolvedPort = port ?? 0;
      this.impl.connect(hostOrOptions, resolvedPort);
      return;
    }

    const { host, port: resolvedPort } = hostOrOptions;
    if (!host || !resolvedPort) {
      throw new Error("connect requires host and port");
    }

    const tlsOptions = hostOrOptions.tls;
    const explicitUseTls = hostOrOptions.useTls;
    const inferredTls =
      typeof explicitUseTls === "boolean"
        ? explicitUseTls
        : tlsOptions
          ? (tlsOptions.enabled ?? true)
          : false;

    if (this.backend === "libsocket") {
      if (inferredTls) {
        throw new Error(
          "Native libsocket backend does not support TLS. Switch to the libwebsockets backend or disable preferNative.",
        );
      }
      this.impl.connect(host, resolvedPort);
      return;
    }

    const payload: Record<string, unknown> = {
      host,
      port: resolvedPort,
      useTls: inferredTls,
    };

    if (inferredTls && tlsOptions) {
      Object.assign(payload, this.serializeTlsOptions(tlsOptions));
    }

    (
      this.impl as unknown as { connect(opts: Record<string, unknown>): void }
    ).connect(payload);
  }

  send(data: string | Buffer): void {
    this.impl.send(data);
  }

  recv(length?: number): Buffer {
    return this.impl.recv(length);
  }

  close(): void {
    this.impl.close();
  }

  private serializeTlsOptions(tls: QWTlsOptions): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const ca = normalizeTlsBuffer(tls.ca);
    const cert = normalizeTlsBuffer(tls.cert);
    const key = normalizeTlsBuffer(tls.key);
    const alpn = serializeAlpn(tls.alpnProtocols);
    if (ca) result.tlsCa = ca;
    if (cert) result.tlsCert = cert;
    if (key) result.tlsKey = key;
    if (alpn) result.tlsAlpn = alpn;
    if (tls.servername) result.tlsServername = tls.servername;
    if (typeof tls.rejectUnauthorized === "boolean") {
      result.tlsRejectUnauthorized = tls.rejectUnauthorized;
    }
    if (typeof tls.requestCert === "boolean") {
      result.tlsRequestCert = tls.requestCert;
    }
    if (tls.passphrase) {
      result.tlsPassphrase = tls.passphrase;
    }
    return result;
  }
}
