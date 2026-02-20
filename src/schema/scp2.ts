// import { z } from "zod";

// type CapabilityValue =
//   | boolean
//   | string
//   | number
//   | CapabilityValue[]
//   | { [key: string]: CapabilityValue };

// const capabilityValueSchema: z.ZodType<CapabilityValue> = z.lazy(() =>
//   z.union([
//     z.boolean(),
//     z.string(),
//     z.number(),
//     z.array(capabilityValueSchema),
//     z.record(z.string(), capabilityValueSchema),
//   ]),
// );

// const scpCapabilitySetSchema = z.record(
//   z.string(),
//   capabilityValueSchema,
// );

// type NegentropyVector =
//   | string
//   | {
//       hash?: string;
//       entropy?: number;
//       vector?: number[];
//       [key: string]: unknown;
//     };

// // SCP spec: require full negentropy vector fields
// const negentropyVectorSchema = z.object({
//   H_shannon: z.number().nonnegative(),
//   H_spectral: z.number().nonnegative(),
//   K_complexity: z.number().nonnegative(),
//   temporal_stability: z.number().nonnegative(),
//   hash: z.string().min(1),
//   vector: z.array(z.number()),
// });

//  const handshakeTagsSchema = z.record(
//   z.string(),
//   z.union([z.string(), z.number()]),
// );

// /**
//  * Entropy velocity indicator for adaptive transport policy
//  */
//  const entropyVelocitySchema = z.enum([
//   "low",
//   "stable",
//   "rising",
//   "spiking",
// ]);

// /**
//  * Coherence level indicator for adaptive transport policy
//  */
//  const coherenceLevelSchema = z.enum(["high", "medium", "low", "chaos"]);

// /**
//  * Handshake mode derived from negentropic index
//  */
//  const handshakeModeSchema = z.enum([
//   "trust-zero",
//   "trust-light",
//   "immune",
//   "paranoia",
// ]);

// /**
//  * Entropy metrics for adaptive handshake (0.3.2 roadmap)
//  */
//  const entropyMetricsSchema = z
//   .object({
//     /** Shannon entropy of the session (0-8 for byte data) */
//     entropy: z.number().nonnegative().optional(),
//     /** Rate of change of entropy over time */
//     entropyVelocity: entropyVelocitySchema.optional(),
//     /** Coherence level of the peer */
//     coherence: coherenceLevelSchema.optional(),
//     /** Negentropic index (0-1, derived from coherence/entropy) */
//     negIndex: z.number().min(0).max(1).optional(),
//   })
//   .catchall(z.unknown());

// // SCP handshake: require all protocol-mandated fields, no unknowns
//  const handshakePayloadSchema = z.object({
//   type: z.literal("handshake"),
//   version: z.string().min(1),
//   agent: z.object({
//     id: z.string().min(1),
//     epoch: z.number().int().nonnegative(),
//     intention: z.string().min(1),
//   }),
//   identity: z.object({
//     sir: z.string().min(1),
//     nv: negentropyVectorSchema,
//     sig: z.string().min(1),
//   }),
//   transport: z.object({
//     interface: z.string().min(1),
//     mode: z.string().min(1),
//   }),
//   caps: scpCapabilitySetSchema.optional(),
//   ts: z.number().int().nonnegative(),
//   tags: handshakeTagsSchema.optional(),
//   nIndex: z.number(),
//   negHash: z.string().min(1),
//   entropyMetrics: entropyMetricsSchema,
// });

//  const negentropicHandshakeSchema = handshakePayloadSchema
//   .extend({
//     ts: z.number().int().nonnegative(),
//     nonce: z.string().min(1),
//     publicKey: z.string().min(1),
//     negHash: z.string().min(1),
//     nIndex: z.number(),
//     signature: z.string().min(1),
//   })
//   .catchall(z.unknown());

//  const scpStatePayloadSchema = z
//   .object({
//     type: z.literal("state"),
//     sid: z.string().min(1),
//     snapshot: z
//       .object({
//         stateHash: z.string().min(1),
//         summary: z.string().optional(),
//       })
//       .catchall(z.unknown())
//       .optional(),
//     delta: z
//       .object({
//         changes: z.array(
//           z.union([z.string(), z.record(z.string(), z.unknown())]),
//         ),
//       })
//       .catchall(z.unknown())
//       .optional(),
//     merge: z
//       .object({
//         winner: z.string().min(1).optional(),
//         strategy: z
//           .enum(["winner", "arbitrate", "fallback"])
//           .or(z.string())
//           .optional(),
//       })
//       .catchall(z.unknown())
//       .optional(),
//     ts: z.number().int().nonnegative(),
//     sig: z.string().min(1),
//   })
//   .catchall(z.unknown());

//  const revelationSchema = z
//   .object({
//     type: z.literal("revelation"),
//     sid: z.string().min(1),
//     intent: z.string().min(1),
//     payload: z.unknown(),
//     ts: z.number().int().nonnegative(),
//     sig: z.string().min(1),
//   })
//   .catchall(z.unknown());

//  type HandshakePayload = z.infer<typeof handshakePayloadSchema>;
//  type NegentropicHandshake = z.infer<typeof negentropicHandshakeSchema>;
//  type SCPStatePayload = z.infer<typeof scpStatePayloadSchema>;
//  type SCPCapabilitySet = z.infer<typeof scpCapabilitySetSchema>;
//  type EntropyMetricsPayload = z.infer<typeof entropyMetricsSchema>;
//  type EntropyVelocity = z.infer<typeof entropyVelocitySchema>;
//  type CoherenceLevel = z.infer<typeof coherenceLevelSchema>;
//  type HandshakeMode = z.infer<typeof handshakeModeSchema>;

// export {
//   handshakePayloadSchema,
//   negentropicHandshakeSchema,
//   scpStatePayloadSchema,
//   scpCapabilitySetSchema,
//   entropyMetricsSchema,
//   entropyVelocitySchema,
//   coherenceLevelSchema,
//   handshakeModeSchema,
// };

// export type {
//   HandshakePayload,
//   NegentropicHandshake, 
//   SCPStatePayload,
//   SCPCapabilitySet,
//   EntropyMetricsPayload,
//   EntropyVelocity,
//   CoherenceLevel,
//   HandshakeMode,
// };
