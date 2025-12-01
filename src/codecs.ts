import type { Deserializer, Serializer } from "types";

export const defaultSerializer: Serializer = payload => {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  return Buffer.from(JSON.stringify(payload), "utf8");
};

export const bufferDeserializer: Deserializer<Buffer> = data => data;

export const textDeserializer: Deserializer<string> = data =>
  data.toString("utf8");

export const bigint2Str = (_key: string, value: unknown): unknown => {
  return typeof value === 'bigint' ? value.toString() : value;
}

export const jsonDeserializer: Deserializer<unknown> = data => {
  const text = data.toString("utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    // Optionally emit/log error here
    return null; // or throw a custom error if needed
  }
};

export const jsonSerializer: Serializer = payload => {
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  return Buffer.from(JSON.stringify(payload, bigint2Str), "utf8");
};

// CBOR helpers (lightweight lazy import to avoid hard dep if unused)
export const createCborSerializer = (): Serializer => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cbor = require("cbor") as typeof import("cbor");
  return payload => {
    if (Buffer.isBuffer(payload)) return payload;
    return cbor.encode(payload);
  };
};

export const createCborDeserializer = <T = unknown>(): Deserializer<T> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cbor = require("cbor") as typeof import("cbor");
  return data => cbor.decode(data);
};
