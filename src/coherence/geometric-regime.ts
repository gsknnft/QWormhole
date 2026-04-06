import type {
  GeometricRegime,
  GeometricRegimeInputs,
  GeometricRegimeLabel,
  GeometricSignature,
  MorphologyGeometricRegime,
  MorphologyRegimeLabel,
} from "@gsknnft/coherence";
import {
  buildGeometricRegimeInputs as buildCanonicalGeometricRegimeInputs,
  classifyGeometricRegime as classifyCanonicalGeometricRegime,
  classifyGeometricRegimeEngine as classifyCanonicalGeometricRegimeEngine,
  evaluateGeometricRegime as evaluateCanonicalGeometricRegime,
} from "@gsknnft/coherence";

/**
 * Compatibility bridge.
 *
 * Canonical geometric regime logic now lives in @gsknnft/coherence.
 * QWormhole keeps this module so older imports resolve while transport
 * orchestration continues to live locally.
 */

export type {
  GeometricRegime,
  GeometricRegimeInputs,
  GeometricRegimeLabel,
  MorphologyGeometricRegime,
  MorphologyRegimeLabel,
};

export function buildGeometricRegimeInputs(
  inputs: GeometricRegimeInputs,
): GeometricRegimeInputs {
  return buildCanonicalGeometricRegimeInputs(inputs);
}

export function classifyGeometricRegime(
  signature: GeometricSignature,
): MorphologyGeometricRegime {
  return classifyCanonicalGeometricRegime(signature);
}

export function evaluateGeometricRegime(
  inputs: GeometricRegimeInputs,
): GeometricRegime {
  return evaluateCanonicalGeometricRegime(inputs);
}

export const classifyGeometricRegimeEngine =
  classifyCanonicalGeometricRegimeEngine;
