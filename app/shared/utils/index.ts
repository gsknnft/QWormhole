/**
 * Shared utility functions
 */

/**
 * Generate mock signal data with realistic characteristics
 */
export function generateMockSignal(efficiency: number): number[] {
  const size = 1024;
  const signal = new Array(size);
  
  // Base frequency related to efficiency
  const baseFreq = 0.05 + (efficiency / 100) * 0.15;
  
  // Add harmonics
  for (let i = 0; i < size; i++) {
    const t = i / size;
    signal[i] = 
      Math.sin(2 * Math.PI * baseFreq * t) * 0.5 +
      Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.3 +
      Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.15 +
      (Math.random() - 0.5) * 0.1; // Add some noise
  }
  
  return signal;
}

/**
 * Calculate coherence from signal data
 */
export function calculateCoherence(magnitude: number[]): number {
  if (!magnitude || magnitude.length === 0) return 0;
  
  const sum = magnitude.reduce((a, b) => a + b, 0);
  const mean = sum / magnitude.length;
  const variance = magnitude.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / magnitude.length;
  const coherence = 1 - Math.min(1, variance / (mean * mean + 1e-10));
  
  return Math.max(0, Math.min(1, coherence));
}

/**
 * Calculate entropy from signal data
 */
export function calculateEntropy(magnitude: number[]): number {
  if (!magnitude || magnitude.length === 0) return 0;
  
  const sum = magnitude.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  
  // Normalize to probabilities
  const probs = magnitude.map(m => m / sum);
  
  // Shannon entropy
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  
  // Normalize to 0-1 range
  const maxEntropy = Math.log2(magnitude.length);
  return entropy / maxEntropy;
}

/**
 * Find dominant frequency
 */
export function findDominantFrequency(magnitude: number[], sampleRate: number = 1000): number {
  if (!magnitude || magnitude.length === 0) return 0;
  
  let maxIndex = 0;
  let maxValue = magnitude[0];
  
  for (let i = 1; i < magnitude.length; i++) {
    if (magnitude[i] > maxValue) {
      maxValue = magnitude[i];
      maxIndex = i;
    }
  }
  
  return (maxIndex * sampleRate) / (magnitude.length * 2);
}

/**
 * Extract harmonic frequencies
 */
export function extractHarmonics(magnitude: number[], dominantHz: number, sampleRate: number = 1000): number[] {
  const harmonics: number[] = [];
  const binSize = sampleRate / (magnitude.length * 2);
  
  // Look for harmonics at 2x, 3x, 4x the fundamental
  for (let h = 2; h <= 4; h++) {
    const targetHz = dominantHz * h;
    const targetBin = Math.round(targetHz / binSize);
    
    if (targetBin < magnitude.length) {
      harmonics.push(magnitude[targetBin]);
    }
  }
  
  return harmonics;
}

/**
 * Format SOL amount for display
 */
export function formatSOL(amount: number): string {
  return amount.toFixed(6) + ' SOL';
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return value.toFixed(2) + '%';
}

/**
 * Get liquidity rank based on total liquidity
 */
export function getLiquidityRank(totalLiquidity: number): string {
  if (totalLiquidity >= 10000000) return 'S';
  if (totalLiquidity >= 5000000) return 'A';
  if (totalLiquidity >= 1000000) return 'B';
  if (totalLiquidity >= 500000) return 'C';
  if (totalLiquidity >= 100000) return 'D';
  return 'E';
}
