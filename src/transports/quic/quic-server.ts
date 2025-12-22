import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { loadQuicBinding, quicAvailable } from "./quic-binding";
import { MuxSession } from "../mux/mux-session";
import { MuxStream } from "../mux/mux-stream";
import { BatchFramer } from "../../core/batch-framer";
import {
  createFlowController,
  type FlowController,
} from "../../core/flow-controller";
import type { EntropyMetrics } from "../../handshake/entropy-policy";
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

const DEFAULT_QUIC_MAX_FRAME_LENGTH =
  Number(process.env.QW_QUIC_MAX_FRAME_LENGTH) || 16 * 1024 * 1024;
const DEFAULT_QUIC_FLOW_RATE_BYTES = 64 * 1024 * 1024;
const DEFAULT_QUIC_FLOW_BURST_BYTES = 8 * 1024 * 1024;
const DEFAULT_QUIC_MAX_FLUSH_BYTES = 4 * 1024 * 1024;
const DEFAULT_QUIC_MAX_FLUSH_BUFFERS = 1024;
const DEFAULT_QUIC_BATCH_MULTIPLIER = 4;
const DEFAULT_QUIC_MAX_SLICE = 256;

export interface QuicServerOptions extends Omit<QuicEndpointOptions, "port"> {
  host: string;
  port?: number; // 0 for ephemeral
  pollIntervalMs?: number;
  useMux?: boolean;
  maxFrameLength?: number;
  streamFraming?: "none" | "length-prefixed";
  protocolVersion?: string;
  verifyHandshake?: (payload: HandshakePayload) => boolean | Promise<boolean>;
  emitHandshakeMessages?: boolean;
}

