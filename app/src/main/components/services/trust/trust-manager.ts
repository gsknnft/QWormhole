// trust-manager.ts
// Manages SAW (Self-Avoiding Walk) trust scores from feature graph F

import { SAWTrust, buildF } from "./Edge";

export interface TrustScore {
  peer: string;
  trust: number;
  lastUpdated: number;
}

export interface GCSInclusions {
  [peer: string]: Uint8Array; // binary vector: 1 if peer's block is in GCS, 0 otherwise
}

export class TrustManager {
  private trustScores: Map<string, TrustScore> = new Map();
  private gcsInclusions: GCSInclusions = {};
  private view: string[] = [];

  constructor(private epsilon: number = 1e-6) {}

  /**
   * Update GCS inclusions for a peer
   */
  updateGCSInclusions(peer: string, inclusions: Uint8Array) {
    this.gcsInclusions[peer] = inclusions;
    if (!this.view.includes(peer)) {
      this.view.push(peer);
    }
  }

  /**
   * Compute trust scores using SAW over feature graph F
   * Returns map of peer -> trust score
   */
  computeTrustScores(): Record<string, number> {
    if (this.view.length === 0) return {};

    // Build feature graph F from GCS inclusions
    const F = buildF(this.view, this.gcsInclusions);

    // Run SAW to get trust scores
    const scores = SAWTrust(F);

    // Update internal cache
    const now = Date.now();
    for (const peer of this.view) {
      this.trustScores.set(peer, {
        peer,
        trust: scores[peer] || 0,
        lastUpdated: now,
      });
    }

    return scores;
  }

  computeWeight(metrics: Record<string, number>): number {
    // Simple example: weight based on uptime and responsiveness
    const uptime = metrics['uptime'] || 0;
    const responsiveness = metrics['responsiveness'] || 0;

    // Normalize to [0,1]
    const weight = Math.min(1, (uptime + responsiveness) / 200);
    return weight;
  }

  /**
   * Get trust score for a specific peer
   */
  getTrustScore(peer: string): number {
    return this.trustScores.get(peer)?.trust || 0;
  }

  /**
   * Get all trust scores
   */
  getAllTrustScores(): TrustScore[] {
    return Array.from(this.trustScores.values());
  }

  /**
   * Reset trust manager state
   */
  reset() {
    this.trustScores.clear();
    this.gcsInclusions = {};
    this.view = [];
  }

  /**
   * Get peers with trust above threshold
   */
  getTrustedPeers(threshold: number = 0.1): string[] {
    return Array.from(this.trustScores.entries())
      .filter(([_, score]) => score.trust >= threshold)
      .map(([peer, _]) => peer);
  }
}
