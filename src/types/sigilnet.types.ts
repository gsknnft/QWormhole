import type { WireGuardAdapter } from "../adapters/wireguard-adapter";
import type { JsonValue } from "./sigil.types";
import type { PeerSeal, SovereignSeal } from "../utils/seal";

interface Runtime {
  log: (msg: string) => void;
  identityHash: Buffer;
  tunnel: Tunnel;
}

/**
 * Encrypted payload for secure peer-to-peer communication
 */
interface EncryptedPayload {
  ciphertext: string; // Base64 encoded encrypted data
  nonce: string; // Base64 encoded nonce
  /** Encryption algorithm used (default: "X25519-XSalsa20-Poly1305") */
  algorithm?: string;
}


/**
 * Core string Event - The fundamental message structure
 */
interface SigilEvent {
  /** Symbolic identifier - the sigil itself */
  sigil: string;

  /** string identifier - who generated this event */
  origin: string;

  /** Timestamp in Unix milliseconds */
  ts: number;

  /** Metrics associated with this event */
  metrics: SigilMetrics;

  /** Semantic intent - what this event means */
  intent: string;

  /** Ed25519 signature (base64 encoded) - optional but recommended */
  signature?: string;

  /** Optional payload - can be any JSON-serializable data */
  payload?: JsonValue;

  /** Optional encrypted payload for secure communication */
  encryptedPayload?: EncryptedPayload;

  /** Target origin for directed messages */
  targetOrigin?: string;

  /** Session identifier for multi-message exchanges */
  sessionId?: string;

  /** Message sequence number within a session */
  sequence?: number;
}


interface RuntimeConfig {
  /** Node identifier */
  origin: string;
  /** Node sigil */
  sigil: string;
  /** UDP port for router */
  port?: number;
  /** Broadcast address */
  broadcast?: string;
  /** Enable Infisical integration */
  useInfisical?: boolean;
  /** Key rotation interval in milliseconds */
  keyRotationInterval?: number;
  /** Enable sovereign tunnel */
  enableTunnel?: boolean;
  /** Optional adapters (e.g., WireGuard) */
  adapters?: {
    wireguard?: WireGuardAdapter;
  };
}

interface RuntimeStats {
  eventsSent: number;
  eventsReceived: number;
  eventsVerified: number;
  eventsRejected: number;
  uptime: number;
  startTime: number;
  activeSessions?: number;
  knownPeers?: number;
}

type ResolvedRuntimeConfig = Required<Omit<RuntimeConfig, "adapters">> &
  Pick<RuntimeConfig, "adapters">;

/*
 * Metrics captured in a sigil event
 * These represent quantum-inspired measurements of system state
 */
interface SigilMetrics {
  /** Entropy level (0-2+), measures system randomness/disorder */
  entropy: number;

  /** Coherence level (0-1), measures system synchronization */
  coherence: number;

  /** Phase velocity (optional), measures signal propagation speed */
  phaseVelocity?: number;

  /** Signal strength (optional), measures connection quality */
  signalStrength?: number;

  /** Latency in milliseconds (optional) */
  latency?: number;

  /** Custom metrics (extensible) */
  [key: string]: number | undefined;
}

/**
 * Tunnel event types for sovereign VPN functionality
 */
type TunnelIntent =
  | "tunnel-packet" // Tunnel arbitrary data through mesh
  | "relay-packet" // Relay packet to another peer
  | "session-handshake" // Establish encrypted session
  | "session-key-exchange" // Exchange X25519 public keys
  | "session-ack" // Acknowledge session establishment
  | "session-close"; // Close encrypted session

/**
 * Session handshake event
 */
interface SessionHandshakeEvent extends SigilEvent {
  intent: "session-handshake" | "session-key-exchange" | "session-ack";
  x25519PublicKey: string; // X25519 public key for session encryption
  sessionId?: string; // Optional session identifier
}

/**
 * Immutable proof of field coherence and entropy balance
 * for distributed validation (used by Naoris adapter, etc.)
 */
interface FieldProof {
  type: "field_proof";
  negentropicIndex: number;
  entropy: number;
  coherence: number;
  timestamp: number;
  signature?: string; // optional Ed25519 signature
  source?: string; // optional node id or origin
  proofRef?: string; // optional on-chain tx id
}

/**
 * Peer metadata and keys
 */
interface Peer extends PeerBase {
  id: string;
  host: string;
  port: number;
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
  metadata?: Record<string, JsonValue>;

  seal?: PeerSeal;

  metrics?: SigilMetrics;
}

/**
 * Coherence metrics for validation
 */
interface CoherenceThresholds {
  /** Minimum entropy threshold */
  minEntropy: number;

  /** Maximum entropy threshold */
  maxEntropy: number;

  /** Minimum coherence threshold */
  minCoherence: number;

  /** Maximum phase velocity (optional) */
  maxPhaseVelocity?: number;
}

interface Tunnel {
  initiateSession(peer: Peer): Promise<void | SessionHandshakeEvent> | void;
}

/**
 * Session state for an active encrypted channel
 */
interface Session {
  sessionId: string;
  peerOrigin: string;
  myX25519SecretKey: string;
  myX25519PublicKey: string;
  peerX25519PublicKey: string;
  established: boolean;
  createdAt: number;
  lastActivity: number;
}


/**
 * string Registry Entry - Metadata about a sigil type
 */
interface SigilDefinition {
  /** The sigil symbol */
  sigil: string;

  /** Human-readable name */
  name: string;

  /** Description of purpose and usage */
  description: string;

  /** Typical intent values for this sigil */
  intents: string[];

  /** Expected metrics (for validation) */
  expectedMetrics?: (keyof SigilMetrics)[];

  /** Whether signature is required */
  requiresSignature?: boolean;
}

export type {
  SigilDefinition,
  PeerBase,
  PeerSeal,
  SovereignSeal,
  RuntimeStats,
  RuntimeConfig,
  ResolvedRuntimeConfig,
  TunnelIntent,
  FieldProof,
  SigilMetrics,
  EncryptedPayload,
  SigilEvent,
  SessionHandshakeEvent,
  Session,
  CoherenceThresholds,
  Peer,
  Tunnel,
  Runtime,
};
