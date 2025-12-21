import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import type { QWormholeTransport } from "../transport";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import { MuxSession } from "../mux/mux-session";
import { MuxStream } from "../mux/mux-stream";
import { handshakePayloadSchema, type HandshakePayload } from "../../schema/scp";
import { LengthPrefixedFramer } from "../../core/framing";
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
  useMux?: boolean;
  protocolVersion?: string;
  handshakeTags?: Record<string, string | number>;
  handshakeSigner?: () => Record<string, unknown>;
  emitHandshakeMessages?: boolean;
}

export class QuicTransport extends EventEmitter implements QWormholeTransport {
  readonly type = "quic" as const;

  public pollTimer: NodeJS.Timeout | null = null;
  public mux: MuxSession | null = null;

  private readonly opts: Required<QuicTransportOptions>;
  private readonly useMux: boolean;
  private binding: QuicBinding | null;
  private muxDecoder: LengthPrefixedFramer | null = null;
  private muxEncoder: LengthPrefixedFramer | null = null;
  private muxDebugSent = false;
  private muxDebugRecv = false;

  private endpoint: unknown | null = null;
  private conn: unknown | null = null;
  private defaultStreamId: number | null = null;
  private peerHandshake: HandshakePayload | null = null;
  private defaultMuxStream: MuxStream | null = null;
  private pendingWrites: Uint8Array[] = [];

  constructor(opts: QuicTransportOptions) {
    super();
    const muxDefault = Boolean(
      opts.protocolVersion || opts.handshakeTags || opts.handshakeSigner,
    );
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 5,
      ...opts,
      useMux: opts.useMux ?? muxDefault,
    } as Required<QuicTransportOptions>;
    this.useMux = opts.useMux ?? muxDefault;
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

