import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Base64String,
  assertUint8Array,
  computeNegentropicIndex,
  negeHash,
  negentropicHashFromBytes,
  randomNum,
  sessionNegentropicId,
  sovereignHash,
  toCanonicalJSON,
} from "../src/utils/randomId";

const { hashSpy, rngNext, rngInstances } = vi.hoisted(() => {
  return {
    hashSpy: vi.fn(
      (input: { data: Uint8Array; N: number }) =>
        `hash:${Array.from(input.data).join(",")}:${input.N.toFixed(6)}`,
    ),
    rngNext: vi.fn(() => 0.4242),
    rngInstances: [] as Array<{ N: number; peerId: string }>,
  };
});

vi.mock("../src/handshake/negentropic-hash", () => ({
  hashNegentropic: hashSpy,
  FieldCoherentRNG: class {
    public N: number;
    public peerId: string;

    constructor(N: number, peerId: string) {
      this.N = N;
      this.peerId = peerId;
      rngInstances.push({ N, peerId });
    }

    next() {
      return rngNext();
    }
  },
}));

describe("randomId utils", () => {
  beforeEach(() => {
    hashSpy.mockClear();
    rngNext.mockClear();
    rngNext.mockReturnValue(0.4242);
    rngInstances.length = 0;
  });

  it("computeNegentropicIndex returns 0 for empty samples", () => {
    expect(computeNegentropicIndex([])).toBe(0);
  });

  it("computeNegentropicIndex collapses constant series", () => {
    expect(computeNegentropicIndex([5, 5, 5, 5])).toBe(0);
  });

  it("computeNegentropicIndex stays finite for varied samples", () => {
    const value = computeNegentropicIndex([1, 2, 3, 4, 5, 6]);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it("sovereignHash decodes base64 input into bytes", () => {
    const base64 = "AQID" as Base64String; // 0x01,0x02,0x03
    const expectedBytes = Uint8Array.from([1, 2, 3]);

    const result = sovereignHash(base64);

    expect(result).toMatch(/hash:/);
    const call = hashSpy.mock.calls.at(-1)?.[0];
    expect(call).toBeTruthy();
    expect(Array.from(call!.data as Uint8Array)).toEqual(
      Array.from(expectedBytes),
    );
    expect(call!.N).toBeCloseTo(computeNegentropicIndex([1, 2, 3]));
  });

  it("negentropicHashFromBytes forwards Uint8Array data", () => {
    const bytes = Uint8Array.from([9, 8, 7, 6]);

    const result = negentropicHashFromBytes(bytes);

    expect(result).toMatch(/hash:/);
    const call = hashSpy.mock.calls.at(-1)?.[0];
    expect(Array.from(call!.data as Uint8Array)).toEqual([9, 8, 7, 6]);
    expect(call!.N).toBeCloseTo(computeNegentropicIndex([9, 8, 7, 6]));
  });

  it("negeHash normalizes iterables and array-like inputs", () => {
    hashSpy.mockClear();
    const generator = new Set([4, 5, 6]);
    negeHash(generator);
    const firstCall = hashSpy.mock.calls[0]?.[0];
    expect(Array.from(firstCall!.data as Uint8Array)).toEqual([4, 5, 6]);

    hashSpy.mockClear();
    const arrayLike = {
      length: 3,
      0: 7,
      1: 8,
      2: 9,
    } as unknown as ArrayLike<number>;
    negeHash(arrayLike);
    const secondCall = hashSpy.mock.calls[0]?.[0];
    expect(Array.from(secondCall!.data as Uint8Array)).toEqual([7, 8, 9]);
  });

  it("randomNum seeds FieldCoherentRNG with negentropic hash", () => {
    hashSpy.mockReturnValueOnce("sovereign");
    rngNext.mockReturnValueOnce(0.1337);
    const value = randomNum("AQID" as Base64String);

    expect(value).toBe(0.1337);
    expect(rngInstances).toHaveLength(1);
    const instance = rngInstances[0];
    expect(instance.N).toBeCloseTo(computeNegentropicIndex([1, 2, 3]));
    expect(instance.peerId).toBe("sovereign");
  });

  it("sessionNegentropicId hashes against session key pair", () => {
    hashSpy.mockReturnValueOnce("session-hash");
    const id = sessionNegentropicId({
      publicKey: "AQID" as Base64String,
      secretKey: "",
    });
    expect(id).toBe("session-hash");
  });

  it("assertUint8Array enforces inputs", () => {
    expect(() => assertUint8Array(new Uint8Array(), "buf")).not.toThrow();
    expect(() => assertUint8Array("nope", "bad")).toThrow(
      /bad must be Uint8Array/,
    );
  });

  it("toCanonicalJSON sorts object keys", () => {
    const value = toCanonicalJSON({ z: 1, a: 2, b: 3 });
    expect(value).toBe('{"a":2,"b":3,"z":1}');
  });
});
