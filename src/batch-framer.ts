/**
 * BatchFramer - Zero-copy framing with writev() batching
 *
 * Implements high-performance message batching for QWormhole 0.3.0 roadmap:
 * - Preallocated buffer rings for zero-copy framing
 * - writev() batching to reduce syscall overhead
 * - Configurable batch sizes based on entropy policy
 *
 * Performance target: ≤ 150 ms for 10k messages in TS-to-TS topology
 */

import net from "node:net";
import { TypedEventEmitter } from "./typedEmitter";

const HEADER_LENGTH = 4;
const DEFAULT_MAX_FRAME_LENGTH = 4 * 1024 * 1024; // 4 MiB
const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_RING_SIZE = 128;
const DEFAULT_FLUSH_INTERVAL_MS = 1;

interface BatchFramerEvents {
  message: Buffer;
  error: Error;
  flush: { bufferCount: number; totalBytes: number };
  drain: void;
}

export interface BatchFramerOptions {
  /** Maximum frame length in bytes (default: 4 MiB) */
  maxFrameLength?: number;
  /** Maximum number of frames to batch before flush (default: 64) */
  batchSize?: number;
  /** Size of the preallocated buffer ring (default: 128) */
  ringSize?: number;
  /** Flush interval in ms for partial batches (default: 1ms) */
  flushIntervalMs?: number;
  /** Enable writev batching (default: true) */
  enableWritev?: boolean;
}

/**
 * Preallocated buffer slot in the ring buffer
 */
interface RingSlot {
  buffer: Buffer;
  length: number;
  inUse: boolean;
}

/**
 * BatchFramer provides high-performance message framing with batching
 */
export class BatchFramer extends TypedEventEmitter<BatchFramerEvents> {
  private readonly maxFrameLength: number;
  private readonly batchSize: number;
  private readonly enableWritev: boolean;
  private readonly flushIntervalMs: number;

  // Ring buffer for preallocated buffers
  private readonly ring: RingSlot[];
  private ringHead = 0;

  // Incoming data buffer
  private inBuffer: Buffer = Buffer.alloc(0);

  // Outgoing batch queue
  private outBatch: Buffer[] = [];
  private outBatchBytes = 0;
  private flushTimer?: NodeJS.Timeout;
  private socket?: net.Socket;
  private draining = false;

  constructor(options?: BatchFramerOptions) {
    super();
    this.maxFrameLength = options?.maxFrameLength ?? DEFAULT_MAX_FRAME_LENGTH;
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.enableWritev = options?.enableWritev ?? true;
    this.flushIntervalMs = options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    // Initialize ring buffer
    const ringSize = options?.ringSize ?? DEFAULT_RING_SIZE;
    this.ring = Array.from({ length: ringSize }, () => ({
      buffer: Buffer.allocUnsafe(HEADER_LENGTH + 1024), // Start with 1KB slots
      length: 0,
      inUse: false,
    }));
  }

  /**
   * Attach a socket for writev operations
   */
  attachSocket(socket: net.Socket): void {
    this.socket = socket;
    socket.on("drain", () => {
      this.draining = false;
      this.emit("drain", undefined as never);
      void this.flushBatch();
    });
  }

  /**
   * Detach the socket
   */
  detachSocket(): void {
    this.clearFlushTimer();
    this.socket = undefined;
  }

  /**
   * Encode a payload with length prefix (zero-copy when possible)
   */
  encode(payload: Buffer): Buffer {
    const slot = this.acquireSlot(HEADER_LENGTH + payload.length);
    slot.buffer.writeUInt32BE(payload.length, 0);
    payload.copy(slot.buffer, HEADER_LENGTH);
    slot.length = HEADER_LENGTH + payload.length;

    // Return a view of the slot buffer
    return slot.buffer.subarray(0, slot.length);
  }

