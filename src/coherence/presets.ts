// @gsknnft/coherence/src/presets.ts

// import { SuperformulaParams } from "./superformula";

export const SUPERFORMULA_PRESETS = {
  coherent: {
    name: "Classic round-ish (coherent)",
    params: { m: 4, n1: 2, n2: 2, n3: 2, a: 1, b: 1 },
  },
  turbulent: {
    name: "Star / spiky (turbulent)",
    params: { m: 5, n1: 0.3, n2: 1.7, n3: 1.7, a: 1, b: 1 },
  },
  chaotic: {
    name: "Lumpy organism (chaotic)",
    params: { m: 3, n1: 1, n2: 0.3, n3: 1.5, a: 1, b: 1 },
  },
  squircle: {
    name: "Squircle vibe (high coherence)",
    params: { m: 4, n1: 10, n2: 10, n3: 10, a: 1, b: 1 },
  },
};

// export function matchToPreset(
//   params: SuperformulaParams,
// ): keyof typeof SUPERFORMULA_PRESETS | "unknown" {
//   // Find closest preset by parameter distance
//   // Return regime classification based on match
//   return "unknown"; // Placeholder, implement actual matching logic
// }

/*
// Coherent regime = simple superformula (low m, symmetric n values)
const coherent = { m: 4, n1: 2, n2: 2, n3: 2 }; // Circle

// Chaotic regime = strange attractor (can't fit to simple superformula)
const chaotic = extractGeometricSignature(chaoticPoints);
// → High fitError, low symmetry, resembles Aizawa attractor
*/
