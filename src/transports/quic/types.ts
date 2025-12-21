export interface QuicEndpointOptions {
  host: string;
  port: number;
  alpn?: string[];
  sni?: string;
  idleTimeoutMs?: number;
  maxDatagramFrameSize?: number;
  certPath?: string;
  keyPath?: string;
  verifyPeer?: boolean;
}

export interface QuicConnectOptions {
  host: string;
  port: number;
  alpn?: string[];
  sni?: string;
  verifyPeer?: boolean;
}

export interface QuicStreamOptions {
  bidirectional?: boolean;
}

export interface QuicConnectionStats {
  rtt_ms?: number;
  cwnd_bytes?: number;
  bytes_sent?: number;
  bytes_received?: number;
  streams_active?: number;
  lost_packets?: number;
  acked_packets?: number;
  congestion_state?: string;
}

export interface PollResult {
  processed: number;
  next_timeout_ms?: number | null;
}

export interface QuicBinding {
  // Endpoint lifecycle
  createEndpoint(opts: QuicEndpointOptions): unknown;
  endpointPort?(endpoint: unknown): number;
  shutdown(endpoint: unknown): void;

  // Connection lifecycle
  connect(endpoint: unknown, opts: QuicConnectOptions): {
    handle: unknown;
    isClient: boolean;
  };
  accept(endpoint: unknown): {
    handle: unknown;
    isClient: boolean;
  } | null;

  closeConnection(conn: unknown, code?: number, reason?: string): void;

  // Streams
  openStream(conn: unknown, opts?: QuicStreamOptions): number;
  writeStream(
    conn: unknown,
    streamId: number,
    buf: Uint8Array,
    fin?: boolean
  ): number;
  readStream(conn: unknown, streamId: number): Uint8Array | null;
  readable?(conn: unknown): number[];
  closeStream?(conn: unknown, streamId: number, fin?: boolean): void;

  // Datagrams (DO NOT SKIP)
  sendDatagram?(conn: unknown, buf: Uint8Array): void;
  readDatagram?(conn: unknown): Uint8Array | null;

  // Telemetry
  stats(conn: unknown): QuicConnectionStats;
  isEstablished(conn: unknown): boolean;

  // Driving timers + IO
  poll(endpoint: unknown, nowMs: number): PollResult;

  // Errors
  lastError?(conn?: unknown): {
    code?: number;
    message: string;
    fatal?: boolean;
  } | null;

  shutdown(endpoint: unknown): void;
}
