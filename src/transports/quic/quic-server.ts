import { EventEmitter } from "node:events";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import type {
  QuicBinding,
  QuicConnectionStats,
  QuicEndpointOptions,
  QuicStreamOptions,
} from "./types";
import type { QWormholeTransport } from "../transport";

export interface QuicServerOptions extends Omit<QuicEndpointOptions, "port"> {
  host: string;
  port?: number; // 0 for ephemeral
  pollIntervalMs?: number;
}

export interface QuicServerStream {
  id: number;
  send: (data: Uint8Array, fin?: boolean) => void;
  onData: (cb: (data: Uint8Array) => void) => void;
  close: () => void;
}

class QuicServerConnection extends EventEmitter implements QWormholeTransport {
  readonly type = "quic" as const;
  constructor(
    private binding: QuicBinding,
    private endpoint: unknown,
    public readonly handle: unknown,
  ) {
    super();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  send(data: Uint8Array): void {
    try {
      this.binding.writeStream(this.handle, 0, data, false);
    } catch (err) {
      // surface recoverable errors as events instead of crashing loops
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  async openStream(opts?: { bidirectional?: boolean }): Promise<{
    id: number;
    send: (data: Uint8Array) => void | Promise<void>;
    onData: (cb: (data: Uint8Array) => void) => void;
    close?: () => void | Promise<void>;
  }> {
    const id = this.binding.openStream(this.handle, {
      bidirectional: opts?.bidirectional ?? true,
    } as QuicStreamOptions);
    return {
      id,
      send: (data: Uint8Array) => {
        try {
          this.binding.writeStream(this.handle, id, data, false);
        } catch (err) {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        }
      },
      onData: (cb: (data: Uint8Array) => void) => {
        this.on(`stream:${id}`, cb);
      },
      close: () => {
        try {
          if (this.binding.closeStream) {
            this.binding.closeStream(this.handle, id);
          }
        } catch {
          /* ignore */
        }
      }
    };
  }

  drainReads(): void {
    const readable = this.binding.readable ? this.binding.readable(this.handle) : [0];
    const targets = readable.length ? readable : [0];

    for (const streamId of targets) {
      for (;;) {
        let chunk: Uint8Array | null;
        try {
          chunk = this.binding.readStream(this.handle, streamId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("InvalidStreamState")) break;
          this.emit("error", err instanceof Error ? err : new Error(msg));
          break;
        }
        if (!chunk) break;
        this.emit(streamId === 0 ? "data" : `stream:${streamId}`, chunk);
      }
    }
  }

  close(): void {
    try {
      this.binding.closeConnection(this.handle, 0, "server-close");
    } catch {
      /* ignore */
    }
  }

  getStats(): QuicConnectionStats | null {
    return this.binding.stats(this.handle);
  }
}

export class QuicServer extends EventEmitter {
  private readonly opts: Required<QuicServerOptions>;
  private binding: QuicBinding | null;
  private endpoint: unknown | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private listeningPort: number | null = null;
  private connections = new Map<number, QuicServerConnection>();

  constructor(opts: QuicServerOptions) {
    super();
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 5,
      port: opts.port ?? 0,
      ...opts,
    } as Required<QuicServerOptions>;
    this.binding = loadQuicBinding();
  }

  static isAvailable(): boolean {
    return quicAvailable();
  }

  get port(): number | null {
    return this.listeningPort;
  }

  async listen(): Promise<void> {
    if (!this.binding) {
      throw new Error("QUIC native binding unavailable");
    }
    this.endpoint = this.binding.createEndpoint({
      host: this.opts.host,
      port: this.opts.port,
      alpn: this.opts.alpn,
      sni: this.opts.sni,
      idleTimeoutMs: this.opts.idleTimeoutMs,
      maxDatagramFrameSize: this.opts.maxDatagramFrameSize,
      certPath: this.opts.certPath,
      keyPath: this.opts.keyPath,
      verifyPeer: this.opts.verifyPeer,
    });
    if (typeof this.binding.endpointPort === "function") {
      this.listeningPort = this.binding.endpointPort(this.endpoint);
    } else {
      this.listeningPort = this.opts.port || null;
    }
    this.startPolling();
    this.emit("listening");
  }

  private startPolling(): void {
    if (!this.binding || !this.endpoint) return;
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      try {
        const res = this.binding!.poll(this.endpoint!, Date.now());
        this.emit("poll");
        this.processAccepts();
        this.drainReads();
      } catch (err) {
        this.emit("error", err);
      }
    }, this.opts.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  private stopPolling(): void {
    if (!this.pollTimer) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private processAccepts(): void {
    if (!this.binding || !this.endpoint) return;
    while (true) {
      const res = this.binding.accept(this.endpoint as number);
      if (!res) break;
      const conn = new QuicServerConnection(this.binding, this.endpoint, res.handle);
      this.connections.set(res.handle as number, conn);
      this.emit("connection", conn);
    }
  }

  private drainReads(): void {
    for (const conn of this.connections.values()) {
      conn.drainReads();
    }
  }

  close(): void {
    this.stopPolling();
    if (this.binding && this.endpoint) {
      try {
        this.binding.shutdown(this.endpoint);
      } catch {
        /* ignore */
      }
    }
    this.endpoint = null;
    this.emit("close");
  }

  // Placeholder: server-side stats when binding can expose them.
  getStats(): QuicConnectionStats | null {
    return null;
  }
}
