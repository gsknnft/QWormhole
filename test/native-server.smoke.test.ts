import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { QWormholeClient, textDeserializer } from "../src";

/**
 * Native server smoke test - validates that the native server wrapper works
 * when the native addon is available. This test is skipped if native is not built.
 */

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
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(connectionReceived).toHaveBeenCalled();
    });

    it("receives messages from TS client", async () => {
      if (!server || !client) throw new Error("Server/client not initialized");

      const messageReceived = vi.fn();
      server.on("message", messageReceived);

      client.send("hello from TS client");

      // Give time for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(messageReceived).toHaveBeenCalled();
    });

    it("broadcasts to connected clients", async () => {
      if (!server || !client) throw new Error("Server/client not initialized");

      const messageReceived = vi.fn();
      client.on("message", messageReceived);

      server.broadcast("broadcast message");

      // Give time for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
