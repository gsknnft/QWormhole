import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import { MuxSession } from "../mux/mux-session";
import { MuxStream } from "../mux/mux-stream";
import type {
  QuicBinding,
  QuicConnectionStats,
  QuicEndpointOptions,
  QuicStreamOptions,
} from "./types";
import type { QWormholeTransport } from "../transport";
import { handshakePayloadSchema, type HandshakePayload } from "../../schema/scp";
import { isNegentropicHandshake, verifyNegentropicHandshake } from "../../handshake/negentropic-handshake";
import { LengthPrefixedFramer } from "../../core/framing";

export interface QuicServerOptions extends Omit<QuicEndpointOptions, "port"> {
  host: string;
  port?: number; // 0 for ephemeral
  pollIntervalMs?: number;
  useMux?: boolean;
  protocolVersion?: string;
  verifyHandshake?: (payload: HandshakePayload) => boolean | Promise<boolean>;
  emitHandshakeMessages?: boolean;
}

export interface QuicServerStream {
  id: number;
  send: (data: Uint8Array, fin?: boolean) => void;
  onData: (cb: (data: Uint8Array) => void) => void;
  close: () => void;
}

class QuicServerConnection extends EventEmitter implements QWormholeTransport {
  readonly type = "quic" as const;
  public mux: MuxSession | null = null;
  private defaultMuxStream: MuxStream | null = null;
  public handshake?: HandshakePayload;
  private muxDecoder: LengthPrefixedFramer | null = null;
  private muxEncoder: LengthPrefixedFramer | null = null;
  private readonly useMux: boolean;
  private pendingWrites: Uint8Array[] = [];
  private muxDebugRecv = false;
  private handshakePending: boolean;
  private readonly pendingMuxData: Array<{ streamId: number; chunk: Uint8Array }> = [];
  private readonly handshakeConfig: {
    protocolVersion?: string;
    verifyHandshake?: (payload: HandshakePayload) => boolean | Promise<boolean>;
    emitHandshakeMessages?: boolean;
  };
  constructor(
    private binding: QuicBinding,
    private endpoint: unknown,
    public readonly handle: unknown,
    handshakeConfig: {
      protocolVersion?: string;
      verifyHandshake?: (payload: HandshakePayload) => boolean | Promise<boolean>;
      emitHandshakeMessages?: boolean;
    },
    useMux: boolean,
  ) {
    super();
    this.useMux = useMux;
    if (this.useMux) {
      this.muxEncoder = new LengthPrefixedFramer();
      this.muxDecoder = new LengthPrefixedFramer();
      const debug = process.env.QW_QUIC_DEBUG === "1";
      let logged = false;
      this.muxDecoder.on("message", frame => {
        if (debug && !logged) {
          logged = true;
          console.warn("[qwquic:mux] server frame", { len: frame.length });
        }
        this.mux?.receiveRaw(frame);
      });
      this.muxDecoder.on("error", err => this.emit("error", err));
      this.mux = new MuxSession(buf => this.sendMuxFrame(buf));
    }
    this.handshakeConfig = handshakeConfig;
    this.handshakePending = this.useMux && Boolean(
      handshakeConfig.protocolVersion || handshakeConfig.verifyHandshake,
    );
    if (this.useMux) {
      this.attachMuxHandlers();
    }
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  send(data: Uint8Array): void {
    if (this.useMux && this.mux) {
      if (!this.defaultMuxStream) {
        this.defaultMuxStream = this.mux.createStream();
      }
      this.defaultMuxStream.write(data);
      return;
    }
    this.sendRaw(data);
  }

  private sendRaw(data: Uint8Array): void {
    if (this.pendingWrites.length > 0) {
      this.pendingWrites.push(data);
      return;
    }
    try {
      const written = this.binding.writeStream(this.handle, 0, data, false);
      if (written < data.length) {
        this.pendingWrites.unshift(data.subarray(written));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Done") || msg.includes("StreamLimit")) {
        this.pendingWrites.push(data);
        return;
      }
      // surface recoverable errors as events instead of crashing loops
      this.emit("error", err instanceof Error ? err : new Error(msg));
    }
  }

  private sendMuxFrame(data: Uint8Array): void {
    if (!this.muxEncoder) {
      this.muxEncoder = new LengthPrefixedFramer();
    }
    const framed = this.muxEncoder.encode(Buffer.from(data));
    this.sendRaw(framed);
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
        if (this.useMux && this.mux && this.muxDecoder && streamId === 0) {
          if (process.env.QW_QUIC_DEBUG === "1" && !this.muxDebugRecv) {
            this.muxDebugRecv = true;
            const head = Buffer.from(chunk.subarray(0, 8)).toString("hex");
            console.warn("[qwquic:mux] server recv head", { len: chunk.length, head });
          }
          this.muxDecoder.push(Buffer.from(chunk));
        } else {
          this.emit(streamId === 0 ? "data" : `stream:${streamId}`, chunk);
        }
      }
    }
    this.flushPendingWrites();
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

