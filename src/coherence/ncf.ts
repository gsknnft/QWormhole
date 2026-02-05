import { clamp01 } from "./invariants-lite";

export type NcfState = "macro" | "balanced" | "defensive";
export type NcfRegime = "coherent" | "transitional" | "chaos";

export const NCF_VERSION = (process.env.NCF_VERSION ?? "v1").trim();
export const NCF_SOURCE = `ncf:${NCF_VERSION}`;

export type NcfSummary = {
  version: string;
  entropy: number;
  coherence: number;
  negentropy: number;
  nIndex: number;
  entropyVelocity?: number;
  state: NcfState;
  regime: NcfRegime;
};

export type NcfInput = {
  entropy?: number;
  coherence?: number;
  negentropy?: number;
  entropyVelocity?: number;
};

const deriveState = (nIndex: number): NcfState => {
  if (nIndex > 0.8) return "macro";
  if (nIndex < 0.3) return "defensive";
  return "balanced";
};

const deriveRegime = (coherence: number, entropy: number): NcfRegime => {
  if (coherence > 0.7 && entropy < 0.4) return "coherent";
  if (coherence < 0.4 || entropy > 0.7) return "chaos";
  return "transitional";
};

export const deriveNcfSummary = (input: NcfInput): NcfSummary => {
  const entropy =
    input.entropy !== undefined ? clamp01(input.entropy) : 0.5;
  const coherence =
    input.coherence !== undefined ? clamp01(input.coherence) : 0.5;
  const negentropy =
    input.negentropy !== undefined ? clamp01(input.negentropy) : 0.5;

  const nIndex =
    input.entropy !== undefined ? clamp01(1 - entropy) : negentropy;

  return {
    version: NCF_VERSION,
    entropy,
    coherence,
    negentropy,
    nIndex,
    entropyVelocity: input.entropyVelocity,
    state: deriveState(nIndex),
    regime: deriveRegime(coherence, entropy),
  };
};