    if (this.useMux) {
      // Initialize mux on the default stream for logical channels.
      this.muxEncoder = new LengthPrefixedFramer();
      this.muxDecoder = new LengthPrefixedFramer();
      const debug = process.env.QW_QUIC_DEBUG === "1";
      let logged = false;
      this.muxDecoder.on("message", frame => {
        if (debug && !logged) {
          logged = true;
          console.warn("[qwquic:mux] client frame", { len: frame.length });
        }
        this.mux?.receiveRaw(frame);
      });
      this.muxDecoder.on("error", err => this.emit("error", err));
      this.mux = new MuxSession(buf => this.sendMuxFrame(buf));
      this.attachMuxHandlers();
      await this.sendHandshakeIfNeeded();
      this.emit("mux", this.mux);
    }

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
    if (this.useMux && this.mux) {
      if (!this.defaultMuxStream) {
        this.defaultMuxStream = this.mux.createStream();
        this.defaultMuxStream.on("data", chunk => {
          this.emit("data", chunk);
        });
      }
      this.defaultMuxStream.write(data);
      return;
    }
    this.sendRaw(data);
  }

  private sendRaw(data: Uint8Array): void {
    if (!this.binding || !this.conn || this.defaultStreamId === null) {
      this.emit("error", new Error("QUIC connection not established"));
      return;
    }
    if (this.pendingWrites.length > 0) {
      this.pendingWrites.push(data);
      return;
    }
    try {
      const written = this.binding.writeStream(
        this.conn,
        this.defaultStreamId,
        data,
        false,
      );
      if (written < data.length) {
        this.pendingWrites.unshift(data.subarray(written));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("StreamLimit") || msg.includes("Done")) {
        this.pendingWrites.push(data);
        return;
      }
      this.emit("error", err instanceof Error ? err : new Error(msg));
    }
  }

  private sendMuxFrame(data: Uint8Array): void {
    const encoder = this.muxEncoder ?? new LengthPrefixedFramer();
    this.muxEncoder = encoder;
    const framed = encoder.encode(Buffer.from(data));
    if (process.env.QW_QUIC_DEBUG === "1" && !this.muxDebugSent) {
      this.muxDebugSent = true;
      const head = Buffer.from(framed.subarray(0, 8)).toString("hex");
      console.warn("[qwquic:mux] client send head", { len: framed.length, head });
    }
    this.sendRaw(framed);
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
          this.flushPendingWrites();
          const next = res?.next_timeout_ms ?? this.opts.pollIntervalMs;
          schedule(Math.max(0, Math.min(next, this.opts.pollIntervalMs)));
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

  private flushPendingWrites(): void {
    if (
      !this.binding ||
      !this.conn ||
      this.defaultStreamId === null ||
      this.pendingWrites.length === 0
    ) {
      return;
    }
    let idx = 0;
    while (idx < this.pendingWrites.length) {
      const buf = this.pendingWrites[idx];
      try {
        const written = this.binding.writeStream(
          this.conn,
          this.defaultStreamId,
          buf,
          false,
        );
        if (written < buf.length) {
          this.pendingWrites[idx] = buf.subarray(written);
          break;
        }
        idx += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("StreamLimit") || msg.includes("Done")) {
          break;
        }
        this.emit("error", err instanceof Error ? err : new Error(msg));
        idx += 1;
      }
    }
    if (idx > 0) {
      this.pendingWrites.splice(0, idx);
    }
  }

  private drainReads(): void {
    if (!this.binding || !this.conn || this.defaultStreamId === null) return;

    const readable = this.binding.readable
      ? this.binding.readable(this.conn)
      : [];
    const targets = readable.length
      ? readable.includes(this.defaultStreamId)
        ? [this.defaultStreamId]
        : readable
      : [this.defaultStreamId];

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
        if (
          this.useMux &&
          this.mux &&
          this.muxDecoder &&
          streamId === this.defaultStreamId
        ) {
          if (process.env.QW_QUIC_DEBUG === "1" && !this.muxDebugRecv) {
            this.muxDebugRecv = true;
            const head = Buffer.from(chunk.subarray(0, 8)).toString("hex");
            console.warn("[qwquic:mux] client recv head", { len: chunk.length, head });
          }
          this.muxDecoder.push(Buffer.from(chunk));
        } else {
          this.emit("data", chunk);
        }
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
    this.muxDecoder = null;
    this.muxEncoder = null;
    this.mux = null;
    this.pendingWrites = [];

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

  private attachMuxHandlers(): void {
    if (!this.useMux || !this.mux) return;
    const debug = process.env.QW_QUIC_DEBUG === "1";
    this.mux.on("stream", stream => {
      if (debug) {
        console.warn("[qwquic:mux] client stream", { id: stream.id });
      }
      if (stream.id === 0) {
        stream.on("data", (data: Uint8Array) => this.handleHandshakeData(data));
        return;
      }
      let logged = false;
      stream.on("data", (chunk: any) => {
        if (debug && !logged) {
          logged = true;
          console.warn("[qwquic:mux] client stream data", {
            id: stream.id,
            len: chunk?.length ?? 0,
          });
        }
        this.emit("data", chunk);
      });
      this.emit("stream", stream);
    });
  }

  private async sendHandshakeIfNeeded(): Promise<void> {
    if (!this.useMux || !this.mux) return;
    if (
      !this.opts.protocolVersion &&
      !this.opts.handshakeTags &&
      !this.opts.handshakeSigner
    ) {
      return;
    }
    const signerPayload = (this.opts.handshakeSigner?.() ??
      {}) as Partial<HandshakePayload>;
    const mergedTags = {
      ...(this.opts.handshakeTags ?? {}),
      ...(signerPayload.tags ?? {}),
    };
    const finalTags =
      Object.keys(mergedTags).length > 0 ? mergedTags : undefined;
    const payload = handshakePayloadSchema.parse({
      type: "handshake",
      ...signerPayload,
      version: signerPayload.version ?? this.opts.protocolVersion,
      tags: finalTags,
    });
    const encoded = Buffer.from(JSON.stringify(payload), "utf8");
    this.mux.sendFrame({ streamId: 0, type: "open" });
    this.mux.sendFrame({ streamId: 0, type: "data", payload: encoded });
  }

  private handleHandshakeData(data: Uint8Array): void {
    try {
      const parsed = JSON.parse(Buffer.from(data).toString("utf8"));
      const result = handshakePayloadSchema.safeParse(parsed);
      if (!result.success) {
        this.emit("error", new Error("Invalid handshake payload"));
        return;
      }
      this.peerHandshake = result.data;
      this.emit("handshake", result.data);
      if (this.opts.emitHandshakeMessages) {
        this.emit("data", Buffer.from(JSON.stringify(result.data), "utf8"));
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}
