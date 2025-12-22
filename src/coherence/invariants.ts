import type { CoherenceState } from "./types";

export const DEFAULT_MIN_RESERVE = 0.2;

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function computeHorizonSec(
  margin: number,
  drift: number,
  reserve: number,
  minReserve = DEFAULT_MIN_RESERVE,
): number {
  if (drift >= 0) return Number.POSITIVE_INFINITY;
  const effectiveReserve = Math.max(minReserve, clamp01(reserve));
  return (
    margin / Math.max(1e-6, Math.abs(drift)) * effectiveReserve
  );
}

export function isUnsafe(state: CoherenceState, minHorizon: number): boolean {
  return state.H < minHorizon;
}
