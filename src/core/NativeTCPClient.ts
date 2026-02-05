import bindings from "bindings";
import path from "node:path";
import { createRequire } from "node:module";
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

const requireFn =
  typeof require === "function" ? require : createRequire(__filename);
const bindingModuleRoot = path.resolve(__dirname, "..", "..");
const envBindingPath = process.env.QWORMHOLE_NATIVE_PATH;

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
  isConnected?(): boolean;
  setEventHandler?(
    handler: (evt: {
      type: string;
      data?: Buffer;
      error?: string;
      hadError?: boolean;
    }) => void,
  ): void;
  getTlsInfo?():
    | {
        alpnProtocol?: string;
        protocol?: string;
        cipher?: string;
        authorized?: boolean;
        peerFingerprint?: string;
        peerFingerprint256?: string;
      }
    | undefined;
  exportKeyingMaterial?(
    length: number,
    label: string,
    context?: Buffer,
  ): Buffer | undefined;
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

type BindingLoader = (
  target: string | { module_root: string; bindings: string },
) => unknown;

const tryLoadBindingPath = (targetPath: string): NativeModule | null => {
  try {
    logNative(`attempting to load binding path "${targetPath}"`);
    const mod = requireFn(targetPath) as NativeModule;
    if (!mod?.TcpClientWrapper) {
      logNative(`binding path "${targetPath}" missing TcpClientWrapper export`);
      return null;
    }
    logNative(`successfully loaded binding path "${targetPath}"`);
    return mod;
  } catch (err) {
    logNative(
      `binding path "${targetPath}" not found: ${(err as Error).message}`,
    );
    return null;
  }
};

const tryLoadBinding = (name: string): NativeModule | null => {
  try {
    logNative(`attempting to load binding "${name}"`);
    const loader = resolveBindings() as BindingLoader;
    const mod = loader({
      module_root: bindingModuleRoot,
      bindings: name,
    }) as NativeModule;
    logNative(`successfully loaded binding "${name}"`);
    return mod;
  } catch (err) {
    logNative(`binding "${name}" not found: ${(err as Error).message}`);
    return null;
  }
};

const loadNative = (preferred?: NativeBackend): LoadedBinding | null => {
  if (envBindingPath) {
    const mod = tryLoadBindingPath(envBindingPath);
    if (mod?.TcpClientWrapper) {
      const fallbackKind = preferred ?? "lws";
      return { kind: fallbackKind, module: mod };
    }
  }

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

let nativeBinding: LoadedBinding | null | undefined;

const nativeDisabled = () => {
  const legacy = process.env.QWORMHOLE_NATIVE;
  if (legacy === "0") return true;
  if (legacy === "1") return false;
  return process.env.QWORMHOLE_DISABLE_NATIVE === "1";
};

const ensureNativeBinding = (
  preferred?: NativeBackend,
): LoadedBinding | null => {
  if (nativeDisabled()) return null;
  if (
    nativeBinding === undefined ||
    (preferred && nativeBinding?.kind !== preferred)
  ) {
    nativeBinding = loadNative(preferred);
  }
  return nativeBinding ?? null;
};

export const getNativeBackend = (): NativeBackend | null =>
  ensureNativeBinding()?.kind ?? null;

export const isNativeAvailable = (): boolean => Boolean(ensureNativeBinding());

/**
 * Explicit native client. Prefers libwebsockets backend when available, falls back to libsocket.
 */
export class NativeTcpClient implements NativeBindingClient {
  private readonly impl: NativeBindingClient;
  public readonly backend: NativeBackend;

  constructor(preferred?: NativeBackend) {
    logNative(`NativeTcpClient constructor called with preferred=${preferred}`);
    nativeBinding = ensureNativeBinding(preferred);

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

  isConnected(): boolean {
    if (typeof this.impl.isConnected === "function") {
      return this.impl.isConnected();
    }
    return false;
  }

  setEventHandler(
    handler: (evt: {
      type: string;
      data?: Buffer;
      error?: string;
      hadError?: boolean;
    }) => void,
  ): void {
    if (typeof this.impl.setEventHandler === "function") {
      this.impl.setEventHandler(handler);
    }
  }

  supportsEventStream(): boolean {
    return typeof this.impl.setEventHandler === "function";
  }

  getTlsInfo():
    | {
        alpnProtocol?: string;
        protocol?: string;
        cipher?: string;
        authorized?: boolean;
        peerFingerprint?: string;
        peerFingerprint256?: string;
      }
    | undefined {
    if (typeof this.impl.getTlsInfo === "function") {
      return this.impl.getTlsInfo();
    }
    return undefined;
  }

  exportKeyingMaterial(
    length: number,
    label: string,
    context?: Buffer,
  ): Buffer | undefined {
    if (typeof this.impl.exportKeyingMaterial === "function") {
      return this.impl.exportKeyingMaterial(length, label, context);
    }
    return undefined;
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
