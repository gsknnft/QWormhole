// commitment-detector.test.ts
// Unit test for CommitmentDetector
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CommitmentDetector,
  CommitmentEvent,
} from "../src/coherence/commitment-detector";
// import { CoherencePrimitives } from "../src/coherence/types";
// import { runCoherence } from "../src/coherence/run-coherence";
import { CoherenceLoop } from "../src/coherence/loop";
// Minimal mock for CoherencePrimitives
// commitment-detector.test.ts

describe("CommitmentDetector", () => {
  let now = 1_000_000;
  const loop = {} as CoherenceLoop;
  let detector: CommitmentDetector;

  beforeEach(() => {
    detector = new CommitmentDetector();
  });


  function step(opts: {
    m: number;
    v: number;
    sample?: Record<string, number>;
    config?: Record<string, any>;
    advanceMs?: number;
  }) {
    const { m, v, sample = {}, config = {}, advanceMs = 0 } = opts;
    // Wait for advanceMs to simulate time passing, but always use Date.now()
    // vi.useFakeTimers();
    // vi.setSystemTime(now + advanceMs);
    
    if (advanceMs > 0) {
      const start = Date.now();
      const end = start + advanceMs;
      while (Date.now() < end) {
        /* busy wait */
      }
    }
    detector.detectCommitment(m, v, sample, config);
  }

  // it("runs coherence", () => {
  //   expect(CommitmentDetector).toBeDefined();
  //   return runCoherence();
  // });

  it("initializes without events", () => {
    expect(detector.getEvents()).toHaveLength(0);
  });

  it("does not commit with high drift", () => {
    for (let i = 0; i < 10; i++) {
      step({ m: 0.9, v: 0.05 });
    }
    expect(detector.getEvents()).toHaveLength(0);
  } );



  it("does not commit with insufficient history", () => {
    step({ m: 0.9, v: 0.0 });
    expect(detector.getEvents()).toHaveLength(0);
  });

  it("does not commit when drift or margin are unstable", () => {
    for (let i = 0; i < 10; i++) {
      step({
        m: i % 2 === 0 ? 0.9 : 0.6, // oscillating margin
        v: i % 2 === 0 ? 0.0 : 0.02,
        sample: { latency_var: 0.1 },
        advanceMs: 200,
      });
    }
    expect(detector.getEvents()).toHaveLength(0);
  });

  it("commits when V~0, M stable, resonance high and Lyapunov low", () => {
    // Use 250ms increments to keep all data within 5s window
    const increment = 250;
    // Fill history with stable values (enough to fill window)
    for (let i = 0; i < 16; i++) {
      step({
        m: 0.87,
        v: 0.003,
        sample: { latencyP95: 100, errRate: 0.01, latency_var: 0.01 },
        config: { batch_size: 32 },
        advanceMs: increment,
      });
    }
    // Simulate a strong perturbation (spike in latency and error)
    step({
      m: 0.87,
      v: 0.003,
      sample: { latencyP95: 300, errRate: 0.2, latency_var: 1.0 },
      config: { batch_size: 32 },
      advanceMs: increment,
    });
    // Simulate a longer recovery (back to stable)
    for (let i = 0; i < 10; i++) {
      step({
        m: 0.87,
        v: 0.003,
        sample: { latencyP95: 100, errRate: 0.01, latency_var: 0.01 },
        config: { batch_size: 32 },
        advanceMs: increment,
      });
    }
    // Now, the system should have high resonance, low Lyapunov, and stable margin/drift
    const events = detector.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const e = events[events.length - 1];
    expect(e.m).toBeGreaterThanOrEqual(0.8);
    expect(Math.abs(e.v)).toBeLessThan(0.01);
    expect(e.resonance).toBeGreaterThan(0.1); // Should be high after recovery
    expect(e.reason).toContain("V near zero");
    // expect(events[0]).toMatchInlineSnapshot({
    //   m: 0.85,
    //   v: 0.005,
    //   resonance: expect.any(Number),
    //   reason: expect.stringContaining("V near zero"),
    // });
    
  });

  it("tracks resonance when perturbations spike then decay", () => {
    // baseline
    step({
      m: 0.7,
      v: 0.02,
      sample: { latencyP95: 100, errRate: 0.01 },
    });

    // spike
    step({
      m: 0.7,
      v: 0.02,
      sample: { latencyP95: 200, errRate: 0.2 },
      advanceMs: 100,
    });

    const before = (detector as any).resonance as number;

    // decay back toward baseline
    step({
      m: 0.75,
      v: 0.01,
      sample: { latencyP95: 120, errRate: 0.02 },
      advanceMs: 100,
    });

    const after = (detector as any).resonance as number;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("maintains an event_trace of the last history_window samples", () => {
    for (let i = 0; i < 10; i++) {
      step({
        m: 0.5 + i * 0.01,
        v: 0.1 - i * 0.01,
        sample: { latency_var: 0.05 },
        config: { batch_size: 8 + i },
        advanceMs: 100,
      });
    }

    const trace = (detector as any).event_trace as any[];
    expect(trace.length).toBeLessThanOrEqual(5);

    if (trace.length > 0) {
      const last = trace[trace.length - 1];
      expect(last).toHaveProperty("m");
      expect(last).toHaveProperty("v");
      expect(last).toHaveProperty("resonance");
      expect(last).toHaveProperty("reason", "Trace event");
    }
  });

  it("detects a commitment event when conditions are met", () => {
    // Use 250ms increments to keep all data within 5s window
    const increment = 250;
    const stableMargin = 0.85;
    const lowDrift = 0.005;
    const config = { batch_size: 32, pacing: 0.5 };
    const baseSample = { latencyP95: 100, errRate: 0.01, latency_var: 0.01 };
    // Fill history with stable values
    for (let i = 0; i < 10; i++) {
      step({
        m: stableMargin,
        v: lowDrift,
        sample: { ...baseSample },
        config,
        advanceMs: increment,
      });
    }
    // Simulate a perturbation (spike in latency and error)
    step({
      m: stableMargin,
      v: lowDrift,
      sample: { latencyP95: 300, errRate: 0.2, latency_var: 1.0 },
      config,
      advanceMs: increment,
    });
    // Simulate recovery (back to stable)
    for (let i = 0; i < 8; i++) {
      step({
        m: stableMargin,
        v: lowDrift,
        sample: { ...baseSample },
        config,
        advanceMs: increment,
      });
    }
    // Should have at least one commitment event
    const events: CommitmentEvent[] = detector.getEvents();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toHaveProperty("timestamp");
    expect(events[0].m).toBeCloseTo(stableMargin);
    expect(events[0].v).toBeCloseTo(lowDrift);
    expect(events[0].resonance).toBeGreaterThan(0);
    expect(typeof events[0].reason).toBe("string");
  });

  it("does not detect commitment if margin is too low", () => {
    const lowMargin = 0.5;
    const lowDrift = 0.005;
    const config = { batch_size: 32 };
    const baseSample = { latencyP95: 100, errRate: 0.01, latency_var: 0.01 };
    for (let i = 0; i < 7; i++) {
      detector.detectCommitment(
        lowMargin,
        lowDrift,
        baseSample,
        config,
        now + i * 1000,
      );
    }
    expect(detector.getEvents().length).toBe(0);
  });
});
