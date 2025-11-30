import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { QWormholeClient } from "../src/client.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("QWormholeClient QoS", () => {
  it("respects rate limits and backpressure when draining queue", async () => {
    vi.useFakeTimers();
    const client = new QWormholeClient<Buffer>({
      host: "127.0.0.1",
      port: 0,
      framing: "none",
      rateLimitBytesPerSec: 1, // force wait
    });

    const socket = new EventEmitter() as any;
    socket.destroyed = false;
    socket.write = vi.fn(() => {
      // Simulate backpressure then drain
      setTimeout(() => socket.emit("drain"), 5);
      return false;
    });

    // Inject mock socket
    (client as any).socket = socket;

    client.send(Buffer.alloc(8));
    await vi.runAllTimersAsync();

    expect(socket.write).toHaveBeenCalled();
    expect((client as any).draining).toBe(false);
  });
});
