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
  backpressure: { queuedBytes: number };
}

export interface BatchFramerStats {
  totalFrames: number;
  totalFlushes: number;
  totalBytes: number;
  pendingFrames: number;
  pendingBytes: number;
  lastFlushTimestamp?: number;
  backpressureEvents: number;
  lastBackpressureBytes?: number;
  lastBackpressureTimestamp?: number;
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
  // Track which ring slots are used by current batch
  private outBatchSlotIndices: number[] = [];
  private flushTimer?: NodeJS.Timeout;
  private socket?: net.Socket;
  private draining = false;
  private drainListener?: () => void;
  private totalFrames = 0;
  private totalFlushes = 0;
  private totalBytes = 0;
  private lastFlushTimestamp?: number;
  private backpressureEvents = 0;
  private lastBackpressureBytes?: number;
  private lastBackpressureTimestamp?: number;

  constructor(options?: BatchFramerOptions) {
    super();
    this.maxFrameLength = options?.maxFrameLength ?? DEFAULT_MAX_FRAME_LENGTH;
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.enableWritev = options?.enableWritev ?? true;
    this.flushIntervalMs =
      options?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

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
    if (this.socket && this.drainListener) {
      this.socket.off("drain", this.drainListener);
    }
    this.socket = socket;
    this.drainListener = () => {
      this.draining = false;
      this.emit("drain", undefined as never);
      void this.flushBatch();
    };
    socket.on("drain", this.drainListener);
  }

  /**
   * Detach the socket
   */
  detachSocket(): void {
    this.clearFlushTimer();
    if (this.socket && this.drainListener) {
      this.socket.off("drain", this.drainListener);
    }
    this.drainListener = undefined;
    this.draining = false;
    this.socket = undefined;
  }

  /**
   * Encode a payload with length prefix (zero-copy when possible)
   */
  encode(payload: Buffer): Buffer {
    const { slot, index } = this.acquireSlot(HEADER_LENGTH + payload.length);
    slot.buffer.writeUInt32BE(payload.length, 0);
    payload.copy(slot.buffer, HEADER_LENGTH);
    slot.length = HEADER_LENGTH + payload.length;

    // Track the slot index for later release
    if (index >= 0) {
      this.outBatchSlotIndices.push(index);
    }

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
    this.totalFrames += 1;

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

    if (this.outBatch.length === 0 || this.draining) {
      return;
    }

    const buffers = this.outBatch;
    const totalBytes = this.outBatchBytes;
    const slotIndices = this.outBatchSlotIndices;
    this.outBatch = [];
    this.outBatchBytes = 0;
    this.outBatchSlotIndices = [];

    this.emit("flush", { bufferCount: buffers.length, totalBytes });
    this.totalFlushes += 1;
    this.totalBytes += totalBytes;
    this.lastFlushTimestamp = Date.now();

    if (!this.socket || this.socket.destroyed) {
      this.releaseSlots(slotIndices);
      return;
    }

    try {
      if (this.enableWritev && buffers.length > 1) {
        await this.writevBatch(buffers);
      } else {
        const combined = Buffer.concat(buffers);
        await this.writeBuffer(combined);
      }
    } finally {
      this.releaseSlots(slotIndices);
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
          this.handleBackpressure(socket.writableLength);
        }
      }
      // Use queueMicrotask to ensure uncork happens after all writes are queued
      queueMicrotask(() => socket.uncork());

      if (this.draining) {
        // Cleanup function to remove all listeners
        const cleanup = () => {
          socket.off("drain", onDrain);
          socket.off("error", onError);
          socket.off("close", onClose);
        };

        const onDrain = () => {
          cleanup();
          this.draining = false;
          resolve();
        };

        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };

        const onClose = () => {
          cleanup();
          reject(new Error("Socket closed while waiting for drain"));
        };

        socket.once("drain", onDrain);
        socket.once("error", onError);
        socket.once("close", onClose);
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
        this.handleBackpressure(socket.writableLength);

        // Cleanup function to remove all listeners
        const cleanup = () => {
          socket.off("drain", onDrain);
          socket.off("error", onError);
          socket.off("close", onClose);
        };

        const onDrain = () => {
          cleanup();
          this.draining = false;
          resolve();
        };

        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };

        const onClose = () => {
          cleanup();
          reject(new Error("Socket closed while waiting for drain"));
        };

        socket.once("drain", onDrain);
        socket.once("error", onError);
        socket.once("close", onClose);
      } else {
        resolve();
      }
    });
  }

  private handleBackpressure(queuedBytes: number): void {
    const entering = !this.draining;
    if (entering) {
      this.backpressureEvents += 1;
      this.lastBackpressureTimestamp = Date.now();
      this.lastBackpressureBytes = queuedBytes;
      this.draining = true;
    }
    this.emit("backpressure", { queuedBytes });
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
          new Error(
            `Frame length ${frameLength} exceeds limit ${this.maxFrameLength}`,
          ),
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
    this.outBatchSlotIndices = [];
    this.clearFlushTimer();
    for (const slot of this.ring) {
      slot.inUse = false;
      slot.length = 0;
    }
  }

  getStats(): BatchFramerStats {
    return {
      totalFrames: this.totalFrames,
      totalFlushes: this.totalFlushes,
      totalBytes: this.totalBytes,
      pendingFrames: this.outBatch.length,
      pendingBytes: this.outBatchBytes,
      lastFlushTimestamp: this.lastFlushTimestamp,
      backpressureEvents: this.backpressureEvents,
      lastBackpressureBytes: this.lastBackpressureBytes,
      lastBackpressureTimestamp: this.lastBackpressureTimestamp,
    };
  }

  private resetStats(): void {
    this.totalFrames = 0;
    this.totalFlushes = 0;
    this.totalBytes = 0;
    this.lastFlushTimestamp = undefined;
    this.backpressureEvents = 0;
    this.lastBackpressureBytes = undefined;
    this.lastBackpressureTimestamp = undefined;
  }

  async snapshot(options?: { reset?: boolean }): Promise<BatchFramerStats> {
    await this.flushBatch();
    const stats = this.getStats();
    if (options?.reset) {
      this.resetStats();
    }
    return stats;
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
   * Check if the framer has a connected socket for flushing
   */
  get canFlush(): boolean {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  /**
   * Acquire a slot from the ring buffer, returns slot and its index
   */
  private acquireSlot(requiredSize: number): { slot: RingSlot; index: number } {
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
        return { slot, index: idx };
      }
    }

    // All slots in use, allocate a new buffer (fallback)
    // Return -1 as index to indicate it's not from the ring
    return {
      slot: {
        buffer: Buffer.allocUnsafe(requiredSize),
        length: 0,
        inUse: true,
      },
      index: -1,
    };
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private releaseSlots(indices: number[]): void {
    for (const idx of indices) {
      if (idx >= 0 && idx < this.ring.length) {
        this.ring[idx].inUse = false;
      }
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
