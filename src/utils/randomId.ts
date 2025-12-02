import {
  FieldCoherentRNG,
  hashNegentropic,
  NegentropicHashInput,
} from "../handshake/negentropic-hash";
import { SessionKeyPair } from "../session";

export type Base64String = string & { __brand: "base64" };

type ComplexPoint = { real: number; imag: number };

type BufferLike = {
  from(input: string, encoding: string): ArrayLike<number>;
};

function decodeBase64(value: string): Uint8Array {
  const bufferCtor = (globalThis as { Buffer?: BufferLike }).Buffer;
  if (bufferCtor && typeof bufferCtor.from === "function") {
    return Uint8Array.from(bufferCtor.from(value, "base64"));
  }

  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  if (atobFn) {
    const binary = atobFn(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  return decodeBase64Polyfill(value);
}

const BASE64_TABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeBase64Polyfill(input: string): Uint8Array {
  const sanitized = input.replace(/[^A-Za-z0-9+/=]/g, "");
  const output: number[] = [];

  for (let i = 0; i < sanitized.length; i += 4) {
    const chunk = sanitized.slice(i, i + 4);
    const indices = chunk.split("").map((char, idx) => {
      if (char === "=") return 0;
      const value = BASE64_TABLE.indexOf(char);
      if (value === -1) {
        throw new Error(`Invalid base64 character at position ${i + idx}`);
      }
      return value;
    });

    const bits =
      (indices[0]! << 18) |
      (indices[1]! << 12) |
      (indices[2]! << 6) |
      indices[3]!;

    output.push((bits >> 16) & 0xff);
    if (chunk[2] !== "=") output.push((bits >> 8) & 0xff);
    if (chunk[3] !== "=") output.push(bits & 0xff);
    if (chunk[3] === "=") break;
  }

  return Uint8Array.from(output);
}

function calculateEntropy(bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const counts = new Array(256).fill(0) as number[];
  bytes.forEach(value => {
    counts[value] += 1;
  });
  let entropy = 0;
  const len = bytes.length;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function computeFFT(samples: Float64Array): ComplexPoint[] {
  const n = samples.length;
  if (!n) return [];
  const output: ComplexPoint[] = new Array(n);
  for (let k = 0; k < n; k += 1) {
    let real = 0;
    let imag = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;
      const value = samples[t]!;
      real += value * Math.cos(angle);
      imag += value * Math.sin(angle);
    }
    output[k] = { real, imag };
  }
  return output;
}

function toBytes(pub: string | Uint8Array): Uint8Array {
  if (typeof pub === "string") {
    // base64 vs hex — make the contract explicit
    return decodeBase64(pub);
  }
  return pub;
}

function center(samples: number[]): Float64Array {
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(samples.length, 1);
  return Float64Array.from(samples.map(s => s - mean));
}

export function computeNegentropicIndex(samples: number[]): number {
  if (!samples.length) return 0;
  const fft = computeFFT(center(samples));
  const magnitudes = fft.map(({ real, imag }) => Math.hypot(real, imag));
  const sum = magnitudes.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
  const coherence = sum ? magnitudes[0] / sum : 0;
  const entropy = Math.max(calculateEntropy(Uint8Array.from(samples)), 1e-6);
  return coherence / entropy;
}

export function sovereignHash(sessionKey: Uint8Array | Base64String) {
  const publicKeyBytes = toBytes(sessionKey);
  const input = {
    data: publicKeyBytes,
    N: computeNegentropicIndex([...publicKeyBytes]),
  };
  return hashNegentropic(input);
}

export function negentropicHashFromBytes(data: Uint8Array): string {
  const input: NegentropicHashInput = {
    data,
    N: computeNegentropicIndex([...data]),
  };
  return hashNegentropic(input);
}

export function randomNum(seedPublicKey: Uint8Array | Base64String): number {
  const pub = toBytes(seedPublicKey);
  const fcRNG = new FieldCoherentRNG(
    computeNegentropicIndex([...pub]),
    sovereignHash(pub),
  );
  return fcRNG.next();
}

export function assertUint8Array(
  u: unknown,
  label: string,
): asserts u is Uint8Array {
  if (!(u instanceof Uint8Array))
    throw new Error(`${label} must be Uint8Array`);
}
export function toCanonicalJSON(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function NIndex(publicKeyBytes: Uint8Array) {
  return computeNegentropicIndex([...publicKeyBytes]);
}

// export function NIndex(samples: number[]) { if (!samples.length) return { N: 0, C: 0, H: 1, mode: "immune" as const }; // center and FFT (your existing helpers)
//   const x = center(samples); // mean-subtract
//   const X = fftPow(x); // power spectrum Float64Array
//   const total = X.reduce((a,b)=>a+b, 0) + 1e-12; const C = Math.max(...X) / total; // entropy over normalized spectrum
//   const p = X.map(v => v/total); const H = -p.reduce((s,pi)=>pi>0? s + pi*Math.log2(pi) : s, 0) / Math.log2(p.length); const N = C/(H+1e-6); const mode = (N < 0.4) ? "immune" : (N > 0.8 ? "consensus" : "equil"); return { N, C, H, mode };
// }
// const negentropicSeed = QuantumSignalSuite.randomFromField(stateVector);
// const buildId = crypto.createHash('blake2b512').update(negentropicSeed).digest('hex');

export function sessionNegentropicId(sessionKeys: SessionKeyPair): string {
  const publicKeyBytes = toBytes(sessionKeys.publicKey);
  const input: NegentropicHashInput = {
    data: publicKeyBytes,
    N: computeNegentropicIndex([...publicKeyBytes]),
  };
  return hashNegentropic(input);
}

export function negeHash(d: Iterable<number> | ArrayLike<number>) {
  const data: number[] =
    typeof (d as ArrayLike<number>).length === "number"
      ? Array.from({ length: (d as ArrayLike<number>).length }, (_, idx) =>
          Number((d as ArrayLike<number>)[idx] ?? 0),
        )
      : Array.from(d as Iterable<number>, value => Number(value));
  const N = computeNegentropicIndex(data);
  const input: NegentropicHashInput = {
    data: Uint8Array.from(data), // convert number[] to Uint8Array
    N,
  };
  return hashNegentropic(input);
}

// function deriveSessionKey(shared: Uint8Array, N: number, ts: number) {
//   const salt = sha256(new TextEncoder().encode(`${N}:${ts}`));
//   return hkdf(sha256, shared, salt, new Uint8Array(), 32);
// }

// export function randomNum(): number {
//     const sessionKeys: SessionKeyPair = generateSessionKeyPair();
//     let publicKeyBytes: Uint8Array;
//     if (typeof sessionKeys.publicKey === "string") {
//         // Assuming base64 encoding; adjust if hex or other
//         publicKeyBytes = Uint8Array.from(atob(sessionKeys.publicKey), c => c.charCodeAt(0));
//     } else {
//         publicKeyBytes = sessionKeys.publicKey as Uint8Array;
//     }
//     const fcRNG = new FieldCoherentRNG(NIndex(publicKeyBytes), sessString());
//     console.log(`Randomness Check!: ${fcRNG.next()}`)
//     return fcRNG.next();
// }
