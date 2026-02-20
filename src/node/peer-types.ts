// QWormhole/src/node/peer-types.ts

import { PeerSeal } from "src/types/sigilnet.types";

/**
 * Peer metadata and keys
 */
export type PeerId = string;

export interface Peer extends PeerBase {
  id: PeerId;
  address: string;        // "host:port"
  host: string;
  port: number;
  negentropicIndex?: number; // from NCF later
  lastSeen: number;
  meta?: Record<string, any>;
}

interface PeerBase {
  /** Peer identifier (origin) */
  origin: string;

  /** Peer sigil */
  sigil: string;

  /** Ed25519 public key for signature verification */
  ed25519PublicKey: string;

  /** X25519 public key for session encryption */
  x25519PublicKey: string;

  /** Peer endpoint (optional) */
  endpoint?: string;

  /** Last seen timestamp */
  lastSeen: number;

  /** Trust level (0-1) */
  trustLevel: number;

  /** Latency  */
  latency: number;

  /** Metadata */
  metadata?: Record<string, any>;

  seal?: PeerSeal;
}


// export interface CoreSeal {
//   sigil: string;
//   origin: string;
//   pubkey: string;
//   issuedAt: number;
//   manifestHash: string;
//   signature: string;
// }

// export interface SovereignSeal extends CoreSeal {
//   expiresAt: number;
//   sealed: boolean;
// }

// export interface PeerSeal extends SovereignSeal {
//   peerSeal: SovereignSeal;
// }

