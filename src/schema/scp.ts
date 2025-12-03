import { z } from "zod";

export type CapabilityValue =
  | boolean
  | string
  | number
  | CapabilityValue[]
  | { [key: string]: CapabilityValue };

const capabilityValueSchema: z.ZodType<CapabilityValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.string(),
    z.number(),
    z.array(capabilityValueSchema),
    z.record(z.string(), capabilityValueSchema),
  ]),
);

export const scpCapabilitySetSchema = z.record(
  z.string(),
  capabilityValueSchema,
);

export type NegentropyVector =
  | string
  | {
      hash?: string;
      entropy?: number;
      vector?: number[];
      [key: string]: unknown;
    };

const negentropyVectorSchema: z.ZodType<NegentropyVector> = z.union([
  z.string().min(1),
  z
    .object({
      hash: z.string().min(1).optional(),
      entropy: z.number().nonnegative().optional(),
      vector: z.array(z.number()).optional(),
    })
    .passthrough(),
]);

export const handshakeTagsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

export const handshakePayloadSchema = z
  .object({
    type: z.literal("handshake"),
    version: z.string().min(1).optional(),
    sid: z.string().min(1).optional(),
    caps: scpCapabilitySetSchema.optional(),
    nv: negentropyVectorSchema.optional(),
    ts: z.number().int().nonnegative().optional(),
    sig: z.string().min(1).optional(),
    tags: handshakeTagsSchema.optional(),
    nIndex: z.number().optional(),
    negHash: z.string().min(1).optional(),
  })
  .passthrough();

export const negantropicHandshakeSchema = handshakePayloadSchema
  .extend({
    ts: z.number().int().nonnegative(),
    nonce: z.string().min(1),
    publicKey: z.string().min(1),
    negHash: z.string().min(1),
    nIndex: z.number(),
    signature: z.string().min(1),
  })
  .passthrough();

export const scpStatePayloadSchema = z
  .object({
    type: z.literal("state"),
    sid: z.string().min(1),
    snapshot: z
      .object({
        stateHash: z.string().min(1),
        summary: z.string().optional(),
      })
      .passthrough()
      .optional(),
    delta: z
      .object({
        changes: z.array(
          z.union([z.string(), z.record(z.string(), z.unknown())]),
        ),
      })
      .passthrough()
      .optional(),
    merge: z
      .object({
        winner: z.string().min(1).optional(),
        strategy: z
          .enum(["winner", "arbitrate", "fallback"])
          .or(z.string())
          .optional(),
      })
      .passthrough()
      .optional(),
    ts: z.number().int().nonnegative(),
    sig: z.string().min(1),
  })
  .passthrough();

export type HandshakePayload = z.infer<typeof handshakePayloadSchema>;
export type NegantropicHandshake = z.infer<typeof negantropicHandshakeSchema>;
export type SCPStatePayload = z.infer<typeof scpStatePayloadSchema>;
export type SCPCapabilitySet = z.infer<typeof scpCapabilitySetSchema>;
