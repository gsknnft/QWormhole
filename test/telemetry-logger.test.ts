import { describe, expect, it, vi } from "vitest";
import { createConsoleTelemetryLogger } from "../src/telemetry-logger.js";
import type { QWormholeTelemetry } from "types";

describe("telemetry logger", () => {
  it("formats telemetry snapshot", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createConsoleTelemetryLogger("TEST");
    const metrics: QWormholeTelemetry = {
      bytesIn: 10,
      bytesOut: 20,
      connections: 1,
      backpressureEvents: 2,
      drainEvents: 3,
    };
    logger(metrics);
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0][0] as string;
    expect(call.includes("[TEST]")).toBe(true);
    expect(call.includes("conn=1")).toBe(true);
    spy.mockRestore();
  });
});
