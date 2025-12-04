//@preserve
import type net from "node:net";

export type Payload = string | Buffer | Uint8Array | Record<string, unknown>;

export type Serializer = (payload: Payload) => Buffer;
export type Deserializer<TMessage = unknown> = (data: Buffer) => TMessage;

export type FramingMode = "length-prefixed" | "none";
export type TransportMode = "ts" | "native-lws" | "native-libsocket";
export type NativeBackend = "lws" | "libsocket";

export interface QWTlsOptions {
  enabled?: boolean;
  key?: string | Buffer;
  cert?: string | Buffer;
  ca?: Array<string | Buffer> | string | Buffer;
  alpnProtocols?: string[];
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
  servername?: string;
  passphrase?: string;
  /**
   * Export TLS keying material to bind with negentropic handshake results.
   */
  exportKeyingMaterial?: {
    label?: string;
    length?: number;
    context?: Buffer;
  };
}

export interface QWormholeReconnectOptions {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  maxAttempts: number;
}

export interface NativeSocketOptions {
  host: string;
  port: number;
  useTls?: boolean;
  alpn?: string[];
  subprotocols?: string[];
  headers?: Record<string, string>;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  interfaceName?: string;
  localAddress?: string;
  localPort?: number;
  /**
   * Optional TLS configuration. Mirrors the public TLS options so native bindings can wrap TLS sockets.
   */
  tls?: QWTlsOptions;
}

export interface NativeTcpClient {
  connect(opts: NativeSocketOptions | { host: string; port: number }): void;
  send(data: string | Buffer): void; // queues and flushes via LWS writable callbacks
  recv(maxBytes?: number): Buffer; // drains from the recv ring buffer; empty Buffer if none
  close(): void;
  backend?: NativeBackend;
}

export interface QWormholeCommonOptions<TMessage = unknown> {
  host: string;
  port: number;
  /**
   * Optional TLS settings; when provided, connections wrap Node's tls module.
   */
  tls?: QWTlsOptions;
  /**
   * Optional local bind address (e.g., WireGuard interface IP).
   */
  localAddress?: string;
  /**
   * Optional local bind port for the outbound socket.
   */
  localPort?: number;
  /**
   * Prefer binding to a specific interface by name (e.g., "wg0"). If set, the client will try to resolve
   * the first IPv4 address on that interface and use it as localAddress.
   */
  interfaceName?: string;
  /**
   * Timeout for establishing a connection before failing with E_CONNECT_TIMEOUT (ms).
   */
  connectTimeoutMs?: number;
  /**
   * Optional outbound rate limit (bytes per second). When set, writes are queued and drained respecting this limit.
   */
  rateLimitBytesPerSec?: number;
  /**
   * Burst size for rate limiting (bytes). Defaults to `rateLimitBytesPerSec` if not set.
   */
  rateLimitBurstBytes?: number;
  /**
   * Optional protocol version string to send/expect during handshake.
   */
  protocolVersion?: string;
  /**
   * Optional tags to include in handshake (e.g., deviceId, service, interface).
   */
  handshakeTags?: Record<string, string | number>;
  /**
   * Custom handshake signer. If provided, the client sends the returned payload
   * instead of the default {type,version,tags} handshake.
   */
  handshakeSigner?: () => Record<string, unknown>;
  /**
   * Optional heartbeat interval (ms). When set, the client sends a small ping payload periodically.
   */
  heartbeatIntervalMs?: number;
  /**
   * Override heartbeat payload (default: {type:"ping", ts:Date.now()}).
   */
  heartbeatPayload?: Payload;
  framing?: FramingMode;
  maxFrameLength?: number;
  /**
   * When the socket's writable buffer exceeds this size, the server will throw and drop the connection.
   * Defaults to 5 MiB for servers; ignored for clients.
   */
  maxBackpressureBytes?: number;
  keepAlive?: boolean;
  keepAliveDelayMs?: number;
  idleTimeoutMs?: number;
  reconnect?: Partial<QWormholeReconnectOptions>;
  serializer?: Serializer;
  deserializer?: Deserializer<TMessage>;
  /**
   * Called with telemetry snapshots (bytes in/out, connections, backpressure toggles).
   */
  onTelemetry?: (metrics: QWormholeTelemetry) => void;
}

