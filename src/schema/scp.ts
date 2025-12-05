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
    .catchall(z.unknown()),
]);

export const handshakeTagsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

/**
 * Entropy velocity indicator for adaptive transport policy
 */
export const entropyVelocitySchema = z.enum([
  "low",
  "stable",
  "rising",
  "spiking",
]);

/**
 * Coherence level indicator for adaptive transport policy
 */
export const coherenceLevelSchema = z.enum(["high", "medium", "low", "chaos"]);

/**
 * Handshake mode derived from negentropic index
 */
export const handshakeModeSchema = z.enum([
  "trust-zero",
  "trust-light",
  "immune",
  "paranoia",
]);

/**
 * Entropy metrics for adaptive handshake (0.3.2 roadmap)
 */
export const entropyMetricsSchema = z
  .object({
    /** Shannon entropy of the session (0-8 for byte data) */
    entropy: z.number().nonnegative().optional(),
    /** Rate of change of entropy over time */
    entropyVelocity: entropyVelocitySchema.optional(),
    /** Coherence level of the peer */
    coherence: coherenceLevelSchema.optional(),
    /** Negentropic index (0-1, derived from coherence/entropy) */
    negIndex: z.number().min(0).max(1).optional(),
  })
  .catchall(z.unknown());

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
    /** Entropy metrics for adaptive transport (0.3.2) */
    entropyMetrics: entropyMetricsSchema.optional(),
  })
  .catchall(z.unknown());

export const negentropicHandshakeSchema = handshakePayloadSchema
  .extend({
    ts: z.number().int().nonnegative(),
    nonce: z.string().min(1),
    publicKey: z.string().min(1),
    negHash: z.string().min(1),
    nIndex: z.number(),
    signature: z.string().min(1),
  })
  .catchall(z.unknown());

export const scpStatePayloadSchema = z
  .object({
    type: z.literal("state"),
    sid: z.string().min(1),
    snapshot: z
      .object({
        stateHash: z.string().min(1),
        summary: z.string().optional(),
      })
      .catchall(z.unknown())
      .optional(),
    delta: z
      .object({
        changes: z.array(
          z.union([z.string(), z.record(z.string(), z.unknown())]),
        ),
      })
      .catchall(z.unknown())
      .optional(),
    merge: z
      .object({
        winner: z.string().min(1).optional(),
        strategy: z
          .enum(["winner", "arbitrate", "fallback"])
          .or(z.string())
          .optional(),
      })
      .catchall(z.unknown())
      .optional(),
    ts: z.number().int().nonnegative(),
    sig: z.string().min(1),
  })
  .catchall(z.unknown());

export type HandshakePayload = z.infer<typeof handshakePayloadSchema>;
export type NegentropicHandshake = z.infer<typeof negentropicHandshakeSchema>;
export type SCPStatePayload = z.infer<typeof scpStatePayloadSchema>;
export type SCPCapabilitySet = z.infer<typeof scpCapabilitySetSchema>;
export type EntropyMetricsPayload = z.infer<typeof entropyMetricsSchema>;
export type EntropyVelocity = z.infer<typeof entropyVelocitySchema>;
export type CoherenceLevel = z.infer<typeof coherenceLevelSchema>;
export type HandshakeMode = z.infer<typeof handshakeModeSchema>;
