import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock tweetnacl and tweetnacl-util to keep crypto deterministic
const mockKeyPair = {
  publicKey: Uint8Array.from([1, 2, 3]),
  secretKey: Uint8Array.from([4, 5, 6]),
};

vi.mock("tweetnacl", () => {
  const before = vi.fn((pub: Uint8Array, sec: Uint8Array) =>
    Uint8Array.from([...pub, ...sec]),
  );
  const boxAfter = vi.fn(
    (msg: Uint8Array, nonce: Uint8Array, shared: Uint8Array) =>
      Uint8Array.from([...msg, ...nonce, ...shared]),
  );
  const boxOpenAfter = vi.fn(() => Uint8Array.from([116, 101, 115, 116])); // "test"
  const boxOpen = Object.assign(
    vi.fn(() => Uint8Array.from([116, 101, 115, 116])),
    { after: boxOpenAfter },
  );
  const keyPairFn = Object.assign(
    vi.fn(() => mockKeyPair),
    {
      fromSecretKey: vi.fn(() => mockKeyPair),
    },
  );

  const boxFn = Object.assign(
    vi.fn(
      (
        msg: Uint8Array,
        nonce: Uint8Array,
        theirPub: Uint8Array,
        mySec: Uint8Array,
      ) => Uint8Array.from([...msg, ...nonce, ...theirPub, ...mySec]),
    ),
    {
      keyPair: keyPairFn,
      before,
      after: boxAfter,
      open: boxOpen,
      nonceLength: 24,
    },
  );

  const api = {
    box: boxFn,
    randomBytes: vi.fn((len: number) =>
      Uint8Array.from({ length: len ?? 0 }, (_v, i) => i + 1),
    ),
  };
  return { default: api, ...api };
});

vi.mock("tweetnacl-util", () => {
  const api = {
    encodeUTF8: (u: Uint8Array) => new TextDecoder().decode(u),
    decodeUTF8: (s: string) => new TextEncoder().encode(s),
    encodeBase64: (u: Uint8Array) => Buffer.from(u).toString("base64"),
    decodeBase64: (s: string) => {
      if (!/^[A-Za-z0-9+/=]+$/.test(s)) {
        throw new Error("invalid base64");
      }
      return Uint8Array.from(Buffer.from(s, "base64"));
    },
  };
  return { default: api, ...api };
});

import {
  decryptFromPeer,
  decryptPayload,
  deriveSharedSecret,
  ed25519ToX25519SecretKey,
  encryptForPeer,
  encryptPayload,
  generateSessionKeyPair,
} from "../src/session";

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a base64 session key pair", () => {
    const kp = generateSessionKeyPair();
    expect(kp.publicKey).toBe(
      Buffer.from(mockKeyPair.publicKey).toString("base64"),
    );
    expect(kp.secretKey).toBe(
      Buffer.from(mockKeyPair.secretKey).toString("base64"),
    );
  });

  it("derives X25519 secret key from ed25519 secret", () => {
    const sk = Buffer.from([
      ...mockKeyPair.secretKey,
      ...mockKeyPair.publicKey,
    ]).toString("base64");
    const xsk = ed25519ToX25519SecretKey(sk);
    expect(xsk).toBe(Buffer.from(mockKeyPair.secretKey).toString("base64"));
  });

  it("derives shared secret via nacl.box.before", () => {
    const secret = deriveSharedSecret(
      Buffer.from(mockKeyPair.secretKey).toString("base64"),
      Buffer.from(mockKeyPair.publicKey).toString("base64"),
    );
    const expected = Buffer.from([
      ...mockKeyPair.publicKey,
      ...mockKeyPair.secretKey,
    ]).toString("base64");
    expect(secret).toBe(expected);
  });

  it("encrypts and decrypts payload with shared secret", () => {
    const shared = Buffer.from([9, 9, 9]).toString("base64");
    const encrypted = encryptPayload("hello", shared);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.nonce).toBeTruthy();

    const decrypted = decryptPayload(encrypted, shared);
    expect(decrypted).toBe("test"); // from mock box.open.after
  });

  it("decryptPayload returns null on invalid payload", () => {
    const result = decryptPayload(
      { ciphertext: "!!bad!!", nonce: "not-base64" },
      "bad-shared",
    );
    expect(result).toBeNull();
  });

  it("encrypts/decrypts for peer using session keys", () => {
    const mySecret = Buffer.from([4, 5, 6]).toString("base64");
    const theirPublic = Buffer.from([1, 2, 3]).toString("base64");
    const encrypted = encryptForPeer("msg", mySecret, theirPublic);
    expect(encrypted.ciphertext).toBeTruthy();

    const decrypted = decryptFromPeer(encrypted, mySecret, theirPublic);
    expect(decrypted).toBe("test");
  });
});
