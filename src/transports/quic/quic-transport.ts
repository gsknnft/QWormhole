import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import type { QWormholeTransport } from "../transport";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import { MuxSession } from "../mux/mux-session";
import { MuxStream } from "../mux/mux-stream";
import { handshakePayloadSchema, type HandshakePayload } from "../../schema/scp";
import { LengthPrefixedFramer } from "../../core/framing";
import { BatchFramer } from "../../core/batch-framer";
import {
  createFlowController,
  type FlowController,
} from "../../core/flow-controller";
import type { EntropyMetrics } from "../../handshake/entropy-policy";
import type {
  QuicBinding,
  QuicConnectOptions,
  QuicConnectionStats,
  QuicEndpointOptions,
  QuicStreamOptions,
} from "./types";

const DEFAULT_QUIC_MAX_FRAME_LENGTH =
  Number(process.env.QW_QUIC_MAX_FRAME_LENGTH) || 16 * 1024 * 1024;
const DEFAULT_QUIC_FLOW_RATE_BYTES = 64 * 1024 * 1024;
const DEFAULT_QUIC_FLOW_BURST_BYTES = 8 * 1024 * 1024;
const DEFAULT_QUIC_MAX_FLUSH_BYTES = 4 * 1024 * 1024;
const DEFAULT_QUIC_MAX_FLUSH_BUFFERS = 1024;
const DEFAULT_QUIC_BATCH_MULTIPLIER = 4;
const DEFAULT_QUIC_MAX_SLICE = 256;

