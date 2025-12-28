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

export type QueueItem<T> = { priority: number; data: T };

export class PriorityQueue<T> {
  private items: Array<QueueItem<T>> = [];

  enqueue(data: T, priority = 0): void {
    this.items.push({ data, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item?.data;
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
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
