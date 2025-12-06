import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FlowController,
  TokenBucket,
  createFlowController,
  deriveSessionFlowPolicy,
  FLOW_DEFAULTS,
  type SessionFlowPolicy,
} from "../src/flow-controller";
import { BatchFramer } from "../src/batch-framer";
import type { EntropyMetrics } from "../src/handshake/entropy-policy";

let adaptiveEnvOriginal: string | undefined;

beforeEach(() => {
  adaptiveEnvOriginal = process.env.QWORMHOLE_ADAPTIVE_SLICES;
  process.env.QWORMHOLE_ADAPTIVE_SLICES = "off";
});

afterEach(() => {
  if (adaptiveEnvOriginal === undefined) {
    delete process.env.QWORMHOLE_ADAPTIVE_SLICES;
  } else {
    process.env.QWORMHOLE_ADAPTIVE_SLICES = adaptiveEnvOriginal;
  }
});

/**
 * Helper function to create test policies with optional overrides
 */
const createTestPolicy = (
  overrides?: Partial<SessionFlowPolicy>,
): SessionFlowPolicy => ({
  coherence: 0.8,
  entropyVelocity: 0.3,
  preferredBatchSize: 64,
  minSlice: 4,
  maxSlice: 64,
  nIndex: 0.8,
  burstBudgetBytes: 256 * 1024,
  rateBytesPerSec: 10 * 1024 * 1024,
  peerIsNative: true,
  ...overrides,
});

