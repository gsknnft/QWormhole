/**
 * Peer Registry
 *
 * Manages known SigilNet peers, their public keys, and trust relationships.
 * This forms the foundation for secure peer-to-peer communication in the
 * sovereign mesh network.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import os from "node:os";
const homedir =
  typeof process !== "undefined" && process.release?.name === "node"
    ? os.homedir()
    : "";
import { CoherenceThresholds, Peer } from "../types/sigilnet.types";

/**
 * Default coherence thresholds for field validation
 */
export const DEFAULT_COHERENCE_THRESHOLDS: CoherenceThresholds = {
  minEntropy: 0.5,
  maxEntropy: 5.0,
  minCoherence: 0.3,
  maxPhaseVelocity: 2.0,
};

/**
 * Peer Registry
 *
 * Manages the directory of known peers and their cryptographic identities
 */
export class PeerRegistry {
  public peers: Map<string, Peer> = new Map();
  private registryPath: string;
  private coherenceThresholds: CoherenceThresholds;

  constructor(
    registryPath?: string,
    coherenceThresholds?: CoherenceThresholds,
  ) {
    this.registryPath =
      registryPath || path.join(homedir, ".sigilnet", "peers.json");
    this.coherenceThresholds =
      coherenceThresholds || DEFAULT_COHERENCE_THRESHOLDS;
  }

  /**
   * Initialize the registry (load from disk)
   */
  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.registryPath, "utf-8");
      const peersArray: Peer[] = JSON.parse(data);

      for (const peer of peersArray) {
        this.peers.set(peer.origin, peer);
      }

      console.log(`Loaded ${this.peers.size} peers from registry`);
    } catch (_error) {
      // Registry doesn't exist yet - will be created on first save
      console.log("Initializing new peer registry");
    }
  }

  /**
   * Save the registry to disk
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.registryPath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    const peersArray = Array.from(this.peers.values());
    await fs.writeFile(this.registryPath, JSON.stringify(peersArray, null, 2), {
      mode: 0o600,
    });
  }

  /**
   * Register a new peer or update existing peer
   */
  async registerPeer(peer: Peer): Promise<void> {
    this.peers.set(peer.origin, {
      ...peer,
      lastSeen: Date.now(),
    });
    await this.save();
  }

  /**
   * Get a peer by origin
   */
  getPeer(origin: string): Peer | undefined {
    return this.peers.get(origin);
  }

  /**
   * Get all peers
   */
  getAllPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get trusted peers (trust level >= threshold)
   */
  getTrustedPeers(minTrustLevel = 0.5): Peer[] {
    return Array.from(this.peers.values()).filter(
      p => p.trustLevel >= minTrustLevel,
    );
  }

  /**
   * Update peer's last seen timestamp
   */
  async updateLastSeen(origin: string): Promise<void> {
    const peer = this.peers.get(origin);
    if (peer) {
      peer.lastSeen = Date.now();
      await this.save();
    }
  }

  /**
   * Update peer's trust level
   */
  async updateTrustLevel(origin: string, trustLevel: number): Promise<void> {
    const peer = this.peers.get(origin);
    if (peer) {
      peer.trustLevel = Math.max(0, Math.min(1, trustLevel));
      await this.save();
    }
  }

  /**
   * Remove a peer from the registry
   */
  async removePeer(origin: string): Promise<boolean> {
    const deleted = this.peers.delete(origin);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  /**
   * Validate coherence metrics against thresholds
   */
  validateCoherence(metrics: {
    entropy: number;
    coherence: number;
    phaseVelocity?: number;
  }): boolean {
    const { entropy, coherence, phaseVelocity } = metrics;
    const t = this.coherenceThresholds;

    // Check entropy bounds
    if (entropy < t.minEntropy || entropy > t.maxEntropy) {
      return false;
    }

    // Check coherence minimum
    if (coherence < t.minCoherence) {
      return false;
    }

    // Check phase velocity if present
    if (phaseVelocity !== undefined && t.maxPhaseVelocity !== undefined) {
      if (phaseVelocity > t.maxPhaseVelocity) {
        return false;
      }
    }

    return true;
  }

  /**
   * Set coherence thresholds
   */
  setCoherenceThresholds(thresholds: Partial<CoherenceThresholds>): void {
    this.coherenceThresholds = {
      ...this.coherenceThresholds,
      ...thresholds,
    };
  }

  /**
   * Get coherence thresholds
   */
  getCoherenceThresholds(): CoherenceThresholds {
    return { ...this.coherenceThresholds };
  }

  /**
   * Clean up stale peers (not seen for specified duration)
   */
  async cleanupStalePeers(staleAfterMs = 86400000): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [origin, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > staleAfterMs) {
        this.peers.delete(origin);
        removed++;
      }
    }

    if (removed > 0) {
      await this.save();
    }

    return removed;
  }
}

/**
 * Convenience function to create and initialize a peer registry
 */
export async function createPeerRegistry(
  registryPath?: string,
  coherenceThresholds?: CoherenceThresholds,
): Promise<PeerRegistry> {
  const registry = new PeerRegistry(registryPath, coherenceThresholds);
  await registry.initialize();
  return registry;
}
