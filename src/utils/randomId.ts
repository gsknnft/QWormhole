import { calculateEntropy } from "@sigilnet/qsecure";
import {
  FieldCoherentRNG,
  hashNegentropic,
  NegentropicHashInput,
} from "../handshake/negentropic-hash";
import { SessionKeyPair } from "../session";
import { computeFFT } from "@sigilnet/fft-ts";
// import { Peer } from "../types/sigilnet.types";

// Example: hkdf over shared secret with protocol-tagged salt
// const info = new TextEncoder().encode("SigilNet/v1:session");
// const salt = new TextEncoder().encode(`${N}:${ts}`);
// const key = hkdf(sha256, shared, salt, info, 32);
export type Base64String = string & { __brand: "base64" };

function toBytes(pub: string | Uint8Array): Uint8Array {
  if (typeof pub === "string") {
    // base64 vs hex — make the contract explicit
    return Uint8Array.from(Buffer.from(pub, "base64"));
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
  const magnitudes = fft.map(c => Math.hypot(c.real, c.imag));
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
