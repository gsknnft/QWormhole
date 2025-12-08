/**
 * Shared types for the Hackathon Demo
 * Aligned with core SigilNet types
 */

/**
 * Core SigilMetrics from sigilnet/core/types
 * Measures system coherence, entropy, and quantum field properties
 */
export interface SigilMetrics {
  /** Entropy level (0-2+), measures system randomness/disorder */
  entropy: number;
  
  /** Coherence level (0-1), measures system synchronization */
  coherence: number;
  
  /** Phase velocity (optional), measures signal propagation speed */
  phaseVelocity?: number;
  
  /** Signal strength (optional), measures connection quality */
  signalStrength?: number;
  
  /** Trust level (0-1) for validation */
  trustLevel?: number;
  
  /** Latency in milliseconds (optional) */
  latency?: number;
  
  /** Custom metrics (extensible) */
  [key: string]: number | number[] | undefined;
}

export interface LiquidityContext {
  reserveIn: number;
  reserveOut: number;
  totalLiquidity?: number;
  poolId?: string;
}

/**
 * SignalFrame extends SigilMetrics with additional signal processing data
 * Aligned with core sigilnet types for quantum signal analysis
 */
export interface SignalFrame extends SigilMetrics {
  /** Phase angle in radians */
  phase: number;
  
  /** Dominant frequency in Hz */
  dominantHz: number;
  
  /** Harmonic amplitudes at 2x, 3x, 4x fundamental */
  harmonics: number[];
  
  /** Frequency spectrum magnitude */
  magnitude: number[];
}

export interface MockSwapResult {
  in: number;
  out: number;
  efficiency: number;
  signal: SignalFrame;
  slippage: number;
  liquidityRank: string;
  executionPlan: {
    chunks: number;
    chunkSize: number;
    estimatedTime: number;
  };
}

export interface PoolSnapshot {
  poolId: string;
  tokenA: string;
  tokenB: string;
  reserveA: number;
  reserveB: number;
  volume24h: number;
  fee: number;
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
}

export interface QuoteResponse extends MockSwapResult {
  route: string[];
  timestamp: number;
}
