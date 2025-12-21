import { EventEmitter } from "node:events";
import type { QWormholeTransport } from "../transport";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import type {
  QuicBinding,
  QuicConnectOptions,
  QuicConnectionStats,
  QuicEndpointOptions,
  QuicStreamOptions,
} from "./types";


export interface QuicTransportOptions
  extends
    Omit<QuicEndpointOptions, "host" | "port">,
    Omit<QuicConnectOptions, "host" | "port"> {
  host: string;
  port: number;
  pollIntervalMs?: number; // add this
}

export class QuicTransport extends EventEmitter implements QWormholeTransport {
  readonly type = "quic" as const;

  public pollTimer: NodeJS.Timeout | null = null;

  private readonly opts: Required<QuicTransportOptions>;
  private binding: QuicBinding | null;

  private endpoint: unknown | null = null;
  private conn: unknown | null = null;
  private defaultStreamId: number | null = null;

  constructor(opts: QuicTransportOptions) {
    super();
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 5,
      ...opts,
    } as Required<QuicTransportOptions>;
    this.binding = loadQuicBinding();
  }

  static isAvailable(): boolean {
    return quicAvailable();
  }

  async connect(): Promise<void> {
    if (!this.binding) {
      throw new Error(
        "QUIC native binding unavailable. Build or install qwquic.node",
      );
    }

    // Create endpoint
    this.endpoint = this.binding.createEndpoint({
      host: this.opts.host,
      port: 0, // ephemeral bind for client
      alpn: this.opts.alpn,
      sni: this.opts.sni,
      idleTimeoutMs: this.opts.idleTimeoutMs,
      maxDatagramFrameSize: this.opts.maxDatagramFrameSize,
      certPath: this.opts.certPath,
      keyPath: this.opts.keyPath,
      verifyPeer: this.opts.verifyPeer,
    });

    // Connect
    const { handle } = this.binding.connect(this.endpoint, {
      host: this.opts.host,
      port: this.opts.port,
      alpn: this.opts.alpn,
      sni: this.opts.sni,
      verifyPeer: this.opts.verifyPeer,
    } as QuicConnectOptions);

    this.conn = handle;

    // Prime + start poll loop
    const initial = this.binding.poll(this.endpoint, Date.now());
    this.startPolling(initial?.next_timeout_ms ?? this.opts.pollIntervalMs);

    // Wait for handshake to finish so stream limits are negotiated
    await this.waitForHandshake();

    // Open default stream once ready
    this.defaultStreamId = this.binding.openStream(this.conn, {
      bidirectional: true,
    } as QuicStreamOptions);

    this.emit("connect");
  }

  async openStream(opts?: { bidirectional?: boolean }) {
    if (!this.binding || !this.conn) {
      throw new Error("QUIC not connected");
    }

    const id = this.binding.openStream(this.conn, {
      bidirectional: opts?.bidirectional ?? true,
    } as QuicStreamOptions);

    return {
      id,
      send: (data: Uint8Array) => {
        try {
          this.binding!.writeStream(this.conn!, id, data, false);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("StreamLimit")) {
            setTimeout(() => this.binding!.writeStream(this.conn!, id, data, false), this.opts.pollIntervalMs);
            return;
          }
          this.emit("error", err instanceof Error ? err : new Error(msg));
        }
      },
      onData: (cb: (data: Uint8Array) => void) => {
        const readLoop = () => {
          let chunk: Uint8Array | null;
          for (;;) {
            try {
              chunk = this.binding!.readStream(this.conn!, id);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg.includes("InvalidStreamState")) return;
              this.emit("error", err instanceof Error ? err : new Error(msg));
              return;
            }
            if (!chunk) break;
            cb(chunk);
          }
        };
        this.on("poll", readLoop);
      },
      close: () => {
        // optional close; binding may not support explicit close
      },
    };
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }


  send(data: Uint8Array): void {
    if (!this.binding || !this.conn || this.defaultStreamId === null) {
      this.emit("error", new Error("QUIC connection not established"));
      return;
    }
    try {
      this.binding.writeStream(this.conn, this.defaultStreamId, data, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("StreamLimit")) {
        setTimeout(() => this.send(data), this.opts.pollIntervalMs);
        return;
      }
      this.emit("error", err instanceof Error ? err : new Error(msg));
    }
  }

  private startPolling(initialDelay: number): void {
    if (!this.binding || !this.endpoint) return;
    if (this.pollTimer) return;

    const schedule = (delayMs: number) => {
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        try {
          const res = this.binding!.poll(this.endpoint!, Date.now());
          this.emit("poll");
          this.drainReads();
          const next = res?.next_timeout_ms ?? this.opts.pollIntervalMs;
          schedule(Math.max(0, next));
        } catch (err) {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        }
      }, delayMs) as unknown as NodeJS.Timeout;
      this.pollTimer.unref?.();
    };

    schedule(Math.max(0, initialDelay));
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private drainReads(): void {
    if (!this.binding || !this.conn || this.defaultStreamId === null) return;

    const readable = this.binding.readable
      ? this.binding.readable(this.conn)
      : [this.defaultStreamId];
    const targets = readable.includes(this.defaultStreamId)
      ? [this.defaultStreamId]
      : readable;

    for (const streamId of targets) {
      for (;;) {
        let chunk: Uint8Array | null;
        try {
          chunk = this.binding.readStream(this.conn, streamId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("InvalidStreamState")) break;
          this.emit("error", err instanceof Error ? err : new Error(msg));
          break;
        }
        if (!chunk) break;
        this.emit("data", chunk);
      }
    }
  }

  getStats(): QuicConnectionStats | null {
    if (!this.binding || !this.conn) return null;
    return this.binding.stats(this.conn);
  }

  async close(): Promise<void> {
    this.stopPolling();

    try {
      if (this.binding && this.conn) {
        this.binding.closeConnection(this.conn, 0, "client-close");
      }
    } catch (err) {
      this.emit("error", err);
    }

    try {
      if (this.binding && this.endpoint) {
        this.binding.shutdown(this.endpoint);
      }
    } catch (err) {
      this.emit("error", err);
    }

    this.conn = null;
    this.endpoint = null;
    this.defaultStreamId = null;

    this.emit("close");
  }

  private async waitForHandshake(): Promise<boolean> {
    if (!this.binding || !this.conn) return false;
    const start = Date.now();
    const timeoutMs = 2_000;
    while (Date.now() - start < timeoutMs) {
      try {
        if (this.binding.isEstablished(this.conn)) return true;
      } catch {
        // ignore transient
      }
      await new Promise(resolve => setTimeout(resolve, this.opts.pollIntervalMs));
    }
    return this.binding.isEstablished(this.conn);
  }
}
