export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly fillRateBytesPerSec: number;
  private lastRefill: number;

  constructor(rateBytesPerSec: number, burstBytes?: number) {
    this.capacity = burstBytes ?? rateBytesPerSec;
    this.fillRateBytesPerSec = Math.max(rateBytesPerSec, 1);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  reserve(bytes: number): number {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs > 0) {
      const refill = (this.fillRateBytesPerSec * elapsedMs) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + refill);
      this.lastRefill = now;
    }

    if (this.tokens >= bytes) {
      this.tokens -= bytes;
      return 0;
    }

    const needed = bytes - this.tokens;
    const waitMs = (needed / this.fillRateBytesPerSec) * 1000;
    this.tokens = 0;
    return waitMs;
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
