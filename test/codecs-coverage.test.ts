import { describe, expect, it } from "vitest";
import {
  defaultSerializer,
  bufferDeserializer,
  textDeserializer,
  jsonSerializer,
  jsonDeserializer,
  createCborSerializer,
  createCborDeserializer,
} from "../src/codecs.js";

describe("codecs coverage", () => {
  it("serializes and deserializes common payloads", () => {
    const buf = Buffer.from("hello");
    expect(defaultSerializer(buf)).toBe(buf);

    const u8 = new Uint8Array([1, 2, 3]);
    expect(defaultSerializer(u8)).toEqual(Buffer.from(u8));

    const obj = { a: 1 };
    const serialized = defaultSerializer(obj);
    expect(jsonDeserializer(serialized)).toEqual(obj);

    const text = textDeserializer(Buffer.from("hi", "utf8"));
    expect(text).toBe("hi");

    const big = { id: 1n };
    const bigBuf = jsonSerializer(big);
    expect(jsonDeserializer(bigBuf)).toEqual({ id: "1" });
  });

  it("round-trips CBOR payloads", () => {
    const serialize = createCborSerializer();
    const deserialize = createCborDeserializer<{ foo: string; n: number }>();
    const payload = { foo: "bar", n: 42 };
    const encoded = serialize(payload);
    const decoded = deserialize(encoded);
    expect(decoded).toEqual(payload);
  });
});
