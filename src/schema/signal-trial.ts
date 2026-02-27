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

export const signalTrialNcfStateSchema = z.enum([
  "macro",
  "balanced",
  "defensive",
]);

export const signalTrialNcfRegimeSchema = z.enum([
  "coherent",
  "transitional",
  "chaos",
]);

export const signalTrialNcfSchema = z
  .object({
    version: z.string().min(1),
    entropy: z.number().min(0).max(1),
    coherence: z.number().min(0).max(1),
    negentropy: z.number().min(0).max(1),
    nIndex: z.number().min(0).max(1),
    entropyVelocity: z.number().optional(),
    state: signalTrialNcfStateSchema,
    regime: signalTrialNcfRegimeSchema,
  })
  .catchall(z.unknown());

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

export const signalTrialJSpaceResolutionSchema = z.object({
  resolved: z.boolean(),
  reasons: z.array(z.string()),
  gradNorm: z.number(),
  lambdaMin: z.number(),
  deltaJViolationRate: z.number(),
  basinHoldMet: z.boolean(),
});

export const signalTrialSemanticRegimeSchema = z.object({
  regime: z.enum([
    "stable-gradient",
    "stable-orbit",
    "chaotic",
    "turbulent",
    "unstable",
    "model-mismatch",
  ]),
  confidence: z.number(),
  diagnostics: z.array(z.string()),
});

export const signalTrialGovernanceSchema = z.object({
  driftRate: z.number().nonnegative(),
  bound: z.number().positive(),
  ratio: z.number().nonnegative(),
  gamma: z.number().positive(),
  boundExceeded: z.boolean(),
  pointOfNoReturn: z.boolean(),
  clipped: z.boolean(),
  returnVelocity: z.number().positive(),
  entropy: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  coherenceDensity: z.number().min(0).max(1).optional(),
  structuralPersistence: z.number().min(0).max(1).optional(),
  metastability: z.number().min(0).max(1).optional(),
});

export const signalTrialTransportPolicySchema = z.object({
  mode: z.enum(["throughput", "guarded", "recovery"]),
  batchScale: z.number().positive(),
  flushScale: z.number().positive(),
  bufferScale: z.number().positive(),
  paceScale: z.number().positive(),
  reason: z.array(z.string()),
});

export const signalTrialAttractorComparisonSchema = z.object({
  projection: z.enum(["xy", "xz", "yz"]),
  bestMatch: z
    .enum(["aizawa", "lorenz", "rossler", "henon", "duffing"])
    .nullable(),
  similarity: z.number(),
  regime: z.enum(["coherent", "turbulent", "chaotic", "predatory"]),
  scores: z.object({
    aizawa: z.number(),
    lorenz: z.number(),
    rossler: z.number(),
    henon: z.number(),
    duffing: z.number(),
  }),
  diagnostics: z.object({
    projection: z.enum(["xy", "xz", "yz"]),
    fitError: z.number(),
    symmetry: z.number(),
    roughness: z.number(),
    anisotropy: z.number(),
    coherentGate: z.boolean(),
    matchScore: z.number(),
    flowAlignment: z.number().nullable(),
    flowAlignmentAbs: z.number().nullable(),
    flowAlignmentSamples: z.number(),
    flowAlignmentMode: z.enum([
      "descent",
      "orthogonal",
      "uphill",
      "mixed",
      "unavailable",
    ]),
    gradientUsed: z.boolean().optional(),
    note: z.string().optional(),
  }),
  traceWindow: z
    .object({
      points: z.number().int().nonnegative(),
      stride: z.number().int().positive(),
      durationMs: z.number().nonnegative(),
    })
    .optional(),
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
    ncf: signalTrialNcfSchema.optional(),
    state_source: z.string().optional(),
    regime_source: z.string().optional(),
    governance: signalTrialGovernanceSchema.optional(),
    transportPolicy: signalTrialTransportPolicySchema.optional(),
    jResolution: signalTrialJSpaceResolutionSchema.optional(),
    regime: signalTrialSemanticRegimeSchema.optional(),
    attractorComparison: signalTrialAttractorComparisonSchema.optional(),
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
export type SignalTrialNcf = z.infer<typeof signalTrialNcfSchema>;
export type SignalTrialGovernance = z.infer<typeof signalTrialGovernanceSchema>;
export type SignalTrialTransportPolicy = z.infer<
  typeof signalTrialTransportPolicySchema
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