export interface QuicServerStream {
  id: number;
  send: (data: Uint8Array, fin?: boolean) => void;
  sendMany?: (frames: Uint8Array[], fin?: boolean) => number;
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
  private muxFramer: BatchFramer | null = null;
  private muxFlowController: FlowController | null = null;
  private readonly useMux: boolean;
  private pendingWrites: Uint8Array[] = [];
  private muxDebugRecv = false;
  private handshakePending: boolean;
  private readonly pendingMuxData: Array<{ streamId: number; chunk: Uint8Array }> = [];
  private rawStreamHandlers = new Map<number, Set<(data: Uint8Array) => void>>();
  private rawStreams = new Map<number, QuicServerStream>();
  private rawPendingWrites = new Map<number, Uint8Array[]>();
  private streamPipelines = new Map<
    number,
    { framer: BatchFramer; flow: FlowController; decoder?: LengthPrefixedFramer }
  >();
  private readonly streamFraming: "none" | "length-prefixed";
  private readonly maxFrameLength: number;
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
    maxFrameLength: number,
    streamFraming: "none" | "length-prefixed",
  ) {
    super();
    this.useMux = useMux;
    if (this.useMux) {
      this.muxEncoder = new LengthPrefixedFramer({ maxFrameLength });
      this.muxDecoder = new LengthPrefixedFramer({ maxFrameLength });
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
    this.maxFrameLength = maxFrameLength;
    this.streamFraming = streamFraming;
    this.handshakeConfig = handshakeConfig;
    this.handshakePending = this.useMux && Boolean(
      handshakeConfig.protocolVersion || handshakeConfig.verifyHandshake,
    );
    if (this.useMux) {
      this.initMuxFlowControl();
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
    if (!this.useMux && this.streamFraming === "length-prefixed") {
      const pipeline = this.initStreamFlowControl(0, true);
      void pipeline.flow.enqueue(Buffer.from(data), pipeline.framer);
      return;
    }
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
    if (this.muxFramer && this.muxFlowController) {
      void this.muxFlowController.enqueue(Buffer.from(data), this.muxFramer);
      return;
    }
    if (!this.muxEncoder) {
      this.muxEncoder = new LengthPrefixedFramer({
        maxFrameLength: this.maxFrameLength,
      });
    }
    const framed = this.muxEncoder.encode(Buffer.from(data));
    this.sendRaw(framed);
  }

  private initMuxFlowControl(): void {
    if (this.muxFramer && this.muxFlowController) return;
    const pipeline = this.createFlowPipeline(0, false);
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
    const framer = new BatchFramer({ maxFrameLength: this.maxFrameLength });
    framer.setFlushHandler(buffers =>
      this.flushBuffersOnStream(streamId, buffers),
    );
    this.bindFlowToFramer(flow, framer);
    if (!withDecoder) return { framer, flow };
    const decoder = new LengthPrefixedFramer({ maxFrameLength: this.maxFrameLength });
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
      this.maxFrameLength,
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
    if (buffers.length === 0) return 0;
    try {
      let written = 0;
      if (typeof this.binding.writeManyStream === "function") {
        written = this.binding.writeManyStream(
          this.handle,
          streamId,
          buffers,
          false,
        );
      } else {
        for (const buf of buffers) {
          const sent = this.binding.writeStream(
            this.handle,
            streamId,
            buf,
            false,
          );
          written += sent;
          if (sent < buf.length) break;
        }
      }
      if (typeof this.binding.flush === "function") {
        this.binding.flush(this.handle);
      }
      return written;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return 0;
    }
  }

  private resolveEntropyMetrics(): EntropyMetrics {
    if (this.handshake?.entropyMetrics) {
      return this.handshake.entropyMetrics;
    }
    if (typeof this.handshake?.nIndex === "number") {
      return { negIndex: this.handshake.nIndex };
    }
    return { negIndex: 0.9 };
  }

  async openStream(opts?: {
    bidirectional?: boolean;
    framing?: "none" | "length-prefixed";
  }): Promise<{
    id: number;
    send: (data: Uint8Array) => void | Promise<void>;
    sendMany?: (frames: Uint8Array[]) => number;
    onData: (cb: (data: Uint8Array) => void) => void;
    close?: () => void | Promise<void>;
  }> {
    const id = this.binding.openStream(this.handle, {
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
          const written = this.binding.writeStream(this.handle, id, data, false);
          if (typeof this.binding.flush === "function") {
            this.binding.flush(this.handle);
          }
          return written;
        } catch (err) {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
          return 0;
        }
      },
      sendMany: (frames: Uint8Array[]) => {
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
          if (typeof this.binding.writeManyStream === "function") {
            const written = this.binding.writeManyStream(this.handle, id, frames, false);
            if (typeof this.binding.flush === "function") {
              this.binding.flush(this.handle);
            }
            return written;
          }
          let total = 0;
          for (const frame of frames) {
            total += this.binding.writeStream(this.handle, id, frame, false);
          }
          if (typeof this.binding.flush === "function") {
            this.binding.flush(this.handle);
          }
          return total;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Done") || msg.includes("StreamLimit")) {
            return 0;
          }
          this.emit("error", err instanceof Error ? err : new Error(msg));
          return 0;
        }
      },
      onData: (cb: (data: Uint8Array) => void) => {
        this.on(`stream:${id}`, cb);
      },
      close: () => {
        this.streamPipelines.delete(id);
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
          this.ensureRawStream(streamId);
          this.handleStreamChunk(streamId, chunk);
        }
      }
    }
    this.flushPendingWrites();
    this.flushRawWrites();
  }

  close(): void {
    try {
      this.binding.closeConnection(this.handle, 0, "server-close");
    } catch {
      /* ignore */
    }
    this.rawStreamHandlers.clear();
    this.rawStreams.clear();
    this.rawPendingWrites.clear();
    this.streamPipelines.clear();
    this.muxFramer = null;
    this.muxFlowController = null;
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

  private ensureRawStream(streamId: number): QuicServerStream {
    const existing = this.rawStreams.get(streamId);
    if (existing) return existing;
    const pipeline =
      this.streamFraming === "length-prefixed"
        ? this.initStreamFlowControl(streamId, true)
        : null;
    const stream: QuicServerStream = {
      id: streamId,
      send: (data: Uint8Array, fin?: boolean) => {
        if (pipeline) {
          void pipeline.flow.enqueue(Buffer.from(data), pipeline.framer);
          return data.length;
        }
        try {
          if (this.rawPendingWrites.has(streamId)) {
            this.queueRawWrite(streamId, data);
            return 0;
          }
          const written = this.binding.writeStream(
            this.handle,
            streamId,
            data,
            fin ?? false,
          );
          if (written < data.length) {
            this.queueRawWrite(streamId, data.subarray(written));
          }
          if (typeof this.binding.flush === "function") {
            this.binding.flush(this.handle);
          }
          return written;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Done") || msg.includes("StreamLimit")) {
            this.queueRawWrite(streamId, data);
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
          if (typeof this.binding.writeManyStream === "function") {
            const written = this.binding.writeManyStream(
              this.handle,
              streamId,
              frames,
              fin ?? false,
            );
            if (typeof this.binding.flush === "function") {
              this.binding.flush(this.handle);
            }
            const remaining = this.consumeWritten(frames, written);
            if (remaining.length > 0) {
              this.queueRawWrite(streamId, remaining[0]);
              for (let i = 1; i < remaining.length; i++) {
                this.queueRawWrite(streamId, remaining[i]);
              }
            }
            return written;
          }
          let total = 0;
          for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const written = this.binding.writeStream(
              this.handle,
              streamId,
              frame,
              false,
            );
            total += written;
            if (written < frame.length) {
              this.queueRawWrite(streamId, frame.subarray(written));
              for (let j = i + 1; j < frames.length; j++) {
                this.queueRawWrite(streamId, frames[j]);
              }
              break;
            }
          }
          if (typeof this.binding.flush === "function") {
            this.binding.flush(this.handle);
          }
          return total;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Done") || msg.includes("StreamLimit")) {
            this.queueRawWrite(streamId, frames[0]);
            for (let i = 1; i < frames.length; i++) {
              this.queueRawWrite(streamId, frames[i]);
            }
            return 0;
          }
          this.emit("error", err instanceof Error ? err : new Error(msg));
          return 0;
        }
      },
      onData: (cb: (data: Uint8Array) => void) => {
        const set = this.rawStreamHandlers.get(streamId);
        if (set) {
          set.add(cb);
        } else {
          this.rawStreamHandlers.set(streamId, new Set([cb]));
        }
      },
      close: () => {
        try {
          if (this.binding.closeStream) {
            this.binding.closeStream(this.handle, streamId);
          }
        } catch {
          /* ignore */
        }
      },
    };
    this.rawStreams.set(streamId, stream);
    this.emit("rawStream", stream);
    return stream;
  }

  private dispatchRawStreamData(streamId: number, chunk: Uint8Array): void {
    const handlers = this.rawStreamHandlers.get(streamId);
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
    this.dispatchRawStreamData(streamId, chunk);
    if (!this.useMux && streamId === 0) {
      this.emit("data", chunk);
    }
    this.emit(`stream:${streamId}`, chunk);
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

  private queueRawWrite(streamId: number, data: Uint8Array): void {
    const queue = this.rawPendingWrites.get(streamId);
    if (queue) {
      queue.push(data);
    } else {
      this.rawPendingWrites.set(streamId, [data]);
    }
  }

  private flushRawWrites(): void {
    if (this.rawPendingWrites.size === 0) return;
    let didWrite = false;
    for (const [streamId, queue] of this.rawPendingWrites.entries()) {
      let idx = 0;
      while (idx < queue.length) {
        const buf = queue[idx];
        try {
          const written = this.binding.writeStream(
            this.handle,
            streamId,
            buf,
            false,
          );
          didWrite = true;
          if (written < buf.length) {
            queue[idx] = buf.subarray(written);
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
        queue.splice(0, idx);
      }
      if (queue.length === 0) {
        this.rawPendingWrites.delete(streamId);
      }
    }
    if (didWrite && typeof this.binding.flush === "function") {
      this.binding.flush(this.handle);
    }
  }

  private consumeWritten(
    frames: Uint8Array[],
    bytesWritten: number,
  ): Uint8Array[] {
    if (bytesWritten <= 0) return frames;
    let remainingBytes = bytesWritten;
    let idx = 0;
    while (idx < frames.length && remainingBytes >= frames[idx].length) {
      remainingBytes -= frames[idx].length;
      idx += 1;
    }
    if (idx >= frames.length) return [];
    const remainder: Uint8Array[] = [];
    if (remainingBytes > 0) {
      remainder.push(frames[idx].subarray(remainingBytes));
      idx += 1;
    }
    for (; idx < frames.length; idx++) remainder.push(frames[idx]);
    return remainder;
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
      maxFrameLength: opts.maxFrameLength ?? DEFAULT_QUIC_MAX_FRAME_LENGTH,
      streamFraming: opts.streamFraming ?? "none",
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
      }, this.opts.useMux, this.opts.maxFrameLength, this.opts.streamFraming);
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
