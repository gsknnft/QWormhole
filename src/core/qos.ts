import { Buffer } from "node:buffer";

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly rateBytes: number;
  private readonly burstBytes: number;

  constructor(rateBytes: number, burstBytes: number) {
    this.rateBytes = Math.max(rateBytes, 1);
    this.burstBytes = burstBytes;
    this.tokens = burstBytes;
    this.lastRefill = Date.now();
  }

  reserve(bytes: number): number {
    this.refill();

    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return 0;
    }

    // Calculate wait time until enough tokens are available
    const deficit = bytes - this.tokens;
    const waitMs = (deficit / this.rateBytes) * 1000;

    // Deduct what we can now, rest will be refilled
    this.tokens = 0;

    if (waitMs < 1) return 0;
    return Math.ceil(waitMs);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillAmount = (elapsed / 1000) * this.rateBytes;
    this.tokens = Math.min(this.burstBytes, this.tokens + refillAmount);
    this.lastRefill = now;
  }

  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

export type QueueItem<T> = { priority: number; data: T; size: number };

export type PriorityQueueStats = {
  length: number;
  maxLength: number;
  totalEnqueued: number;
  totalDequeued: number;
  bytes: number;
  maxBytes: number;
  bytesEnqueued: number;
  bytesDequeued: number;
};

const estimateItemSize = (data: unknown): number => {
  if (!data) return 0;
  if (typeof data === "string") {
    return Buffer.byteLength(data);
  }
  if (Buffer.isBuffer(data)) return data.length;
  if (data instanceof Uint8Array) return data.byteLength;
  const record = data as { byteLength?: number; length?: number };
  if (typeof record.byteLength === "number") return record.byteLength;
  if (typeof record.length === "number") return record.length;
  return 0;
};

export class PriorityQueue<T> {
  private items: Array<QueueItem<T>> = [];
  private maxLength = 0;
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private bytes = 0;
  private maxBytes = 0;
  private bytesEnqueued = 0;
  private bytesDequeued = 0;

  enqueue(data: T, priority = 0): void {
    const size = estimateItemSize(data);
    const item = { data, priority, size };
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.items[mid]?.priority ?? 0) <= priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.items.splice(lo, 0, item);
    this.totalEnqueued += 1;
    this.bytesEnqueued += size;
    this.bytes += size;
    this.maxLength = Math.max(this.maxLength, this.items.length);
    this.maxBytes = Math.max(this.maxBytes, this.bytes);
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    if (item) {
      this.accountDequeued(item.size);
    }
    return item?.data;
  }

  dequeueMany(maxItems: number): T[] {
    const limit = Math.max(0, Math.floor(maxItems));
    if (limit === 0 || this.items.length === 0) return [];
    const removed = this.items.splice(0, limit);
    let removedBytes = 0;
    for (const item of removed) {
      removedBytes += item.size;
    }
    if (removed.length > 0) {
      this.totalDequeued += removed.length;
      this.bytesDequeued += removedBytes;
      this.bytes = Math.max(0, this.bytes - removedBytes);
    }
    return removed.map(item => item.data);
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
    this.resetStats();
  }

  getStats(): PriorityQueueStats {
    return {
      length: this.items.length,
      maxLength: this.maxLength,
      totalEnqueued: this.totalEnqueued,
      totalDequeued: this.totalDequeued,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      bytesEnqueued: this.bytesEnqueued,
      bytesDequeued: this.bytesDequeued,
    };
  }

  snapshot(options?: { reset?: boolean }): PriorityQueueStats {
    const stats = this.getStats();
    if (options?.reset) {
      this.resetStats();
    }
    return stats;
  }

  private resetStats(): void {
    this.maxLength = this.items.length;
    this.totalEnqueued = 0;
    this.totalDequeued = 0;
    this.bytes = this.items.reduce((sum, item) => sum + item.size, 0);
    this.maxBytes = this.bytes;
    this.bytesEnqueued = 0;
    this.bytesDequeued = 0;
  }

  private accountDequeued(size: number): void {
    this.totalDequeued += 1;
    this.bytesDequeued += size;
    this.bytes = Math.max(0, this.bytes - size);
  }
}

export const delay = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Simple token bucket rate limiter
 */
// export class TokenBucket {
//   private tokens: number;
//   private lastRefill: number;

//   constructor(
//     private readonly rateBytes: number,
//     private readonly burstBytes: number,
//   ) {
//     this.tokens = burstBytes;
//     this.lastRefill = Date.now();
//   }

//   /**
//    * Reserve bytes from the bucket.
//    * Returns the delay in ms before the bytes can be sent (0 if immediate).
//    */
//   reserve(bytes: number): number {
//     this.refill();

//     if (this.tokens >= bytes) {
//       this.tokens -= bytes;
//       return 0;
//     }

//     // Calculate wait time until enough tokens are available
//     const deficit = bytes - this.tokens;
//     const waitMs = (deficit / this.rateBytes) * 1000;

//     // Deduct what we can now, rest will be refilled
//     this.tokens = 0;

//     if (waitMs < 1) return 0;
//     return Math.ceil(waitMs);
//   }

//   /**
//    * Refill tokens based on elapsed time
//    */
//   private refill(): void {
//     const now = Date.now();
//     const elapsed = now - this.lastRefill;
//     const refillAmount = (elapsed / 1000) * this.rateBytes;

//     this.tokens = Math.min(this.burstBytes, this.tokens + refillAmount);
//     this.lastRefill = now;
//   }

//   /**
//    * Get current token count (for diagnostics)
//    */
//   get availableTokens(): number {
//     this.refill();
//     return this.tokens;
//   }
// }
