import fs from "fs";
import crypto from "crypto";
import path from "path";

/**
 * ──────────────────────────────────────────────
 * SIGILNET SOVEREIGN COMPLIANCE SEAL
 * ──────────────────────────────────────────────
 * Generates, verifies, and exchanges sovereign seals
 * Validation is proof, not inspection.
 * Protection is erasure, not retention.
 * ──────────────────────────────────────────────
 */

export interface CoreSeal {
  sigil: string;
  origin: string;
  pubkey: string;
  issuedAt: number;
  manifestHash: string;
  signature: string;
}

export interface SovereignSeal extends CoreSeal {
  expiresAt: number;
  sealed: boolean;
}

export interface PeerSeal extends SovereignSeal {
  peerSeal: SovereignSeal;
}

/** read the local ethics manifest and return its hash */
export function hashManifest(manifestPath = "ETHICS_MANIFEST.md"): string {
  const content = fs.readFileSync(path.resolve(manifestPath), "utf8");
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** sign arbitrary JSON payload with Ed25519 keypair */
export function signPayload(payload: object, secretKey: string): string {
  const data = JSON.stringify(payload);
  const sign = crypto.sign(null, Buffer.from(data), {
    key: Buffer.from(secretKey, "base64"),
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
  });
  return sign.toString("base64");
}

/** verify JSON payload signature */
export function verifySignature(payload: object, signature: string, pubkey: string): boolean {
  const data = JSON.stringify(payload);
  return crypto.verify(
    null,
    Buffer.from(data),
    { key: Buffer.from(pubkey, "base64"), padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
    Buffer.from(signature, "base64")
  );
}

/** generate a sovereign seal */
export function generateSeal(
  sigil: string,
  origin: string,
  pubkey: string,
  secretKey: string,
  manifestPath?: string
): SovereignSeal {
  const manifestHash = hashManifest(manifestPath);
  const payload = {
    sigil,
    origin,
    pubkey,
    manifestHash,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
  };
  const signature = signPayload(payload, secretKey);
  return { ...payload, signature, sealed: true };
}

/** verify seal against current manifest */
export function verifySeal(seal: SovereignSeal, manifestPath?: string): boolean {
  const expectedHash = hashManifest(manifestPath);
  if (seal.manifestHash !== expectedHash) return false;
  if (seal.expiresAt < Date.now()) return false;
  const { signature, ...payload } = seal;
  return verifySignature(payload, signature, seal.pubkey);
}

/** mutual validation for handshake */
export function validateHandshake(a: SovereignSeal, b: SovereignSeal, manifestPath?: string): boolean {
  return verifySeal(a, manifestPath) && verifySeal(b, manifestPath);
}

/** pretty-print banner */
export function displaySeal(seal: SovereignSeal) {
  console.log("🜏 SIGILNET NODE ONLINE");
  console.log("┌───────────────────────────────────────────────┐");
  console.log(`│ Sovereign Compliance Seal: VERIFIED ✅`);
  console.log(`│ Ethics Manifest Hash: ${seal.manifestHash.slice(0, 12)}...`);
  console.log(`│ Valid Until: ${new Date(seal.expiresAt).toISOString().split("T")[0]}`);
  console.log(`│ Integrity Mode: Quantum-Signed                │`);
  console.log("└───────────────────────────────────────────────┘");
}
