import type { SignalTrialTelemetry } from "../schema/signal-trial";
import type { TransportGovernanceSignals } from "../core/transport-governance-policy";

export type SignalTrialGovernanceTelemetry = {
  driftRate: number;
  bound: number;
  ratio: number;
  gamma: number;
  boundExceeded: boolean;
  pointOfNoReturn: boolean;
  clipped: boolean;
  returnVelocity: number;
  entropy?: number;
  confidence?: number;
  coherenceDensity?: number;
  structuralPersistence?: number;
  metastability?: number;
};

export type SignalTrialTransportPolicyTelemetry = {
  mode: "throughput" | "guarded" | "recovery";
  batchScale: number;
  flushScale: number;
  bufferScale: number;
  paceScale: number;
  reason: string[];
};

export function governanceSignalsFromTelemetry(
  telemetry:
    | Pick<
        SignalTrialTelemetry,
        "governance" | "regime" | "derived"
      >
    | null
    | undefined,
): TransportGovernanceSignals | undefined {
  if (!telemetry) return undefined;
  const governance = telemetry.governance;
  if (!governance) return undefined;
  return {
    gamma: governance.gamma,
    driftRate: governance.driftRate,
    entropy:
      finiteOrUndefined(governance.entropy) ??
      finiteOrUndefined(telemetry.derived?.tension),
    confidence:
      finiteOrUndefined(governance.confidence) ??
      finiteOrUndefined(telemetry.regime?.confidence),
    coherenceDensity: finiteOrUndefined(governance.coherenceDensity),
    structuralPersistence: finiteOrUndefined(governance.structuralPersistence),
    metastability: finiteOrUndefined(governance.metastability),
    boundExceeded: governance.boundExceeded,
    pointOfNoReturn: governance.pointOfNoReturn,
    regime: telemetry.regime?.regime,
  };
}

export function createGovernanceSignalStore(
  initial?: TransportGovernanceSignals,
): {
  get: () => TransportGovernanceSignals | undefined;
  set: (value?: TransportGovernanceSignals) => void;
  updateFromTelemetry: (
    telemetry?: Pick<SignalTrialTelemetry, "governance" | "regime" | "derived"> | null,
  ) => TransportGovernanceSignals | undefined;
  clear: () => void;
} {
  let current = initial;

  return {
    get: () => current,
    set: (value) => {
      current = value;
    },
    updateFromTelemetry: (telemetry) => {
      current = governanceSignalsFromTelemetry(telemetry);
      return current;
    },
    clear: () => {
      current = undefined;
    },
  };
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined;
}
