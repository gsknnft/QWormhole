import type {
  Deserializer,
  QWormholeRequest,
  QWormholeResponse,
  Serializer,
} from "src/types/types";
import type { QWEnvelope } from "./index";

type EncodedEnvelope =
  | { kind: "request"; v: 1; id: string; req: QWormholeRequest; body?: string }
  | {
      kind: "response";
      v: 1;
      id: string;
      status: QWormholeResponse;
      body?: string;
      error?: string;
    };

const toBase64 = (body?: Uint8Array): string | undefined =>
  body ? Buffer.from(body).toString("base64") : undefined;

const fromBase64 = (body?: string): Uint8Array | undefined =>
  body ? Buffer.from(body, "base64") : undefined;

const normalize = (env: QWEnvelope): EncodedEnvelope => {
  if (env.kind === "request") {
    return {
      v: 1,
      kind: env.kind,
      id: env.id,
      req: env.req,
      body: toBase64(env.body),
    };
  }
  return {
    v: 1,
    kind: env.kind,
    id: env.id,
    status: env.status,
    body: toBase64(env.body),
    error: env.error,
  };
};

const denormalize = (enc: EncodedEnvelope): QWEnvelope => {
  if (enc.kind === "request") {
    return {
      v: 1,
      kind: "request",
      id: enc.id,
      req: enc.req,
      body: fromBase64(enc.body),
    };
  }
  return {
    v: 1,
    kind: "response",
    id: enc.id,
    status: enc.status,
    body: fromBase64(enc.body),
    error: enc.error,
  };
};

export const envelopeSerializer: Serializer = payload => {
  const env = payload as QWEnvelope;
  const normalized = normalize(env);
  return Buffer.from(JSON.stringify(normalized), "utf8");
};

export const envelopeDeserializer: Deserializer<QWEnvelope> = data => {
  const text = data.toString("utf8");
  const parsed = JSON.parse(text) as EncodedEnvelope;
  return denormalize(parsed);
};
