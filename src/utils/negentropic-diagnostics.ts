// Negentropic diagnostics utilities
// References: https://github.com/gsknnft/NegentropicCouplingTheory/tree/dev

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
  const maxEntropy = Math.log2(n);
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
