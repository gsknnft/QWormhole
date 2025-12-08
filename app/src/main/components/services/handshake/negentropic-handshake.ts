import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  negentropicHandshakeSchema,
  type NegentropicHandshake,
} from '../../../../shared/scp';

export interface NegentropicHandshakeParams {
  version?: string;
  tags?: Record<string, string | number>;
  keyPair?: { publicKey: string; secretKey: string };
}

const toBytes = (b64: string) => Buffer.from(b64, 'base64');

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

export function computeNIndex(pubKeyB64: string): number {
  const bytes = toBytes(pubKeyB64);
  const entropy = Math.max(calculateEntropy(bytes), 1e-6);
  const coherence = bytes.length
    ? bytes[0] / (bytes.reduce((a, b) => a + b, 0) || 1)
    : 0;
  const nIndex = coherence / entropy;
  if (!Number.isFinite(nIndex)) {
    return 0;
  }
  return Math.min(Math.max(nIndex, 0), 1);
}

function deriveNegentropicHash(publicKey: string, nIndex: number): string {
  const data = toBytes(publicKey);
  const weight = Math.min(Math.max(nIndex, 0), 1);
  const salted = Buffer.from(data.map((b) => b ^ Math.floor(weight * 255)));
  return createHash('sha256')
    .update(data)
    .update(salted)
    .update(Buffer.from(nIndex.toFixed(6)))
    .digest('hex');
}

class FieldCoherentRNG {
  private seed: Buffer;
  private counter = 0;
  constructor(seedHex: string) {
    this.seed = Buffer.from(seedHex, 'hex');
  }
  nextBytes(length: number): Buffer {
    const out = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      const h = createHash('sha256')
        .update(this.seed)
        .update(Buffer.from([this.counter & 0xff]))
        .digest();
      out[i] = h[0];
      this.counter++;
    }
    return out;
  }
}

function canonicalizeRecord(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_, current) => {
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      !Buffer.isBuffer(current)
    ) {
      const sorted = Object.keys(current as Record<string, unknown>).sort();
      return sorted.reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (current as Record<string, unknown>)[key];
        return acc;
      }, {});
    }
    return current;
  });
}

/**
 * Build a signed handshake payload that includes negentropic hash and nonce.
 */
export function createNegentropicHandshake(
  params: NegentropicHandshakeParams = {},
): NegentropicHandshake {
  const kp =
    params.keyPair ??
    (() => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      return {
        publicKey: publicKey
          .export({ format: 'der', type: 'spki' })
          .toString('base64'),
        secretKey: privateKey
          .export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
      };
    })();

  const nIndex = computeNIndex(kp.publicKey);
  const negHash = deriveNegentropicHash(kp.publicKey, nIndex);
  const rng = new FieldCoherentRNG(negHash);
  const nonceBytes = rng.nextBytes(16);
  const ts = Date.now();

  const unsigned: Omit<NegentropicHandshake, 'signature'> = {
    type: 'handshake',
    version: params.version,
    ts,
    nonce: nonceBytes.toString('base64'),
    publicKey: kp.publicKey,
    negHash,
    nIndex,
    tags: params.tags,
  };

  const canonicalUnsigned = canonicalizeRecord(unsigned);
  const signature = sign(
    null,
    Buffer.from(canonicalUnsigned),
    createPrivateKey({
      key: Buffer.from(kp.secretKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    }),
  ).toString('base64');

  return negentropicHandshakeSchema.parse({ ...unsigned, signature });
}

/**
 * Verify a negentropic handshake (signature and hash consistency).
 */
export function verifyNegentropicHandshake(hs: unknown): boolean {
  const parsed = negentropicHandshakeSchema.safeParse(hs);
  if (!parsed.success) {
    return false;
  }
  const { signature, ...unsigned } = parsed.data;
  const nIndex = computeNIndex(unsigned.publicKey);
  const expectedHash = deriveNegentropicHash(unsigned.publicKey, nIndex);
  if (unsigned.negHash !== expectedHash) return false;
  const canonicalUnsigned = canonicalizeRecord(
    unsigned as Record<string, unknown>,
  );
  return verify(
    null,
    Buffer.from(canonicalUnsigned),
    createPublicKey({
      key: Buffer.from(unsigned.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    }),
    Buffer.from(signature, 'base64'),
  );
}

export function isNegentropicHandshake(
  payload: unknown,
): payload is NegentropicHandshake {
  return negentropicHandshakeSchema.safeParse(payload).success;
}
