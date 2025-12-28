// CoherenceController.ts
// Coherence-driven control module for QWormhole
// Consumes TransportMetrics, emits mode/coupling decisions

import { CoherenceSet } from "src/coherence";
import { TransportMetrics } from "../types/TransportMetrics";

export interface CoherenceDecision {
  mode: CoherenceSet;
  batchTarget: number; // Recommended batch size (bytes)
  flushIntervalMs: number; // Recommended flush interval (ms)
  maxBufferedBytes: number; // Recommended max buffered bytes
  reason: string; // Human-readable rationale
}

export class CoherenceController {
  // --- Thresholds for mode switching ---
  private hysteresis: number = 0.05; // Margin hysteresis for mode switching
  private lastMode: CoherenceSet = "BALANCED";
  private lastMargin: number = 0.5;
  lastVelocity: number = 0;
  lastReserve: number = 1;

  // Main decision function with explicit thresholds
  // Margin (M): 0..1, Velocity (V): change in margin per block, Reserve (R): 0..1
  // MACRO_BATCH: M > 0.7, V > -0.05, R > 0.5
  // BALANCED: 0.4 < M <= 0.7, -0.2 < V <= -0.05, 0.2 < R <= 0.5
  // PROTECT: M <= 0.4, V <= -0.2, R <= 0.2
  decide(metrics: TransportMetrics): CoherenceDecision {
    let mode: CoherenceSet = "BALANCED";
    let reason = "";

    // Compute velocity (change in margin per block)
    const velocity = metrics.marginEstimate - this.lastMargin;
    const margin = metrics.marginEstimate;
    const reserve = metrics.reserveEstimate;

    // --- Mode logic ---
    if (
      margin <= 0.4 ||
      velocity <= -0.2 ||
      reserve <= 0.2 ||
      metrics.socketBackpressure ||
      metrics.eventLoopJitterMs > 10 ||
      metrics.gcPauseMs > 10
    ) {
      mode = "PROTECT";
      reason =
        "Low margin, sharply negative velocity, low reserve, or high jitter/backpressure";
    } else if (
      margin > 0.7 &&
      velocity > -0.05 &&
      reserve > 0.5 &&
      !metrics.socketBackpressure &&
      metrics.eventLoopJitterMs <= 10 &&
      metrics.gcPauseMs <= 10
    ) {
      mode = "MACRO_BATCH";
      reason =
        "High margin, positive/flat velocity, high reserve, no backpressure/jitter";
    } else {
      mode = "BALANCED";
      reason =
        "Intermediate margin, mild negative velocity, moderate reserve, or mild jitter";
    }

    // Hysteresis: avoid rapid mode switching
    if (
      mode !== this.lastMode &&
      Math.abs(margin - this.lastMargin) < this.hysteresis
    ) {
      mode = this.lastMode;
      reason += " (hysteresis hold)";
    }

    this.lastMode = mode;
    this.lastMargin = margin;
    this.lastVelocity = velocity;
    this.lastReserve = reserve;

    // Coupling recommendations
    const batchTarget =
      mode === "MACRO_BATCH"
        ? 128 * 1024
        : mode === "PROTECT"
          ? 8 * 1024
          : 32 * 1024;
    const flushIntervalMs =
      mode === "MACRO_BATCH" ? 1 : mode === "PROTECT" ? 10 : 4;
    const maxBufferedBytes = mode === "PROTECT" ? 128 * 1024 : 512 * 1024;

    return {
      mode,
      batchTarget,
      flushIntervalMs,
      maxBufferedBytes,
      reason,
    };
  }
}

// Usage:
// const ctrl = new CoherenceController();
// const decision = ctrl.decide(metrics);
