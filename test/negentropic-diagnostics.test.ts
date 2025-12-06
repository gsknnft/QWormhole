import {
  RollingHistogram,
  shannonEntropy,
  negentropy,
  mapCoherence,
  mapVelocity,
  Coherence,
  Velocity,
  NegentropicDiagnostics,
  inferMessageType,
} from "../src/utils/negentropic-diagnostics";
import { describe, it, expect } from "vitest";

describe("Negentropic Diagnostics", () => {
  it("computes histogram and entropy", () => {
    const hist = new RollingHistogram(10);
    ["A", "A", "B", "C", "A", "B", "B", "C", "C", "C"].forEach(t =>
      hist.add(t),
    );
    const freq = hist.frequencies();
    expect(freq).toEqual({ A: 3, B: 3, C: 4 });
    expect(shannonEntropy(freq)).toBeCloseTo(1.57, 2);
    expect(negentropy(freq)).toBeCloseTo(0.014, 2);
  });
  it("maps negentropy to coherence", () => {
    expect(mapCoherence(2)).toBe(Coherence.High);
    expect(mapCoherence(1)).toBe(Coherence.Medium);
    expect(mapCoherence(0.2)).toBe(Coherence.Low);
  });
  it("maps entropy velocity to velocity", () => {
    expect(mapVelocity(2)).toBe(Velocity.Fast);
    expect(mapVelocity(0.5)).toBe(Velocity.Moderate);
    expect(mapVelocity(0.1)).toBe(Velocity.Slow);
  });
  it("builds negentropic snapshot", () => {
    const diag = new NegentropicDiagnostics(16);
    diag.recordMessageType("handshake");
    diag.recordMessageType("message");
    const snapshot = diag.getSnapshot();
    expect(snapshot.sampleCount).toBe(2);
    expect(snapshot.histogram).toHaveProperty("handshake");
    expect(snapshot.negentropy).toBeGreaterThanOrEqual(0);
    diag.reset();
    expect(diag.getSnapshot().sampleCount).toBe(0);
  });
  it("infers message type from payloads", () => {
    expect(inferMessageType("hello")).toBe("string");
    expect(inferMessageType(Buffer.from("data"))).toBe("buffer");
    expect(inferMessageType({ type: "event" })).toBe("event");
    expect(inferMessageType({ event: "pong" })).toBe("event:pong");
    expect(inferMessageType({ action: "sync" })).toBe("action:sync");
  });
});
