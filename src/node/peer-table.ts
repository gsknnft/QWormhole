// QWormhole/src/node/peer-table.ts

import { PeerId, PeerInfo } from "./peer-types";

export class PeerTable {
  private peers = new Map<PeerId, PeerInfo>();

  upsert(peer: PeerInfo) {
    const prev = this.peers.get(peer.id);
    const next: PeerInfo = {
      ...(prev || {}),
      ...peer,
      lastSeen: peer.lastSeen || Date.now(),
    };
    this.peers.set(peer.id, next);
  }

  get(id: PeerId): PeerInfo | undefined {
    return this.peers.get(id);
  }

  all(): PeerInfo[] {
    return [...this.peers.values()];
  }

  remove(id: PeerId) {
    this.peers.delete(id);
  }

  prune(deadAfterMs: number = 60_000) {
    const now = Date.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > deadAfterMs) {
        this.peers.delete(id);
      }
    }
  }

  topByNegentropy(limit = 8): PeerInfo[] {
    return this.all()
      .sort((a, b) => (b.negentropicIndex || 0) - (a.negentropicIndex || 0))
      .slice(0, limit);
  }
}
