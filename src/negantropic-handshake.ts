import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  generateKeyPair,
  signEvent,
  verifyEvent,
} from "../../src/sigilnet/src/main/crypto.js";
import { FieldCoherentRNG } from "../../src/device-registry/src/field/negentropic-hash.js";
import {
  NIndex,
  computeNegentropicIndex,
} from "../../src/sigilnet/src/utils/randomId.js";

export interface NegantropicHandshake {
  type: "handshake";
  version?: string;
  ts: number;
  nonce: string; // base64
  publicKey: string; // base64 Ed25519
  negHash: string; // hex
  nIndex: number;
  tags?: Record<string, string | number>;
  signature: string; // base64 detached
}

export interface NegantropicHandshakeParams {
  version?: string;
  tags?: Record<string, string | number>;
  keyPair?: { publicKey: string; secretKey: string };
}

const toBytes = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));
const clampFinite = (n: number) => (Number.isFinite(n) ? n : 0);

function computeNIndex(pubKeyB64: string): number {
  const bytes = toBytes(pubKeyB64);
  let nIndex = NaN;
  try {
    nIndex = NIndex(bytes);
  } catch {
    nIndex = computeNegentropicIndex([...bytes]);
  }
  return clampFinite(nIndex);
}

/**
 * Deterministic negentropic hash derived from public key and nIndex.
 * Uses simple weighting to keep verification reproducible.
 */
function deriveNegentropicHash(publicKey: string, nIndex: number): string {
  const data = Buffer.from(publicKey, "base64");
  const weight = Math.min(Math.max(nIndex, 0), 1);
  const salt = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    salt[i] = data[i] ^ Math.floor(weight * 255);
  }
  return createHash("sha256")
    .update(data)
    .update(salt)
    .update(Buffer.from(nIndex.toFixed(6)))
    .digest("hex");
}

/**
 * Build a signed handshake payload that includes negentropic hash and nonce.
 */
export function createNegantropicHandshake(
  params: NegantropicHandshakeParams = {},
): NegantropicHandshake {
  const keyPair = params.keyPair ?? generateKeyPair();
  const nIndex = computeNIndex(keyPair.publicKey);
  const negHash = deriveNegentropicHash(keyPair.publicKey, nIndex);
  const rng = new FieldCoherentRNG(nIndex, negHash);
  const nonceBytes = rng.nextBytes(16);
  const ts = Date.now();

  const unsigned: Omit<NegantropicHandshake, "signature"> = {
    type: "handshake",
    version: params.version,
    ts,
    nonce: Buffer.from(nonceBytes).toString("base64"),
    publicKey: keyPair.publicKey,
    negHash,
    nIndex,
    tags: params.tags,
  };

  const signature = signEvent(unsigned, keyPair.secretKey);
  return { ...unsigned, signature };
}

/**
 * Verify a negantropic handshake (signature and hash consistency).
 */
export function verifyNegantropicHandshake(hs: any): boolean {
  if (!hs || hs.type !== "handshake" || !hs.publicKey || !hs.signature) {
    return false;
  }
  const { signature, ...unsigned } = hs as NegantropicHandshake;
  const nIndex = computeNIndex(unsigned.publicKey);
  const expectedHash = deriveNegentropicHash(unsigned.publicKey, nIndex);

  if (unsigned.negHash !== expectedHash) return false;
  return verifyEvent(unsigned, signature, unsigned.publicKey);
}

export function isNegantropicHandshake(payload: any): payload is NegantropicHandshake {
  return (
    payload &&
    payload.type === "handshake" &&
    typeof payload.publicKey === "string" &&
    typeof payload.negHash === "string" &&
    typeof payload.nIndex === "number" &&
    typeof payload.signature === "string"
  );
}