export interface QWormholeClientOptions<
  TMessage = unknown,
> extends QWormholeCommonOptions<TMessage> {
  /**
   * When true, socket writes will throw if not connected instead of being ignored.
   */
  requireConnectedForSend?: boolean;
}

export interface QWormholeServerOptions<
  TMessage = unknown,
> extends QWormholeCommonOptions<TMessage> {
  allowHalfOpen?: boolean;
  /**
   * Maximum concurrent clients. Extra connections are rejected immediately.
   */
  maxClients?: number;
  /**
   * Optional hook to rate-limit or throttle new connections (return false to drop).
   */
  allowConnection?: (clientAddress?: string) => boolean | Promise<boolean>;
  /**
   * Optional hook to decide if an incoming connection is accepted.
   */
  onAuthorizeConnection?: (socket: net.Socket) => boolean | Promise<boolean>;
  /**
   * Optional handshake verifier. If provided, it is invoked when a handshake
   * payload is received; returning false closes the connection.
   */
  verifyHandshake?: (payload: unknown) => boolean | Promise<boolean>;
}

export interface QWormholeClientEvents<TMessage = unknown> {
  connect: void;
  ready: void;
  data: Buffer;
  message: TMessage;
  close: { hadError: boolean };
  error: Error;
  timeout: void;
  reconnecting: { attempt: number; delayMs: number };
}

export interface QWormholeServerConnection {
  id: string;
  socket: net.Socket;
  remoteAddress?: string;
  remotePort?: number;
  handshake?: {
    version?: string;
    tags?: Record<string, unknown>;
    nIndex?: number;
    negHash?: string;
    /** Entropy metrics from peer handshake (0.3.2) */
    entropyMetrics?: {
      entropy?: number;
      entropyVelocity?: "low" | "stable" | "rising" | "spiking";
      coherence?: "high" | "medium" | "low" | "chaos";
      negIndex?: number;
    };
    /** Derived transport policy from entropy (0.3.2) */
    policy?: {
      mode: "trust-zero" | "trust-light" | "immune" | "paranoia";
      framing:
        | "zero-copy-writev"
        | "length-prefix"
        | "length-ack"
        | "length-ack-checksum";
      batchSize: number;
      codec: "flatbuffers" | "cbor" | "messagepack" | "json-compressed";
      requireAck: boolean;
      requireChecksum: boolean;
      trustLevel: number;
    };
    tls?: {
      alpnProtocol?: string | false;
      authorized?: boolean;
      peerFingerprint256?: string;
      peerFingerprint?: string;
      tlsSessionKey?: string;
      cipher?: string;
      protocol?: string;
    };
  };
  /**
   * Writes data to the client, respecting backpressure. Resolves once the data is accepted by the OS buffer.
   */
  send(payload: Payload, options?: SendOptions): Promise<void>;
  end(): void;
  destroy(): void;
}

export interface QWormholeServerEvents<TMessage = unknown> {
  listening: net.AddressInfo;
  connection: QWormholeServerConnection;
  message: { client: QWormholeServerConnection; data: TMessage };
  backpressure: {
    client: QWormholeServerConnection;
    queuedBytes: number;
    threshold: number;
  };
  drain: { client: QWormholeServerConnection };
  close: void;
  clientClosed: { client: QWormholeServerConnection; hadError: boolean };
  error: Error;
}

export interface QWormholeTelemetry {
  bytesIn: number;
  bytesOut: number;
  connections: number;
  backpressureEvents: number;
  drainEvents: number;
}

export interface SendOptions {
  priority?: number; // lower number = higher priority
}