  private flushPendingWrites(): void {
    if (this.pendingWrites.length === 0) return;
    let idx = 0;
    while (idx < this.pendingWrites.length) {
      const buf = this.pendingWrites[idx];
      try {
        const written = this.binding.writeStream(this.handle, 0, buf, false);
        if (written < buf.length) {
          this.pendingWrites[idx] = buf.subarray(written);
          break;
        }
        idx += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Done") || msg.includes("StreamLimit")) {
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

  private attachMuxHandlers(): void {
    if (!this.mux) return;
    const debug = process.env.QW_QUIC_DEBUG === "1";
    this.mux.on("stream", stream => {
      if (debug) {
        console.warn("[qwquic:mux] server stream", { id: stream.id });
      }
      if (stream.id === 0) {
        stream.on("data", (data: Uint8Array) => void this.handleHandshakeData(data));
        return;
      }
      if (!this.defaultMuxStream) {
        this.defaultMuxStream = stream;
      }
      let logged = false;
      stream.on("data", (chunk: any) => {
        if (debug && !logged) {
          logged = true;
          console.warn("[qwquic:mux] server stream data", {
            id: stream.id,
            len: chunk?.length ?? 0,
          });
        }
        if (this.handshakePending) {
          this.pendingMuxData.push({ streamId: stream.id, chunk });
          return;
        }
        this.emit("data", chunk);
        this.emit(`stream:${stream.id}`, chunk);
      });
      this.emit("stream", stream);
    });
  }

  private async handleHandshakeData(data: Uint8Array): Promise<void> {
    try {
      const parsed = JSON.parse(Buffer.from(data).toString("utf8"));
      const result = handshakePayloadSchema.safeParse(parsed);
      if (!result.success) {
        this.emit("error", new Error("Invalid handshake payload"));
        this.close();
        return;
      }
      const payload = result.data;
      if (
        this.handshakeConfig.protocolVersion &&
        payload.version &&
        payload.version !== this.handshakeConfig.protocolVersion
      ) {
        this.emit("error", new Error("Protocol version mismatch"));
        this.close();
        return;
      }
      if (
        isNegentropicHandshake(payload) &&
        !verifyNegentropicHandshake(payload)
      ) {
        this.emit("error", new Error("Invalid negentropic handshake signature"));
        this.close();
        return;
      }
      if (this.handshakeConfig.verifyHandshake) {
        const ok = await this.handshakeConfig.verifyHandshake(payload);
        if (!ok) {
          this.emit("error", new Error("Handshake rejected"));
          this.close();
          return;
        }
      }
      this.handshake = payload;
      this.handshakePending = false;
      this.emit("handshake", payload);
      if (this.handshakeConfig.emitHandshakeMessages) {
        this.emit("data", Buffer.from(JSON.stringify(payload), "utf8"));
      }
      while (this.pendingMuxData.length > 0) {
        const item = this.pendingMuxData.shift();
        if (!item) break;
        this.emit("data", item.chunk);
        this.emit(`stream:${item.streamId}`, item.chunk);
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.close();
    }
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
    const muxDefault = Boolean(
      opts.protocolVersion || opts.verifyHandshake || opts.emitHandshakeMessages,
    );
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 5,
      port: opts.port ?? 0,
      ...opts,
      useMux: opts.useMux ?? muxDefault,
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
      const conn = new QuicServerConnection(this.binding, this.endpoint, res.handle, {
        protocolVersion: this.opts.protocolVersion,
        verifyHandshake: this.opts.verifyHandshake,
        emitHandshakeMessages: this.opts.emitHandshakeMessages,
      }, this.opts.useMux);
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