export interface QuicTransportOptions
  extends
    Omit<QuicEndpointOptions, "host" | "port">,
    Omit<QuicConnectOptions, "host" | "port"> {
  host: string;
  port: number;
  pollIntervalMs?: number; // add this
  useMux?: boolean;
  maxFrameLength?: number;
  streamFraming?: "none" | "length-prefixed";
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
  private readonly streamFraming: "none" | "length-prefixed";
  private binding: QuicBinding | null;
  private muxDecoder: LengthPrefixedFramer | null = null;
  private muxEncoder: LengthPrefixedFramer | null = null;
  private muxFramer: BatchFramer | null = null;
  private muxFlowController: FlowController | null = null;
  private muxDebugSent = false;
  private muxDebugRecv = false;

  private endpoint: unknown | null = null;
  private conn: unknown | null = null;
  private defaultStreamId: number | null = null;
  private peerHandshake: HandshakePayload | null = null;
  private defaultMuxStream: MuxStream | null = null;
  private pendingWrites: Uint8Array[] = [];
  private streamHandlers = new Map<number, Set<(data: Uint8Array) => void>>();
  private streamPipelines = new Map<
    number,
    { framer: BatchFramer; flow: FlowController; decoder?: LengthPrefixedFramer }
  >();

  constructor(opts: QuicTransportOptions) {
    super();
    const muxDefault = Boolean(
      opts.protocolVersion || opts.handshakeTags || opts.handshakeSigner,
    );
    this.opts = {
      pollIntervalMs: opts.pollIntervalMs ?? 5,
      ...opts,
      maxFrameLength: opts.maxFrameLength ?? DEFAULT_QUIC_MAX_FRAME_LENGTH,
      streamFraming: opts.streamFraming ?? "none",
      useMux: opts.useMux ?? muxDefault,
    } as Required<QuicTransportOptions>;
    this.useMux = opts.useMux ?? muxDefault;
    this.streamFraming = this.opts.streamFraming;
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
      this.muxEncoder = new LengthPrefixedFramer({
        maxFrameLength: this.opts.maxFrameLength,
      });
      this.muxDecoder = new LengthPrefixedFramer({
        maxFrameLength: this.opts.maxFrameLength,
      });
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
      this.initMuxFlowControl();
      this.attachMuxHandlers();
      await this.sendHandshakeIfNeeded();
      this.emit("mux", this.mux);
    }

    this.emit("connect");
  }

  async openStream(opts?: {
    bidirectional?: boolean;
    framing?: "none" | "length-prefixed";
  }) {
    if (!this.binding || !this.conn) {
      throw new Error("QUIC not connected");
    }

    const id = this.binding.openStream(this.conn, {
      bidirectional: opts?.bidirectional ?? true,
    } as QuicStreamOptions);
    const framing = opts?.framing ?? this.streamFraming;
    const pipeline =
      framing === "length-prefixed"
        ? this.initStreamFlowControl(id, true)
        : null;

    return {
      id,
      send: (data: Uint8Array) => {
        if (pipeline) {
          void pipeline.flow.enqueue(Buffer.from(data), pipeline.framer);
          return data.length;
        }
        try {
          const written = this.binding!.writeStream(this.conn!, id, data, false);
          if (typeof this.binding!.flush === "function") {
            this.binding!.flush(this.conn!);
          }
          return written;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("StreamLimit")) {
            setTimeout(() => this.binding!.writeStream(this.conn!, id, data, false), this.opts.pollIntervalMs);
            return 0;
          }
          this.emit("error", err instanceof Error ? err : new Error(msg));
          return 0;
        }
      },
      sendMany: (frames: Uint8Array[], fin?: boolean) => {
        if (!frames.length) return 0;
        if (pipeline) {
          let total = 0;
          for (const frame of frames) {
            total += frame.length;
            pipeline.framer.encodeToBatch(Buffer.from(frame));
          }
          void pipeline.flow.flushPending(pipeline.framer);
          return total;
        }
        try {
          if (typeof this.binding!.writeManyStream === "function") {
            const written = this.binding!.writeManyStream(
              this.conn!,
              id,
              frames,
              fin,
            );
            if (typeof this.binding!.flush === "function") {
              this.binding!.flush(this.conn!);
            }
            return written;
          }
          let total = 0;
          for (const frame of frames) {
            const written = this.binding!.writeStream(this.conn!, id, frame, false);
            total += written;
            if (written < frame.length) {
              break;
            }
          }
          if (typeof this.binding!.flush === "function") {
            this.binding!.flush(this.conn!);
          }
          return total;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("StreamLimit") || msg.includes("Done")) {
            return 0;
          }
          this.emit("error", err instanceof Error ? err : new Error(msg));
          return 0;
        }
      },
      onData: (cb: (data: Uint8Array) => void) => {
        this.registerStreamHandler(id, cb);
      },
      close: () => {
        this.streamPipelines.delete(id);
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
    if (!this.useMux && this.streamFraming === "length-prefixed") {
      const pipeline = this.initStreamFlowControl(this.defaultStreamId, true);
      void pipeline.flow.enqueue(Buffer.from(data), pipeline.framer);
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
    if (this.muxFramer && this.muxFlowController) {
      void this.muxFlowController.enqueue(Buffer.from(data), this.muxFramer);
      return;
    }
    const encoder =
      this.muxEncoder ??
      new LengthPrefixedFramer({ maxFrameLength: this.opts.maxFrameLength });
    this.muxEncoder = encoder;
    const framed = encoder.encode(Buffer.from(data));
    if (process.env.QW_QUIC_DEBUG === "1" && !this.muxDebugSent) {
      this.muxDebugSent = true;
      const head = Buffer.from(framed.subarray(0, 8)).toString("hex");
      console.warn("[qwquic:mux] client send head", { len: framed.length, head });
    }
    this.sendRaw(framed);
  }

  private initMuxFlowControl(): void {
    if (!this.binding || !this.conn || this.defaultStreamId === null) return;
    if (this.muxFramer && this.muxFlowController) return;
    const pipeline = this.createFlowPipeline(this.defaultStreamId, false);
    this.muxFramer = pipeline.framer;
    this.muxFlowController = pipeline.flow;
  }

  private initStreamFlowControl(
    streamId: number,
    withDecoder: boolean,
  ): { framer: BatchFramer; flow: FlowController; decoder?: LengthPrefixedFramer } {
    const existing = this.streamPipelines.get(streamId);
    if (existing) return existing;
    const pipeline = this.createFlowPipeline(streamId, withDecoder);
    this.streamPipelines.set(streamId, pipeline);
    return pipeline;
  }

  private createFlowPipeline(
    streamId: number,
    withDecoder: boolean,
  ): { framer: BatchFramer; flow: FlowController; decoder?: LengthPrefixedFramer } {
    const metrics = this.resolveEntropyMetrics();
    const flow = this.buildFlowController(metrics);
    const framer = new BatchFramer({
      maxFrameLength: this.opts.maxFrameLength,
    });
    framer.setFlushHandler(buffers =>
      this.flushBuffersOnStream(streamId, buffers),
    );
    this.bindFlowToFramer(flow, framer);
    if (!withDecoder) return { framer, flow };
    const decoder = new LengthPrefixedFramer({
      maxFrameLength: this.opts.maxFrameLength,
    });
    decoder.on("message", frame => this.emitStreamPayload(streamId, frame));
    decoder.on("error", err => this.emit("error", err));
    return { framer, flow, decoder };
  }

  private bindFlowToFramer(flow: FlowController, framer: BatchFramer): void {
    const tune = () => this.tuneQuicFramer(flow, framer);
    framer.on("backpressure", ({ queuedBytes }) => {
      flow.onBackpressure(queuedBytes);
      tune();
    });
    framer.on("drain", () => {
      flow.onDrain();
      tune();
    });
    framer.on("flush", ({ bufferCount, totalBytes }) => {
      flow.handleFlushMetrics(bufferCount, totalBytes);
      tune();
    });
    flow.on("sliceDrift", tune);
    tune();
  }

  private buildFlowController(metrics: EntropyMetrics): FlowController {
    return createFlowController(metrics, {
      peerIsNative: true,
      rateBytesPerSec: DEFAULT_QUIC_FLOW_RATE_BYTES,
      burstBudgetBytes: DEFAULT_QUIC_FLOW_BURST_BYTES,
      bounds: { minSlice: 8, maxSlice: DEFAULT_QUIC_MAX_SLICE },
      adaptiveConfig: {
        sampleEvery: 16,
        adaptEvery: 16,
        driftStep: 8,
      },
    });
  }

  private tuneQuicFramer(flow: FlowController, framer: BatchFramer): void {
    const caps = flow.resolveFramerCaps(true);
    const maxFlushBytes = Math.min(
      this.opts.maxFrameLength,
      DEFAULT_QUIC_MAX_FLUSH_BYTES,
    );
    const maxBuffers = Math.min(
      DEFAULT_QUIC_MAX_FLUSH_BUFFERS,
      Math.max(caps.maxBuffers * DEFAULT_QUIC_BATCH_MULTIPLIER, 64),
    );
    const maxBytes = Math.min(
      maxFlushBytes,
      Math.max(caps.maxBytes * DEFAULT_QUIC_BATCH_MULTIPLIER, 512 * 1024),
    );
    const batchSize = Math.max(
      8,
      Math.round(flow.currentSliceSize * DEFAULT_QUIC_BATCH_MULTIPLIER),
    );
    framer.setBatchTiming(batchSize, Math.max(caps.flushMs, 1));
    framer.setFlushCaps(maxBuffers, maxBytes);
  }

  private flushBuffersOnStream(streamId: number, buffers: Buffer[]): number {
    if (!this.binding || !this.conn) return 0;
    if (buffers.length === 0) return 0;
    try {
      let written = 0;
      if (typeof this.binding.writeManyStream === "function") {
        written = this.binding.writeManyStream(
          this.conn,
          streamId,
          buffers,
          false,
        );
      } else {
        for (const buf of buffers) {
          const sent = this.binding.writeStream(
            this.conn,
            streamId,
            buf,
            false,
          );
          written += sent;
          if (sent < buf.length) break;
        }
      }
      if (typeof this.binding.flush === "function") {
        this.binding.flush(this.conn);
      }
      return written;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return 0;
    }
  }

  private resolveEntropyMetrics(): EntropyMetrics {
    if (this.peerHandshake?.entropyMetrics) {
      return this.peerHandshake.entropyMetrics;
    }
    if (typeof this.peerHandshake?.nIndex === "number") {
      return { negIndex: this.peerHandshake.nIndex };
    }
    return { negIndex: 0.9 };
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
            this.handleStreamChunk(streamId, chunk);
          }
        }
      }
    }

  private registerStreamHandler(
    streamId: number,
    cb: (data: Uint8Array) => void,
  ): void {
    const existing = this.streamHandlers.get(streamId);
    if (existing) {
      existing.add(cb);
      return;
    }
    this.streamHandlers.set(streamId, new Set([cb]));
  }

  private dispatchStreamData(streamId: number, chunk: Uint8Array): void {
    const handlers = this.streamHandlers.get(streamId);
    if (!handlers || handlers.size === 0) return;
    for (const cb of handlers) {
      try {
        cb(chunk);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private emitStreamPayload(streamId: number, chunk: Uint8Array): void {
    this.dispatchStreamData(streamId, chunk);
    this.emit("data", chunk);
  }

  private handleStreamChunk(streamId: number, chunk: Uint8Array): void {
    let pipeline = this.streamPipelines.get(streamId);
    if (!pipeline && this.streamFraming === "length-prefixed") {
      pipeline = this.initStreamFlowControl(streamId, true);
    }
    if (pipeline?.decoder) {
      pipeline.decoder.push(Buffer.from(chunk));
      return;
    }
    this.emitStreamPayload(streamId, chunk);
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
    this.muxFramer = null;
    this.muxFlowController = null;
    this.mux = null;
    this.pendingWrites = [];
    this.streamHandlers.clear();
    this.streamPipelines.clear();

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
