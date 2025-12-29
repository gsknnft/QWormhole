import { z } from "zod";
import { entropyMetricsSchema } from "./scp";

export const signalTrialTierSchema = z.enum(["arena", "instrument", "system"]);
export const signalTrialDifficultySchema = z.enum([
  "easy",
  "standard",
  "hard",
  "chaos",
]);

export const coherenceStateSchema = z.object({
  M: z.number(),
  V: z.number(),
  R: z.number(),
  H: z.number(),
  confidence: z.number().optional(),
});

export const couplingParamsSchema = z.object({
  batchSize: z.number(),
  concurrency: z.number(),
  redundancy: z.number(),
  paceMs: z.number(),
});

export const fieldSampleSchema = z
  .object({
    t: z.number(),
    latencyP50: z.number(),
    latencyP95: z.number(),
    latencyP99: z.number(),
    errRate: z.number(),
    queueDepth: z.number(),
    queueSlope: z.number(),
    corrSpike: z.number().optional(),
  })
  .catchall(z.unknown());

export const transportMetricsSchema = z.object({
  bytesSent: z.number(),
  bytesAcked: z.number(),
  messagesSent: z.number(),
  messagesAcked: z.number(),
  batchSize: z.number(),
  batchMessages: z.number(),
  batchIntervalMs: z.number(),
  bufferedBytes: z.number(),
  bufferedMessages: z.number(),
  socketBackpressure: z.boolean(),
  eventLoopJitterMs: z.number(),
  gcPauseMs: z.number(),
  marginEstimate: z.number(),
  reserveEstimate: z.number(),
  rttMs: z.number().optional(),
  timestamp: z.number(),
});

export const signalTrialDerivedSchema = z.object({
  stability: z.number(),
  tension: z.number(),
  drift: z.number(),
  resonance: z.number(),
});

export const signalTrialTelemetrySchema = z
  .object({
    type: z.literal("telemetry"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    tier: signalTrialTierSchema.optional(),
    difficulty: signalTrialDifficultySchema.optional(),
    state: coherenceStateSchema,
    coupling: couplingParamsSchema.optional(),
    sample: fieldSampleSchema.optional(),
    transport: transportMetricsSchema.optional(),
    entropy: entropyMetricsSchema.optional(),
    derived: signalTrialDerivedSchema.optional(),
    note: z.string().optional(),
  })
  .catchall(z.unknown());

export const signalTrialCommitmentSchema = z
  .object({
    type: z.literal("commitment"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    m: z.number(),
    v: z.number(),
    resonance: z.number().optional(),
    reason: z.string().optional(),
    coupling: couplingParamsSchema.optional(),
  })
  .catchall(z.unknown());

export const signalTrialResolutionTierSchema = z.enum([
  "anchor-i",
  "anchor-ii",
  "anchor-iii",
]);

export const signalTrialResolutionSchema = z
  .object({
    type: z.literal("resolution"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    result: z.enum(["stable", "collapsed"]),
    tier: signalTrialResolutionTierSchema.optional(),
    reason: z.string().optional(),
    state: coherenceStateSchema.optional(),
  })
  .catchall(z.unknown());

export const signalTrialActionSchema = z
  .object({
    type: z.literal("action"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative().optional(),
    action: z.enum(["pulse", "pressure", "delay", "lock", "noise", "damp"]),
    magnitude: z.number().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export const signalTrialSessionSchema = z
  .object({
    type: z.literal("session"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    mode: z.enum(["spawn", "reset", "end"]),
    tier: signalTrialTierSchema.optional(),
    difficulty: signalTrialDifficultySchema.optional(),
  })
  .catchall(z.unknown());

export const signalTrialMessageSchema = z.discriminatedUnion("type", [
  signalTrialTelemetrySchema,
  signalTrialCommitmentSchema,
  signalTrialResolutionSchema,
  signalTrialActionSchema,
  signalTrialSessionSchema,
]);

export type SignalTrialTelemetry = z.infer<typeof signalTrialTelemetrySchema>;
export type SignalTrialCommitment = z.infer<typeof signalTrialCommitmentSchema>;
export type SignalTrialResolution = z.infer<typeof signalTrialResolutionSchema>;
export type SignalTrialResolutionTier = z.infer<
  typeof signalTrialResolutionTierSchema
>;
export type SignalTrialAction = z.infer<typeof signalTrialActionSchema>;
export type SignalTrialSession = z.infer<typeof signalTrialSessionSchema>;
export type SignalTrialMessage = z.infer<typeof signalTrialMessageSchema>;
export type SignalTrialTier = z.infer<typeof signalTrialTierSchema>;
export type SignalTrialDifficulty = z.infer<
  typeof signalTrialDifficultySchema
>;
