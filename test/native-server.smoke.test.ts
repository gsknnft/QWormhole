import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { QWormholeClient, textDeserializer } from "../src";

/**
 * Native server smoke test - validates that the native server wrapper works
 * when the native addon is available. This test is skipped if native is not built.
 */

// Configurable timeout for CI environments (can be increased via env var)
const TEST_WAIT_MS = parseInt(process.env.NATIVE_TEST_WAIT_MS ?? "200", 10);

// Helper to wait for an event with timeout
const waitForEvent = <T>(
  emitter: { on: (event: string, fn: (arg: T) => void) => void },
  event: string,
  timeoutMs = TEST_WAIT_MS * 5,
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for "${event}" event`));
    }, timeoutMs);

    emitter.on(event, (arg: T) => {
      clearTimeout(timer);
      resolve(arg);
    });
  });
};

// Check if native server is available
const isNativeServerAvailable = async (): Promise<boolean> => {
  try {
    const { isNativeServerAvailable: check } = await import(
      "../src/native-server"
    );
    return check();
  } catch {
    return false;
  }
};

describe("Native Server Smoke Test", async () => {
  const nativeAvailable = await isNativeServerAvailable();

  describe.skipIf(!nativeAvailable)("with native server", () => {
    let server: Awaited<ReturnType<typeof import("../src/native-server").NativeQWormholeServer>> | null = null;
    let client: QWormholeClient<string> | null = null;
    let serverPort: number;

    beforeAll(async () => {
      const { NativeQWormholeServer } = await import("../src/native-server");

      server = new NativeQWormholeServer({
        host: "127.0.0.1",
        port: 0, // Let OS assign port
        deserializer: textDeserializer,
      });

      const address = await server.listen();
      serverPort = address.port;
      console.log(`[native-server-smoke] Server listening on port ${serverPort}`);
    });

    afterAll(async () => {
      if (client) {
        await client.disconnect();
      }
      if (server) {
        await server.close();
      }
    });

    it("accepts connections from TS client", async () => {
      if (!server) throw new Error("Server not initialized");

      const connectionReceived = vi.fn();
      server.on("connection", connectionReceived);

      client = new QWormholeClient<string>({
        host: "127.0.0.1",
        port: serverPort,
        deserializer: textDeserializer,
      });

      await client.connect();

      // Give the server time to process the connection
      await new Promise((resolve) => setTimeout(resolve, TEST_WAIT_MS));

      expect(connectionReceived).toHaveBeenCalled();
    });

    it("receives messages from TS client", async () => {
      if (!server || !client) throw new Error("Server/client not initialized");

      const messageReceived = vi.fn();
      server.on("message", messageReceived);

      client.send("hello from TS client");

      // Give time for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, TEST_WAIT_MS));

      expect(messageReceived).toHaveBeenCalled();
    });

    it("broadcasts to connected clients", async () => {
      if (!server || !client) throw new Error("Server/client not initialized");

      const messageReceived = vi.fn();
      client.on("message", messageReceived);

      server.broadcast("broadcast message");

      // Give time for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, TEST_WAIT_MS));

      expect(messageReceived).toHaveBeenCalled();
    });

    it("reports correct connection count", () => {
      if (!server) throw new Error("Server not initialized");

      const count = server.getConnectionCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it("emits clientClosed on disconnect", async () => {
      if (!server || !client) throw new Error("Server/client not initialized");

      const clientClosed = vi.fn();
      server.on("clientClosed", clientClosed);

      await client.disconnect();

      // Give time for the close event
      await new Promise((resolve) => setTimeout(resolve, TEST_WAIT_MS));

      expect(clientClosed).toHaveBeenCalled();
      client = null; // Mark as disconnected
    });
  });

  describe.skipIf(nativeAvailable)("without native server", () => {
    it("skips tests when native server is unavailable", () => {
      console.log("[native-server-smoke] Native server not available, skipping tests");
      expect(true).toBe(true);
    });
  });
});
