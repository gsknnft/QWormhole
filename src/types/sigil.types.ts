/**
 * Sigil Protocol - Core Type Definitions
 *
 * Defines the canonical structure for sigil events, the fundamental
 * communication primitive in the Signal Fabric ecosystem.
 */

import { SigilDefinition } from "./sigilnet.types";

/**
 * Sigil - A symbolic identifier representing intent, state, or phase
 * Examples: Φ-open, Δ-lock, Σ-Vera, ☉Sol
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Origin - A unique identifier for a device, process, or entity
 * Can be a UUID, hostname, or any unique identifier
 */

/**
 * Standard intents used across the Signal Fabric
 */
export const StandardIntents = {
  // Network topology
  ESTABLISH_FIELD_LOCK: "establish-field-lock",
  RELEASE_FIELD_LOCK: "release-field-lock",
  ANNOUNCE_PRESENCE: "announce-presence",
  FAREWELL: "farewell",

  // Session management
  SESSION_HANDSHAKE: "session-handshake",
  SESSION_KEY_EXCHANGE: "session-key-exchange",
  SESSION_ACK: "session-ack",
  SESSION_CLOSE: "session-close",

  // Data transfer
  TUNNEL_PACKET: "tunnel-packet",
  RELAY_PACKET: "relay-packet",
  BROADCAST_MESSAGE: "broadcast-message",

  // Monitoring and telemetry
  HEARTBEAT: "heartbeat",
  TELEMETRY_UPDATE: "telemetry-update",
  STATUS_REPORT: "status-report",

  // Coordination
  REQUEST_SYNC: "request-sync",
  SYNC_COMPLETE: "sync-complete",
  CONSENSUS_VOTE: "consensus-vote",

  // Security
  KEY_ROTATION: "key-rotation",
  CHALLENGE_REQUEST: "challenge-request",
  CHALLENGE_RESPONSE: "challenge-response",
  REVOKE_ACCESS: "revoke-access",
} as const;

/**
 * Standard sigils used in the ecosystem
 */
export const StandardSigils: Record<string, SigilDefinition> = {
  SOL: {
    sigil: "☉Sol",
    name: "Sol - The Canon",
    description: "Root template and origin point for all sovereign branches",
    intents: [
      StandardIntents.ANNOUNCE_PRESENCE,
      StandardIntents.ESTABLISH_FIELD_LOCK,
    ],
    requiresSignature: true,
  },
  VERA: {
    sigil: "Σ-Vera",
    name: "Vera - AI Cognition",
    description: "AI console and signal cognition interface",
    intents: [
      StandardIntents.TELEMETRY_UPDATE,
      StandardIntents.STATUS_REPORT,
      StandardIntents.BROADCAST_MESSAGE,
    ],
    requiresSignature: true,
  },
  FLIPPER: {
    sigil: "Φ-Flipper",
    name: "Flipper - Hardware Bridge",
    description: "Flipper Zero integration and hardware security",
    intents: [
      StandardIntents.KEY_ROTATION,
      StandardIntents.CHALLENGE_REQUEST,
      StandardIntents.SESSION_HANDSHAKE,
    ],
    requiresSignature: true,
  },
  GATEWAY: {
    sigil: "Ω-Gateway",
    name: "Gateway - FPGA Orchestration",
    description: "WireGuard FPGA gateway and signal orchestration",
    intents: [
      StandardIntents.TUNNEL_PACKET,
      StandardIntents.RELAY_PACKET,
      StandardIntents.SESSION_KEY_EXCHANGE,
    ],
    expectedMetrics: ["entropy", "coherence", "latency"],
    requiresSignature: true,
  },
  COMMAND: {
    sigil: "Ψ-Command",
    name: "Command - Operator Console",
    description: "Operator dashboard and command center",
    intents: [
      StandardIntents.REQUEST_SYNC,
      StandardIntents.STATUS_REPORT,
      StandardIntents.CONSENSUS_VOTE,
    ],
    requiresSignature: false,
  },
  OPEN: {
    sigil: "Φ-open",
    name: "Open - Connection Initiation",
    description: "General connection establishment",
    intents: [
      StandardIntents.SESSION_HANDSHAKE,
      StandardIntents.ANNOUNCE_PRESENCE,
    ],
    requiresSignature: false,
  },
  LOCK: {
    sigil: "Δ-lock",
    name: "Lock - Secure State",
    description: "Indicates a secured or locked state",
    intents: [
      StandardIntents.ESTABLISH_FIELD_LOCK,
      StandardIntents.SESSION_ACK,
    ],
    requiresSignature: true,
  },
};

/**
 * Validation result for sigil events
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Quantum Identity - Describes a sovereign build or deployment
 */
export interface QuantumIdentity {
  /** Origin sigil from canonical manifest */
  origin: string;

  /** This deployment's unique sigil */
  sigil: string;

  /** Role or purpose of this deployment */
  role: string;

  /** Whether this is a sovereign (independent) deployment */
  sovereign: boolean;

  /** Local registry path or URL */
  registry?: string;

  /** Ed25519 public key for this identity */
  publicKey?: string;

  /** Additional metadata */
  metadata?: Record<string, JsonValue>;
}

/**
 * Lineage information for tracing sovereign evolution
 */
export interface Lineage {
  /** Parent sigil */
  parent: string;

  /** Version or commit at fork point */
  forkVersion: string;

  /** Timestamp of fork */
  forkTime: number;

  /** Divergence description */
  divergence?: string;
}
