import { describe, expect, it, vi, beforeEach } from "vitest";

const { readFile, writeFile, mkdir } = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile,
  writeFile,
  mkdir,
}));

vi.mock("node:os", () => {
  const api = { homedir: () => "/home/tester" };
  return { default: api, ...api };
});

import {
  PeerRegistry,
  DEFAULT_COHERENCE_THRESHOLDS,
  createPeerRegistry,
} from "../src/sovereign/registry";
import type { Peer } from "../src/types/sigilnet.types";

const samplePeer: Peer = {
  id: "peer-1",
  origin: "peer-1",
  sigil: "Σ",
  ed25519PublicKey: "pub",
  x25519PublicKey: "xpub",
  host: "127.0.0.1",
  port: 1234,
  trustLevel: 0.5,
  lastSeen: 0,
  metrics: { entropy: 0.5, coherence: 0.5 },
  latency: 0,
};

describe("PeerRegistry", () => {
  beforeEach(() => {
    readFile.mockReset();
    writeFile.mockReset();
    mkdir.mockReset();
  });

  it("initializes new registry when file missing", async () => {
    readFile.mockRejectedValueOnce(new Error("missing"));
    const registry = new PeerRegistry("/tmp/peers.json");
    await expect(registry.initialize()).resolves.toBeUndefined();
    expect(registry.getAllPeers()).toHaveLength(0);
  });

  it("loads peers from disk", async () => {
    readFile.mockResolvedValueOnce(JSON.stringify([samplePeer]));
    const registry = new PeerRegistry("/tmp/peers.json");
    await registry.initialize();
    expect(registry.getPeer("peer-1")).toBeTruthy();
  });

  it("registers, updates, and removes peers", async () => {
    const registry = new PeerRegistry("/tmp/peers.json");
    await registry.registerPeer(samplePeer);
    expect(registry.getPeer(samplePeer.origin)).toBeTruthy();
    expect(writeFile).toHaveBeenCalled();

    await registry.updateTrustLevel(samplePeer.origin, 0.9);
    expect(registry.getPeer(samplePeer.origin)?.trustLevel).toBe(0.9);

    await registry.updateLastSeen(samplePeer.origin);
    expect(registry.getPeer(samplePeer.origin)?.lastSeen).toBeGreaterThan(0);

    const removed = await registry.removePeer(samplePeer.origin);
    expect(removed).toBe(true);
    expect(registry.getPeer(samplePeer.origin)).toBeUndefined();
  });

  it("filters trusted peers", () => {
    const registry = new PeerRegistry("/tmp/peers.json");
    registry.peers.set("p1", {
      ...samplePeer,
      origin: "p1",
      id: "p1",
      trustLevel: 0.9,
    });
    registry.peers.set("p2", {
      ...samplePeer,
      origin: "p2",
      id: "p2",
      trustLevel: 0.4,
    });

    const trusted = registry.getTrustedPeers(0.5);
    expect(trusted.map(p => p.origin)).toEqual(["p1"]);
  });

  it("validates coherence against thresholds", () => {
    const registry = new PeerRegistry("/tmp/peers.json");
    expect(registry.validateCoherence({ entropy: 1, coherence: 0.5 })).toBe(
      true,
    );
    expect(registry.validateCoherence({ entropy: 0.1, coherence: 0.5 })).toBe(
      false,
    );
  });

  it("cleans up stale peers", async () => {
    const registry = new PeerRegistry("/tmp/peers.json");
    registry.peers.set("stale", {
      ...samplePeer,
      origin: "stale",
      lastSeen: Date.now() - 1000,
    });
    const removed = await registry.cleanupStalePeers(10);
    expect(removed).toBe(1);
    expect(writeFile).toHaveBeenCalled();
  });

  it("sets and returns coherence thresholds", () => {
    const registry = new PeerRegistry("/tmp/peers.json");
    registry.setCoherenceThresholds({ minEntropy: 0.1 });
    const thresholds = registry.getCoherenceThresholds();
    expect(thresholds.minEntropy).toBe(0.1);
    expect(thresholds.maxEntropy).toBe(DEFAULT_COHERENCE_THRESHOLDS.maxEntropy);
  });

  it("createPeerRegistry initializes registry", async () => {
    readFile.mockRejectedValueOnce(new Error("missing"));
    const registry = await createPeerRegistry("/tmp/peers.json");
    expect(registry).toBeInstanceOf(PeerRegistry);
  });
});
