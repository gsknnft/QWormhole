/**
 * Sovereign Tunnel
 *
 * Provides secure, encrypted peer-to-peer communication channels between
 * SigilNet nodes. This implements the "semantic VPN" layer described in the
 * sovereign network architecture.
 *
 * Features:
 * - X25519 session key exchange
 * - ChaCha20-Poly1305 payload encryption
 * - Ed25519 signature verification
 * - Coherence-based validation
 */

import {
  SigilEvent,
  SessionHandshakeEvent,
  EncryptedPayload,
  Session,
  Tunnel,
  Peer,
} from "../types/sigilnet.types";
import {
  generateSessionKeyPair,
  encryptForPeer,
  decryptFromPeer,
} from "../session";

import { PeerRegistry } from "./registry";
import { verifyEvent } from "../utils/crypto";

import { Base64String, sovereignHash } from "../utils/randomId";

/**
 * Sovereign Tunnel Manager
 *
 * Manages encrypted sessions between SigilNet peers
 */
export class SovereignTunnel implements Tunnel {
  public sessions: Map<string, Session> = new Map();
  private peerRegistry: PeerRegistry;
  private sessionTimeoutMs: number;
  private cleanupIntervalMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(peerRegistry: PeerRegistry, sessionTimeoutMs = 3600000, cleanupIntervalMs = 300000) {
    this.peerRegistry = peerRegistry;
    this.sessionTimeoutMs = sessionTimeoutMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    // Start periodic cleanup to prevent session memory leaks
    this.startCleanupTimer();
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupIntervalMs);
    // Allow process to exit even if timer is running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer (call when shutting down)
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Destroy the tunnel and clean up resources
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.sessions.clear();
  }

  /**
   * Initiate a session handshake with a peer
   */
  async initiateSession(peer: Peer): Promise<void | SessionHandshakeEvent> {
    // Clean up expired sessions on each new session initiation
    this.cleanupExpiredSessions();
    
    if (!peer || !peer.origin) {
      console.error(`Peer object is invalid or missing origin`);
      return;
    }
    const peerOrigin = peer.origin;
    const sessionKeys = generateSessionKeyPair();

    const sessionId = sovereignHash(sessionKeys.publicKey as Base64String);

    // Store session (not yet established)
    this.sessions.set(peerOrigin, {
      sessionId,
      peerOrigin,
      myX25519SecretKey: sessionKeys.secretKey,
      myX25519PublicKey: sessionKeys.publicKey,
      peerX25519PublicKey: "", // Will be filled when peer responds
      established: false,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });

    // Return handshake event to be sent via SigilRouter
    return {
      sigil: "Σ-Tunnel",
      origin: "", // Should be filled by caller
      ts: Date.now(),
      metrics: { entropy: 1.0, coherence: 1.0 },
      intent: "session-handshake",
      x25519PublicKey: sessionKeys.publicKey,
      sessionId,
      targetOrigin: peerOrigin,
    } as SessionHandshakeEvent;
  }

  /**
   * Handle incoming session handshake
   */
  async handleSessionHandshake(
    event: SessionHandshakeEvent,
  ): Promise<SessionHandshakeEvent | null> {
    // Verify the sender is a known peer
    const peer = this.peerRegistry.getPeer(event.origin);
    if (!peer) {
      console.error(`Unknown peer attempting handshake: ${event.origin}`);
      return null;
    }

    // Verify signature if present
    if (event.signature) {
      const { signature, ...evtData } = event;
      const isValid = verifyEvent(evtData, signature, peer.ed25519PublicKey);
      if (!isValid) {
        console.error(`Invalid signature on handshake from ${event.origin}`);
        return null;
      }
    }

    // Generate our session keys
    const sessionKeys = generateSessionKeyPair();
    const sessionId =
      event.sessionId || sovereignHash(sessionKeys.publicKey as Base64String);

    // Create session
    this.sessions.set(event.origin, {
      sessionId,
      peerOrigin: event.origin,
      myX25519SecretKey: sessionKeys.secretKey,
      myX25519PublicKey: sessionKeys.publicKey,
      peerX25519PublicKey: event.x25519PublicKey,
      established: true,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });

    console.log(`Session established with ${event.origin}`);

    // Return acknowledgment
    return {
      sigil: "Σ-Tunnel",
      origin: "", // Should be filled by caller
      ts: Date.now(),
      metrics: { entropy: 1.0, coherence: 1.0 },
      intent: "session-ack",
      x25519PublicKey: sessionKeys.publicKey,
      sessionId,
      targetOrigin: event.origin,
    } as SessionHandshakeEvent;
  }

  /**
   * Handle session acknowledgment
   */
  async handleSessionAck(event: SessionHandshakeEvent): Promise<void> {
    const session = this.sessions.get(event.origin);
    if (!session) {
      console.error(`No pending session with ${event.origin}`);
      return;
    }

    // Complete the session
    session.peerX25519PublicKey = event.x25519PublicKey;
    session.established = true;
    session.lastActivity = Date.now();

    console.log(`Session established with ${event.origin}`);
  }

  /**
   * Encrypt data for a peer
   */
  encryptForPeer(
    peerOrigin: string,
    data: string | object,
  ): EncryptedPayload | null {
    const session = this.sessions.get(peerOrigin);
    if (!session || !session.established) {
      console.error(`No established session with ${peerOrigin}`);
      return null;
    }

    session.lastActivity = Date.now();
    return encryptForPeer(
      data,
      session.myX25519SecretKey,
      session.peerX25519PublicKey,
    );
  }

  /**
   * Decrypt data from a peer
   */
  decryptFromPeer(
    peerOrigin: string,
    encrypted: EncryptedPayload,
  ): string | null {
    const session = this.sessions.get(peerOrigin);
    if (!session || !session.established) {
      console.error(`No established session with ${peerOrigin}`);
      return null;
    }

    session.lastActivity = Date.now();
    return decryptFromPeer(
      encrypted,
      session.myX25519SecretKey,
      session.peerX25519PublicKey,
    );
  }

  /**
   * Get active session with a peer
   */
  getSession(peerOrigin: string): Session | undefined {
    return this.sessions.get(peerOrigin);
  }

  /**
   * Close a session
   */
  closeSession(peerOrigin: string): boolean {
    return this.sessions.delete(peerOrigin);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let removed = 0;

    for (const [origin, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeoutMs) {
        this.sessions.delete(origin);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.established);
  }

  /**
   * Validate and handle any tunnel event
   */
  async handleTunnelEvent(
    event: SigilEvent,
  ): Promise<SessionHandshakeEvent | null> {
    // Validate coherence if metrics are present
    if (!this.peerRegistry.validateCoherence(event.metrics)) {
      console.error(
        `Coherence validation failed for event from ${event.origin}`,
      );
      return null;
    }

    // Handle based on intent
    switch (event.intent) {
      case "session-handshake":
        return this.handleSessionHandshake(event as SessionHandshakeEvent);

      case "session-ack":
        await this.handleSessionAck(event as SessionHandshakeEvent);
        return null;

      case "session-close":
        this.closeSession(event.origin);
        return null;

      case "tunnel-packet":
      case "relay-packet":
        // These would be handled by application logic
        // The tunnel just provides encryption/decryption
        return null;

      default:
        return null;
    }
  }
}

/**
 * Convenience function to create a sovereign tunnel
 */
export function createSovereignTunnel(
  peerRegistry: PeerRegistry,
  sessionTimeoutMs = 3600000,
  cleanupIntervalMs = 300000,
): SovereignTunnel {
  return new SovereignTunnel(peerRegistry, sessionTimeoutMs, cleanupIntervalMs);
}