  /**
   * Encode payload and add to batch queue
   */
  encodeToBatch(payload: Buffer): void {
    const framed = this.encode(payload);
    this.outBatch.push(framed);
    this.outBatchBytes += framed.length;

    if (this.outBatch.length >= this.batchSize) {
      void this.flushBatch();
    } else if (!this.flushTimer && this.flushIntervalMs > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flushBatch();
      }, this.flushIntervalMs);
    }
  }

  /**
   * Flush the current batch to the socket
   */
  async flushBatch(): Promise<void> {
    this.clearFlushTimer();

    if (this.outBatch.length === 0 || !this.socket || this.draining) {
      return;
    }

    const buffers = this.outBatch;
    const totalBytes = this.outBatchBytes;
    this.outBatch = [];
    this.outBatchBytes = 0;

    this.emit("flush", { bufferCount: buffers.length, totalBytes });

    if (this.enableWritev && buffers.length > 1) {
      // Use writev for batched writes
      await this.writevBatch(buffers);
    } else {
      // Fall back to single write with concatenated buffer
      const combined = Buffer.concat(buffers);
      await this.writeBuffer(combined);
    }

    // Release slots back to the ring
    for (let i = 0; i < this.ring.length; i++) {
      this.ring[i].inUse = false;
    }
  }

  /**
   * Write buffers using writev
   */
  private async writevBatch(buffers: Buffer[]): Promise<void> {
    if (!this.socket || this.socket.destroyed) return;

    return new Promise<void>((resolve, reject) => {
      const socket = this.socket!;

      // Node.js socket.cork() + multiple writes + uncork() is effectively writev
      socket.cork();
      for (const buf of buffers) {
        const canWrite = socket.write(buf);
        if (!canWrite) {
          this.draining = true;
        }
      }
      // Use queueMicrotask to ensure uncork happens after all writes are queued
      queueMicrotask(() => socket.uncork());

      if (this.draining) {
        socket.once("drain", () => {
          this.draining = false;
          resolve();
        });
        socket.once("error", reject);
      } else {
        resolve();
      }
    });
  }

  /**
   * Write a single buffer
   */
  private async writeBuffer(buffer: Buffer): Promise<void> {
    if (!this.socket || this.socket.destroyed) return;

    return new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      const canWrite = socket.write(buffer);

      if (!canWrite) {
        this.draining = true;
        socket.once("drain", () => {
          this.draining = false;
          resolve();
        });
        socket.once("error", reject);
      } else {
        resolve();
      }
    });
  }

  /**
   * Push incoming data for parsing
   */
  push(chunk: Buffer): void {
    this.inBuffer = Buffer.concat([this.inBuffer, chunk]);

    while (this.inBuffer.length >= HEADER_LENGTH) {
      const frameLength = this.inBuffer.readUInt32BE(0);

      if (frameLength > this.maxFrameLength) {
        this.inBuffer = Buffer.alloc(0);
        this.emit(
          "error",
          new Error(`Frame length ${frameLength} exceeds limit ${this.maxFrameLength}`),
        );
        return;
      }

      if (this.inBuffer.length < HEADER_LENGTH + frameLength) break;

      const start = HEADER_LENGTH;
      const end = HEADER_LENGTH + frameLength;
      const frame = this.inBuffer.subarray(start, end);
      this.inBuffer = this.inBuffer.subarray(end);
      this.emit("message", frame);
    }
  }

  /**
   * Reset the framer state
   */
  reset(): void {
    this.inBuffer = Buffer.alloc(0);
    this.outBatch = [];
    this.outBatchBytes = 0;
    this.clearFlushTimer();
    for (const slot of this.ring) {
      slot.inUse = false;
      slot.length = 0;
    }
  }

  /**
   * Get current batch size
   */
  get pendingBatchSize(): number {
    return this.outBatch.length;
  }

  /**
   * Get current batch bytes
   */
  get pendingBatchBytes(): number {
    return this.outBatchBytes;
  }

  /**
   * Acquire a slot from the ring buffer
   */
  private acquireSlot(requiredSize: number): RingSlot {
    // Find an available slot
    for (let i = 0; i < this.ring.length; i++) {
      const idx = (this.ringHead + i) % this.ring.length;
      const slot = this.ring[idx];

      if (!slot.inUse) {
        // Resize if needed
        if (slot.buffer.length < requiredSize) {
          slot.buffer = Buffer.allocUnsafe(requiredSize);
        }
        slot.inUse = true;
        this.ringHead = (idx + 1) % this.ring.length;
        return slot;
      }
    }

    // All slots in use, allocate a new buffer (fallback)
    return {
      buffer: Buffer.allocUnsafe(requiredSize),
      length: 0,
      inUse: true,
    };
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

/**
 * Create a batch framer with entropy-policy-aware defaults
 */
export function createBatchFramer(
  batchSize?: number,
  options?: Omit<BatchFramerOptions, "batchSize">,
): BatchFramer {
  return new BatchFramer({
    ...options,
    batchSize: batchSize ?? DEFAULT_BATCH_SIZE,
  });
}
