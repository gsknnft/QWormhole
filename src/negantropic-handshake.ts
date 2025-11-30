import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";

export interface NegantropicHandshake {
  type: "handshake";
  version?: string;
  ts: number;
  nonce: string; // base64
  publicKey: string; // base64
  negHash: string; // hex
  nIndex: number;
  tags?: Record<string, string | number>;
  signature: string; // base64
}

export interface NegantropicHandshakeParams {
  version?: string;
  tags?: Record<string, string | number>;
  keyPair?: { publicKey: string; secretKey: string };
}

const toBytes = (b64: string) => Buffer.from(b64, "base64");

function calculateEntropy(bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const freq = new Map<number, number>();
  for (const b of bytes) freq.set(b, (freq.get(b) ?? 0) + 1);
  let entropy = 0;
  const len = bytes.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy || 0;
}

function computeNIndex(pubKeyB64: string): number {
  const bytes = toBytes(pubKeyB64);
  const entropy = Math.max(calculateEntropy(bytes), 1e-6);
  const coherence = bytes.length ? bytes[0] / (bytes.reduce((a, b) => a + b, 0) || 1) : 0;
  const nIndex = coherence / entropy;
  return Number.isFinite(nIndex) ? nIndex : 0;
}

function deriveNegentropicHash(publicKey: string, nIndex: number): string {
  const data = toBytes(publicKey);
  const weight = Math.min(Math.max(nIndex, 0), 1);
  const salted = Buffer.from(
    data.map(b => b ^ Math.floor(weight * 255)),
  );
  return createHash("sha256")
    .update(data)
    .update(salted)
    .update(Buffer.from(nIndex.toFixed(6)))
    .digest("hex");
}

class FieldCoherentRNG {
  private seed: Buffer;
  private counter = 0;
  constructor(seedHex: string) {
    this.seed = Buffer.from(seedHex, "hex");
  }
  nextBytes(length: number): Buffer {
    const out = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      const h = createHash("sha256")
        .update(this.seed)
        .update(Buffer.from([this.counter & 0xff]))
        .digest();
      out[i] = h[0];
      this.counter++;
    }
    return out;
  }
}

/**
 * Build a signed handshake payload that includes negentropic hash and nonce.
 */
export function createNegantropicHandshake(
  params: NegantropicHandshakeParams = {},
): NegantropicHandshake {
  const kp =
    params.keyPair ??
    (() => {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      return {
        publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
        secretKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      };
    })();

  const nIndex = computeNIndex(kp.publicKey);
  const negHash = deriveNegentropicHash(kp.publicKey, nIndex);
  const rng = new FieldCoherentRNG(negHash);
  const nonceBytes = rng.nextBytes(16);
  const ts = Date.now();

  const unsigned: Omit<NegantropicHandshake, "signature"> = {
    type: "handshake",
    version: params.version,
    ts,
    nonce: nonceBytes.toString("base64"),
    publicKey: kp.publicKey,
    negHash,
    nIndex,
    tags: params.tags,
  };

  const signature = sign(null, Buffer.from(JSON.stringify(unsigned)), {
    key: Buffer.from(kp.secretKey, "base64"),
  }).toString("base64");

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
  return verify(
    null,
    Buffer.from(JSON.stringify(unsigned)),
    { key: Buffer.from(unsigned.publicKey, "base64") },
    Buffer.from(signature, "base64"),
  );
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
