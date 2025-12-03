import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  generateSessionKeyPair: vi.fn(() => ({
    publicKey: "pub",
    secretKey: "sec",
  })),
  encryptForPeer: vi.fn(() => ({ ciphertext: "c", nonce: "n" })),
  decryptFromPeer: vi.fn(() => "decrypted"),
}));
const sovereignHashMock = vi.hoisted(() => vi.fn(() => "session-id"));

vi.mock("../src/session", () => ({
  generateSessionKeyPair: sessionMocks.generateSessionKeyPair,
  encryptForPeer: sessionMocks.encryptForPeer,
  decryptFromPeer: sessionMocks.decryptFromPeer,
}));

vi.mock("../src/utils/crypto", () => ({
  verifyEvent: vi.fn(() => true),
}));

vi.mock("../src/utils/randomId", () => ({
  sovereignHash: sovereignHashMock,
}));

import { SovereignTunnel } from "../src/sovereign/tunnel";
import type {
  Peer,
  SessionHandshakeEvent,
  SigilEvent,
} from "../src/types/sigilnet.types";
import { PeerRegistry } from "../src/sovereign/registry";

describe("SovereignTunnel", () => {
  let registry: PeerRegistry;
  const peer: Peer = {
    id: "peer-1",
    origin: "peer-1",
    sigil: "Σ",
    ed25519PublicKey: "ed",
    x25519PublicKey: "x",
    host: "127.0.0.1",
    port: 1234,
    trustLevel: 1,
    lastSeen: Date.now(),
    latency: 0,
  };

  beforeEach(() => {
    registry = new PeerRegistry("/tmp/peers.json");
    registry.getPeer = vi.fn(() => peer) as any;
    registry.validateCoherence = vi.fn(() => true) as any;
    sessionMocks.generateSessionKeyPair.mockClear();
    sessionMocks.encryptForPeer.mockClear();
    sessionMocks.decryptFromPeer.mockClear();
    sovereignHashMock.mockClear();
  });

  it("initiates a session handshake and stores pending session", async () => {
    const tunnel = new SovereignTunnel(registry, 1000);
    const evt = await tunnel.initiateSession(peer);

    expect(evt?.intent).toBe("session-handshake");
    expect(tunnel.getSession(peer.origin)).toBeDefined();
  });

  it("handles incoming session handshake and returns ack", async () => {
    const tunnel = new SovereignTunnel(registry, 1000);
    const ack = await tunnel.handleSessionHandshake({
      sigil: "Σ-Tunnel",
      origin: peer.origin,
      ts: Date.now(),
      metrics: { entropy: 1, coherence: 1 },
      intent: "session-handshake",
      x25519PublicKey: "peer-pub",
      sessionId: "peer-session",
      targetOrigin: "",
    } as SessionHandshakeEvent);

    expect(ack?.intent).toBe("session-ack");
    const session = tunnel.getSession(peer.origin);
    expect(session?.established).toBe(true);
    expect(session?.peerX25519PublicKey).toBe("peer-pub");
  });

  it("handleSessionHandshake rejects unknown peer", async () => {
    (registry.getPeer as any) = vi.fn(() => undefined);
    const tunnel = new SovereignTunnel(registry, 1000);
    const result = await tunnel.handleSessionHandshake({
      sigil: "Σ-Tunnel",
      origin: "unknown",
      ts: Date.now(),
      metrics: { entropy: 1, coherence: 1 },
      intent: "session-handshake",
      x25519PublicKey: "peer-pub",
      sessionId: "peer-session",
      targetOrigin: "",
    } as SessionHandshakeEvent);
    expect(result).toBeNull();
  });

  it("completes session on ack", async () => {
    const tunnel = new SovereignTunnel(registry, 1000);
    tunnel.sessions.set(peer.origin, {
      sessionId: "pending",
      peerOrigin: peer.origin,
      myX25519SecretKey: "sec",
      myX25519PublicKey: "pub",
      peerX25519PublicKey: "",
      established: false,
      createdAt: Date.now(),
      lastActivity: 0,
    });

    await tunnel.handleSessionAck({
      sigil: "Σ-Tunnel",
      origin: peer.origin,
      ts: Date.now(),
      metrics: { entropy: 1, coherence: 1 },
      intent: "session-ack",
      x25519PublicKey: "peer-pub",
      sessionId: "pending",
      targetOrigin: "",
    } as SessionHandshakeEvent);

    expect(tunnel.getSession(peer.origin)?.established).toBe(true);
  });

  it("encrypts and decrypts when session established", () => {
    const tunnel = new SovereignTunnel(registry, 1000);
    tunnel.sessions.set(peer.origin, {
      sessionId: "s",
      peerOrigin: peer.origin,
      myX25519SecretKey: "sec",
      myX25519PublicKey: "pub",
      peerX25519PublicKey: "peer-pub",
      established: true,
      createdAt: Date.now(),
      lastActivity: 0,
    });

    const encrypted = tunnel.encryptForPeer(peer.origin, { hello: "world" });
    expect(encrypted).toEqual({ ciphertext: "c", nonce: "n" });
    const decrypted = tunnel.decryptFromPeer(peer.origin, {
      ciphertext: "c",
      nonce: "n",
    });
    expect(decrypted).toBe("decrypted");
  });

  it("cleanupExpiredSessions removes stale sessions", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const tunnel = new SovereignTunnel(registry, 10);
    tunnel.sessions.set("old", {
      sessionId: "s",
      peerOrigin: "old",
      myX25519SecretKey: "sec",
      myX25519PublicKey: "pub",
      peerX25519PublicKey: "peer-pub",
      established: true,
      createdAt: now - 1000,
      lastActivity: now - 1000,
    });
    const removed = tunnel.cleanupExpiredSessions();
    expect(removed).toBe(1);
    vi.useRealTimers();
  });

  it("handleTunnelEvent short-circuits on coherence failure", async () => {
    (registry.validateCoherence as any) = vi.fn(() => false);
    const tunnel = new SovereignTunnel(registry, 1000);
    const result = await tunnel.handleTunnelEvent({
      sigil: "Σ-Tunnel",
      origin: "x",
      ts: Date.now(),
      metrics: { entropy: 0, coherence: 0 },
      intent: "session-handshake",
    } as SigilEvent);
    expect(result).toBeNull();
  });
});
