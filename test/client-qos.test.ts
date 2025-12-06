import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { QWormholeClient } from "../src/client/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("QWormholeClient QoS", () => {
  it("respects rate limits and backpressure when draining queue", async () => {
    vi.useFakeTimers();
    // Use in-memory config only, no host/port
    const client = new QWormholeClient<Buffer>({
      framing: "none",
      rateLimitBytesPerSec: 1, // force wait
      reconnect: { enabled: false },
    } as any);

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

  it("emits close with hadError when socket errors during reconnect", async () => {
    // Use in-memory client config, no real host/port
    const client = new QWormholeClient<Buffer>({
      reconnect: { enabled: false },
    } as any);
    const socket = new EventEmitter() as any;
    socket.destroyed = false;
    socket.write = vi.fn(() => true);
    (client as any).socket = socket;
    (client as any).socketTokenCounter = 1;
    (client as any).currentSocketToken = 1;

    const closed = new Promise<boolean>(resolve => {
      client.on("close", ({ hadError }) => resolve(hadError));
    });

    // Simulate error while handshake pending to set hadSocketError
    (client as any).hadSocketError = true;
    (client as any).handleClose(true, 1);
    const hadError = await closed;
    expect(hadError).toBe(true);
  });
});