describe("TokenBucket", () => {
  it("allows immediate send when tokens available", () => {
    const bucket = new TokenBucket(1000, 500);

    const delay = bucket.reserve(100);
    expect(delay).toBe(0);
    // Check that tokens were deducted (allow small timing variance due to refill)
    expect(bucket.availableTokens).toBeGreaterThanOrEqual(399);
    expect(bucket.availableTokens).toBeLessThanOrEqual(401);
  });

  it("returns delay when tokens exhausted", () => {
    const bucket = new TokenBucket(1000, 100);

    // First reserve uses all tokens
    bucket.reserve(100);

    // Second reserve should require waiting
    const delay = bucket.reserve(100);
    expect(delay).toBeGreaterThan(0);
  });

  it("refills tokens over time", async () => {
    const bucket = new TokenBucket(10000, 100);

    // Exhaust tokens
    bucket.reserve(100);
    expect(bucket.availableTokens).toBe(0);

    // Wait 50ms - should refill some tokens
    await new Promise(r => setTimeout(r, 50));

    const tokens = bucket.availableTokens;
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("FlowController", () => {
  it("initializes with half of preferred batch size", () => {
    const policy = createTestPolicy({ preferredBatchSize: 64 });
    const controller = new FlowController(policy);

    expect(controller.currentSliceSize).toBe(32);
  });

  it("clamps initial slice to bounds", () => {
    const policy = createTestPolicy({
      preferredBatchSize: 64,
      minSlice: 4,
      maxSlice: 16,
    });
    const controller = new FlowController(policy);

    // Half of 64 is 32, but max is 16
    expect(controller.currentSliceSize).toBe(16);
  });

  it("contracts slice on backpressure", () => {
    const policy = createTestPolicy();
    const controller = new FlowController(policy);

    const initialSize = controller.currentSliceSize;
    controller.onBackpressure(1024);

    expect(controller.currentSliceSize).toBe(Math.floor(initialSize / 2));
  });

  it("expands slice on drain", () => {
    const policy = createTestPolicy();
    const controller = new FlowController(policy);

    const initialSize = controller.currentSliceSize;
    controller.onDrain();

    expect(controller.currentSliceSize).toBe(
      initialSize + FLOW_DEFAULTS.DRIFT_STEP,
    );
  });

  it("respects minSlice on repeated backpressure", () => {
    const policy = createTestPolicy({ minSlice: 4 });
    const controller = new FlowController(policy);

    // Contract repeatedly
    for (let i = 0; i < 10; i++) {
      controller.onBackpressure(1024);
    }

    expect(controller.currentSliceSize).toBe(4);
  });

  it("respects maxSlice on repeated drain", () => {
    const policy = createTestPolicy({ maxSlice: 64, peerIsNative: true });
    const controller = new FlowController(policy);

    // Expand repeatedly
    for (let i = 0; i < 50; i++) {
      controller.onDrain();
    }

    expect(controller.currentSliceSize).toBe(64);
  });

  it("clamps TS peer max slice", () => {
    const policy = createTestPolicy({
      maxSlice: 64,
      peerIsNative: false,
    });
    const controller = new FlowController(policy);

    // Expand repeatedly
    for (let i = 0; i < 50; i++) {
      controller.onDrain();
    }

    expect(controller.currentSliceSize).toBe(FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
  });

  it("honors force slice override from options", () => {
    const policy = createTestPolicy({
      minSlice: 4,
      maxSlice: 64,
    });
    const controller = new FlowController(policy, { forceSliceSize: 24 });

    expect(controller.currentSliceSize).toBe(24);
    controller.onBackpressure(1024);
    expect(controller.currentSliceSize).toBe(24);
    controller.onDrain();
    expect(controller.currentSliceSize).toBe(24);
  });

  it("clamps env force slice override and surfaces in diagnostics", () => {
    const original = process.env.QWORMHOLE_FORCE_SLICE;
    process.env.QWORMHOLE_FORCE_SLICE = "128";
    try {
      const policy = createTestPolicy({
        maxSlice: 64,
        peerIsNative: false,
      });
      const controller = new FlowController(policy);

      expect(controller.currentSliceSize).toBe(FLOW_DEFAULTS.TS_PEER_MAX_SLICE);
      expect(controller.getDiagnostics().forceSliceSize).toBe(
        FLOW_DEFAULTS.TS_PEER_MAX_SLICE,
      );
    } finally {
      if (original === undefined) {
        delete process.env.QWORMHOLE_FORCE_SLICE;
      } else {
        process.env.QWORMHOLE_FORCE_SLICE = original;
      }
    }
  });

  it("allows force rate override via env", () => {
    const original = process.env.QWORMHOLE_FORCE_RATE_BYTES;
    process.env.QWORMHOLE_FORCE_RATE_BYTES = "20000000";
    try {
      const policy = createTestPolicy({
        rateBytesPerSec: 1_000_000,
      });
      const controller = new FlowController(policy);
      expect(controller.getDiagnostics().effectiveRateBytesPerSec).toBe(
        20_000_000,
      );
    } finally {
      if (original === undefined) {
        delete process.env.QWORMHOLE_FORCE_RATE_BYTES;
      } else {
        process.env.QWORMHOLE_FORCE_RATE_BYTES = original;
      }
    }
  });

  it("emits sliceDrift events", () => {
    const policy = createTestPolicy();
    const controller = new FlowController(policy);

    const driftHandler = vi.fn();
    controller.on("sliceDrift", driftHandler);

    controller.onBackpressure(1024);

    expect(driftHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "backpressure",
      }),
    );
  });

  it("provides diagnostics snapshot", () => {
    const policy = createTestPolicy();
    const controller = new FlowController(policy);

    const diagnostics = controller.getDiagnostics();

    expect(diagnostics.currentSliceSize).toBe(controller.currentSliceSize);
    expect(diagnostics.totalFlushes).toBe(0);
    expect(diagnostics.totalBytes).toBe(0);
    expect(diagnostics.policy.coherence).toBe(0.8);
    expect(diagnostics.sliceHistory.length).toBeGreaterThan(0);
    expect(diagnostics.effectiveRateBytesPerSec).toBe(policy.rateBytesPerSec);
  });

  it("records slice history", () => {
    const policy = createTestPolicy();
    const controller = new FlowController(policy);

    controller.onBackpressure(1024);
    controller.onDrain();
    controller.onBackpressure(2048);

    const diagnostics = controller.getDiagnostics();
    expect(diagnostics.sliceHistory.length).toBe(4); // init + 3 changes
  });
});

describe("deriveSessionFlowPolicy", () => {
  it("derives high-trust policy from high coherence metrics", () => {
    const metrics: EntropyMetrics = {
      negIndex: 0.9,
      coherence: "high",
      entropyVelocity: "low",
    };

    const policy = deriveSessionFlowPolicy(metrics, { peerIsNative: true });

    expect(policy.preferredBatchSize).toBe(64);
    expect(policy.coherence).toBeGreaterThanOrEqual(0.8);
    expect(policy.maxSlice).toBe(64);
  });

  it("derives low-trust policy from chaos metrics", () => {
    const metrics: EntropyMetrics = {
      negIndex: 0.2,
      coherence: "chaos",
      entropyVelocity: "spiking",
    };

    const policy = deriveSessionFlowPolicy(metrics, { peerIsNative: false });

    expect(policy.preferredBatchSize).toBe(1);
    expect(policy.coherence).toBeLessThan(0.3);
  });

  it("clamps maxSlice for TS peers", () => {
    const metrics: EntropyMetrics = {
      negIndex: 0.9,
      coherence: "high",
    };

    const policy = deriveSessionFlowPolicy(metrics, { peerIsNative: false });

    // High-trust TS peers (negIndex >= 0.85) use the higher cap
    expect(policy.maxSlice).toBeLessThanOrEqual(
      FLOW_DEFAULTS.TS_PEER_HIGH_TRUST_MAX_SLICE,
    );
  });

  it("clamps maxSlice for low-trust TS peers", () => {
    const metrics: EntropyMetrics = {
      negIndex: 0.5,
      coherence: "medium",
    };

    const policy = deriveSessionFlowPolicy(metrics, { peerIsNative: false });

    // Low-trust TS peers use the standard cap
    expect(policy.maxSlice).toBeLessThanOrEqual(
      FLOW_DEFAULTS.TS_PEER_MAX_SLICE,
    );
  });

  it("scales rate limit by trust level", () => {
    const highTrust: EntropyMetrics = { negIndex: 0.9 };
    const lowTrust: EntropyMetrics = { negIndex: 0.2 };

    const highPolicy = deriveSessionFlowPolicy(highTrust);
    const lowPolicy = deriveSessionFlowPolicy(lowTrust);

    expect(highPolicy.rateBytesPerSec).toBeGreaterThan(
      lowPolicy.rateBytesPerSec,
    );
  });

  it("uses custom rate and burst options", () => {
    const metrics: EntropyMetrics = { negIndex: 0.9 };

    const policy = deriveSessionFlowPolicy(metrics, {
      rateBytesPerSec: 1000,
      burstBudgetBytes: 500,
    });

    // Rate and burst are scaled by trust level (1.0 for trust-zero)
    expect(policy.rateBytesPerSec).toBe(1000);
    expect(policy.burstBudgetBytes).toBe(500);
  });
});

describe("createFlowController", () => {
  it("creates controller from entropy metrics", () => {
    const metrics: EntropyMetrics = {
      negIndex: 0.75,
      coherence: "medium",
      entropyVelocity: "stable",
    };

    const controller = createFlowController(metrics, { peerIsNative: true });

    expect(controller).toBeInstanceOf(FlowController);
    expect(controller.currentSliceSize).toBeGreaterThan(0);
  });

  it("creates controller with native peer optimization", () => {
    const metrics: EntropyMetrics = { negIndex: 0.9 };

    const nativeController = createFlowController(metrics, {
      peerIsNative: true,
    });
    const tsController = createFlowController(metrics, { peerIsNative: false });

    // Native can reach higher slice sizes
    for (let i = 0; i < 50; i++) {
      nativeController.onDrain();
      tsController.onDrain();
    }

    expect(nativeController.currentSliceSize).toBeGreaterThan(
      tsController.currentSliceSize,
    );
  });

  it("defaults to guarded adaptive mode for TS peers when env unset", () => {
    const prev = process.env.QWORMHOLE_ADAPTIVE_SLICES;
    delete process.env.QWORMHOLE_ADAPTIVE_SLICES;
    const metrics: EntropyMetrics = { negIndex: 0.9, coherence: "high" };
    const controller = createFlowController(metrics, { peerIsNative: false });
    expect(controller.getDiagnostics().adaptive?.mode).toBe("guarded");
    if (prev === undefined) {
      delete process.env.QWORMHOLE_ADAPTIVE_SLICES;
    } else {
      process.env.QWORMHOLE_ADAPTIVE_SLICES = prev;
    }
  });

  it("defaults to aggressive adaptive mode for native peers when env unset", () => {
    const prev = process.env.QWORMHOLE_ADAPTIVE_SLICES;
    delete process.env.QWORMHOLE_ADAPTIVE_SLICES;
    const metrics: EntropyMetrics = { negIndex: 0.95 };
    const controller = createFlowController(metrics, { peerIsNative: true });
    expect(controller.getDiagnostics().adaptive?.mode).toBe("aggressive");
    if (prev === undefined) {
      delete process.env.QWORMHOLE_ADAPTIVE_SLICES;
    } else {
      process.env.QWORMHOLE_ADAPTIVE_SLICES = prev;
    }
  });
});

describe("FlowController integration with BatchFramer", () => {
  let controller: FlowController;
  let framer: BatchFramer;
  let canFlushSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    const policy = createTestPolicy();
    controller = new FlowController(policy);
    framer = new BatchFramer({
      batchSize: 64,
      flushIntervalMs: 0, // Disable auto-flush for testing
    });
    canFlushSpy = vi.spyOn(framer, "canFlush", "get").mockReturnValue(true);
  });

  afterEach(() => {
    // Clean up to prevent hanging timers
    canFlushSpy?.mockRestore();
    canFlushSpy = undefined;
    framer.reset();
  });

  it("enqueues payloads without immediate flush when below slice threshold", async () => {
    const flushHandler = vi.fn();
    controller.on("flush", flushHandler);

    // Enqueue a single small payload (slice size is 32, so won't trigger flush)
    await controller.enqueue(Buffer.from("test"), framer);

    expect(framer.pendingBatchSize).toBe(1);
    expect(flushHandler).not.toHaveBeenCalled();
  });

  it("flushes when pending batch reaches slice size", async () => {
    // Use smaller slice for easier testing
    const smallPolicy = createTestPolicy({
      preferredBatchSize: 8,
      minSlice: 2,
      maxSlice: 8,
    });
    const smallController = new FlowController(smallPolicy);

    const flushHandler = vi.fn();
    smallController.on("flush", flushHandler);

    // Slice size starts at 4 (half of 8)
    // Enqueue 4 payloads to trigger flush
    for (let i = 0; i < 4; i++) {
      await smallController.enqueue(Buffer.from(`msg${i}`), framer);
    }

    // Should have triggered flush (but no socket attached, so nothing actually sent)
    expect(flushHandler).toHaveBeenCalled();
  });

  it("tracks diagnostics across enqueue/flush cycles", async () => {
    const initialDiag = controller.getDiagnostics();
    expect(initialDiag.totalFlushes).toBe(0);

    // Trigger a manual flush
    await controller.flush(framer);

    const afterFlush = controller.getDiagnostics();
    expect(afterFlush.totalFlushes).toBe(1);
  });

  it("includes adaptive diagnostics when enabled", () => {
    const policy = createTestPolicy();
    const adaptiveController = new FlowController(policy, {
      adaptiveMode: "guarded",
    });
    const diag = adaptiveController.getDiagnostics();
    expect(diag.adaptive?.mode).toBe("guarded");
  });
});
