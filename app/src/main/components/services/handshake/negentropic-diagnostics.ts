// Negentropic diagnostics utilities
// References: https://github.com/gsknnft/NegentropicCouplingTheory/tree/dev

import { Buffer } from "node:buffer";

export type Payload = string | Buffer | Uint8Array | Record<string, unknown>;

export type MessageType = string;

export class RollingHistogram {
  private window: MessageType[] = [];
  private maxSize: number;
  constructor(maxSize = 256) {
    this.maxSize = maxSize;
  }
  add(msgType: MessageType) {
    this.window.push(msgType);
    if (this.window.length > this.maxSize) this.window.shift();
  }
  frequencies(): Record<MessageType, number> {
    return this.window.reduce(
      (acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      },
      {} as Record<MessageType, number>,
    );
  }
  total(): number {
    return this.window.length;
  }

  clear(): void {
    this.window = [];
  }
}

export function shannonEntropy(hist: Record<MessageType, number>): number {
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of Object.values(hist)) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function negentropy(hist: Record<MessageType, number>): number {
  const n = Object.keys(hist).length;
  if (n === 0) return 0;
  const maxEntropy = Math.log2(Math.max(n, 1));
  return maxEntropy - shannonEntropy(hist);
}

export enum Coherence {
  Low = "Low",
  Medium = "Medium",
  High = "High",
}

export enum Velocity {
  Slow = "Slow",
  Moderate = "Moderate",
  Fast = "Fast",
}

export function mapCoherence(neg: number): Coherence {
  if (neg > 1.5) return Coherence.High;
  if (neg > 0.5) return Coherence.Medium;
  return Coherence.Low;
}

export function mapVelocity(entropyVelocity: number): Velocity {
  if (entropyVelocity > 1.0) return Velocity.Fast;
  if (entropyVelocity > 0.3) return Velocity.Moderate;
  return Velocity.Slow;
}

export interface NegentropicSnapshot {
  histogram: Record<MessageType, number>;
  entropy: number;
  negentropy: number;
  neganticIndex: number;
  entropyVelocity: number;
  coherence: Coherence;
  velocity: Velocity;
  sampleCount: number;
}

const DEFAULT_SNAPSHOT: NegentropicSnapshot = {
  histogram: {},
  entropy: 0,
  negentropy: 0,
  neganticIndex: 0,
  entropyVelocity: 0,
  coherence: Coherence.Low,
  velocity: Velocity.Slow,
  sampleCount: 0,
};

export class NegentropicDiagnostics {
  private readonly histogram: RollingHistogram;
  private lastEntropy = 0;
  private snapshot: NegentropicSnapshot = { ...DEFAULT_SNAPSHOT };

  constructor(windowSize = 512) {
    this.histogram = new RollingHistogram(windowSize);
  }

  recordPayload(payload: Payload | undefined): void {
    this.recordMessageType(inferMessageType(payload));
  }

  recordMessageType(messageType: MessageType | undefined): void {
    const normalized =
      messageType && messageType.length > 0 ? messageType : "unknown";
    this.histogram.add(normalized);
    this.recompute();
  }

  getSnapshot(): NegentropicSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.histogram.clear();
    this.snapshot = { ...DEFAULT_SNAPSHOT };
    this.lastEntropy = 0;
  }

  private recompute(): void {
    const histogram = this.histogram.frequencies();
    const entropy = shannonEntropy(histogram);
    const neg = negentropy(histogram);
    const entropyVelocity = entropy - this.lastEntropy;
    this.lastEntropy = entropy;

    const neganticIndex = Number.isFinite(neg) ? neg : 0;
    this.snapshot = {
      histogram,
      entropy,
      negentropy: neg,
      neganticIndex,
      entropyVelocity,
      coherence: mapCoherence(neganticIndex),
      velocity: mapVelocity(Math.abs(entropyVelocity)),
      sampleCount: this.histogram.total(),
    };
  }
}

export function inferMessageType(payload: Payload | undefined): MessageType {
  if (typeof payload === "string") return "string";
  if (typeof payload === "number") return "number";
  if (typeof payload === "boolean") return "boolean";
  if (!payload) return "unknown";
  if (Buffer.isBuffer(payload)) return "buffer";
  if (payload instanceof Uint8Array) return "uint8array";
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const type = record.type;
    if (typeof type === "string" && type.length > 0) return type;
    const event = record.event;
    if (typeof event === "string" && event.length > 0) {
      return `event:${event}`;
    }
    const action = record.action;
    if (typeof action === "string" && action.length > 0) {
      return `action:${action}`;
    }
    return "object";
  }
  return "unknown";
}
