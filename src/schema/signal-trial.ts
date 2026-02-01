import { z } from "zod";
import { entropyMetricsSchema } from "./scp";

export const signalTrialTierSchema = z.enum(["arena", "instrument", "system"]);
export const signalTrialProfileSchema = z.enum([
  "balanced",
  "precision",
  "endurance",
  "chase",
]);
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

export const signalTrialControlModeSchema = z.enum([
  "closed_loop",
  "open_loop",
]);

export const signalTrialStabilitySchema = z.object({
  dotJ: z.number(),
  stable: z.boolean().optional(),
  violationRate: z.number().optional(),
  r2: z.number().optional(),
  samples: z.number().optional(),
  lastDotV: z.number().optional(),
  meanDotV: z.number().optional(),
});

export const signalTrialLyapunovSchema = z.object({
  stable: z.boolean().optional(),
  violationRate: z.number().optional(),
  minDotV: z.number().optional(),
  maxDotV: z.number().optional(),
  meanDotV: z.number().optional(),
  lastDotV: z.number().optional(),
  samples: z.number().optional(),
});

export const signalTrialFitJSchema = z.object({
  model: z.enum(["quadratic", "cubic"]).optional(),
  r2: z.number().optional(),
  mse: z.array(z.number()).optional(),
  samples: z.number().optional(),
});

export const signalTrialResolutionObserverSchema = z.object({
  confidence: z.number(),
  resolved: z.boolean(),
  residual: z.number(),
  latencyStd: z.number(),
  vMeanAbs: z.number(),
  mStd: z.number(),
  dmDt: z.number(),
  m: z.number(),
  v: z.number(),
});

export const signalTrialNboAlignmentSchema = z.enum([
  "stabilizing",
  "destabilizing",
  "neutral",
]);

export const signalTrialNboAttributionSchema = z.object({
  index: z.number().int().nonnegative(),
  weight: z.number(),
  epiplexity: z.number(),
  alignment: signalTrialNboAlignmentSchema,
});

export const signalTrialNboSummarySchema = z.object({
  epiplexity: z.number(),
  negentropicGain: z.number(),
  stableState: z.number(),
  basinWidthRaw: z.number(),
  basinWidthPenalty: z.number(),
  topNodes: z.array(signalTrialNboAttributionSchema),
  bounds: z.tuple([z.number(), z.number()]),
  couplingStrength: z.number(),
  signalLength: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  ageMs: z.number().int().nonnegative(),
});

export const signalTrialPhaseSchema = z.enum([
  "approaching",
  "tracking",
  "overshoot",
  "oscillating",
  "diverging",
]);

export const signalTrialTargetBandAxisSchema = z.object({
  center: z.number(),
  width: z.number(),
  delta: z.number(),
  inBand: z.boolean().optional(),
});

export const signalTrialTargetBandSchema = z.object({
  M: signalTrialTargetBandAxisSchema,
  V: signalTrialTargetBandAxisSchema,
  R: signalTrialTargetBandAxisSchema,
});

export const signalTrialGatesSchema = z.object({
  uptimeMs: z.number(),
  minUptimeMs: z.number(),
  uptimeRemainingMs: z.number(),
  actions: z.number(),
  minActions: z.number(),
  actionsRemaining: z.number(),
  holdMs: z.number(),
  holdRequiredMs: z.number(),
  holdRemainingMs: z.number(),
  quietMs: z.number(),
  quietRequiredMs: z.number(),
  quietRemainingMs: z.number(),
});

export const signalTrialTelemetrySchema = z
  .object({
    type: z.literal("telemetry"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    tier: signalTrialTierSchema.optional(),
    difficulty: signalTrialDifficultySchema.optional(),
    profile: signalTrialProfileSchema.optional(),
    controlMode: signalTrialControlModeSchema.optional(),
    state: coherenceStateSchema,
    coupling: couplingParamsSchema.optional(),
    sample: fieldSampleSchema.optional(),
    transport: transportMetricsSchema.optional(),
    entropy: entropyMetricsSchema.optional(),
    derived: signalTrialDerivedSchema.optional(),
    observer: signalTrialResolutionObserverSchema.optional(),
    nbo: signalTrialNboSummarySchema.optional(),
    stability: signalTrialStabilitySchema.optional(),
    lyapunov: signalTrialLyapunovSchema.optional(),
    fitJ: signalTrialFitJSchema.optional(),
    targetBand: signalTrialTargetBandSchema.optional(),
    gates: signalTrialGatesSchema.optional(),
    phase: signalTrialPhaseSchema.optional(),
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

export const signalTrialResolutionAttemptSchema = z
  .object({
    type: z.literal("resolution_attempt"),
    sessionId: z.string().min(1),
    at: z.number().int().nonnegative(),
    target: z.enum(["stable", "collapsed"]),
    missing: z.array(z.string()).optional(),
    hints: z.array(z.string()).optional(),
    phase: signalTrialPhaseSchema.optional(),
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
    profile: signalTrialProfileSchema.optional(),
  })
  .catchall(z.unknown());

export const signalTrialMessageSchema = z.discriminatedUnion("type", [
  signalTrialTelemetrySchema,
  signalTrialCommitmentSchema,
  signalTrialResolutionSchema,
  signalTrialResolutionAttemptSchema,
  signalTrialActionSchema,
  signalTrialSessionSchema,
]);

export type SignalTrialTelemetry = z.infer<typeof signalTrialTelemetrySchema>;
export type SignalTrialCommitment = z.infer<typeof signalTrialCommitmentSchema>;
export type SignalTrialResolution = z.infer<typeof signalTrialResolutionSchema>;
export type SignalTrialResolutionAttempt = z.infer<
  typeof signalTrialResolutionAttemptSchema
>;
export type SignalTrialNboSummary = z.infer<typeof signalTrialNboSummarySchema>;
export type SignalTrialProfile = z.infer<typeof signalTrialProfileSchema>;
export type SignalTrialPhase = z.infer<typeof signalTrialPhaseSchema>;
export type SignalTrialTargetBand = z.infer<typeof signalTrialTargetBandSchema>;
export type SignalTrialGates = z.infer<typeof signalTrialGatesSchema>;
export type SignalTrialResolutionObserver = z.infer<
  typeof signalTrialResolutionObserverSchema
>;
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
