import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import {
  QWormholeClient,
  QWormholeServer,
  createQWormholeClient,
  isNativeAvailable,
} from "../src/index.js";
import { jsonDeserializer, textDeserializer } from "../src/codecs.js";
import type {
  QWormholeClientOptions,
  QWormholeServerConnection,
} from "../src/types/types.js";
import net from "node:net";
import { CreateClientOptions } from "../src/factory.js";

if (typeof vi !== "undefined" && process.env.TEST_NATIVE_MOCK === "true") {
  vi.mock("../src/native", () => ({
    NativeTcpClient: vi.fn(() => ({ native: true })),
    isNativeAvailable: vi.fn(),
    getNativeBackend: vi.fn(),
  }));
}

describe("QWormhole client/server", () => {
  let server: QWormholeServer<string>;
  let port: number;

  beforeAll(async () => {
    server = new QWormholeServer<string>({
      host: "127.0.0.1",
      port: 0,
      deserializer: textDeserializer,
    });
    const address = await server.listen();
    port = address.port;
  });

  afterAll(async () => {
    await server.close();
  });

  it("sends and receives framed messages", async () => {
    const received = new Promise<string>(resolve => {
      server.once("message", ({ data }) => resolve(data));
    });

    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: textDeserializer,
    });

    await client.connect();
    client.send("hello-qwormhole");
    const message = await received;
    expect(message).toBe("hello-qwormhole");
    client.disconnect();
  });

  it("factory selects TS when native is unavailable", async () => {
    const options = {
      host: "127.0.0.1",
      port,
      preferNative: true,
      deserializer: textDeserializer,
    };
    // Type assertion to fix type error
    const { client, mode, nativeAvailable } = createQWormholeClient(
      options as CreateClientOptions<string>,
    );

    const nativeReady = nativeAvailable && isNativeAvailable();
    if (nativeReady) {
      expect(["native-lws", "native-libsocket"]).toContain(mode);
    } else {
      expect(mode).toBe("ts");
    }
    if (client instanceof QWormholeClient) {
      client.disconnect();
    }
  });

  it("honors connect timeout", async () => {
    const client = new QWormholeClient<string>({
      host: "10.255.255.1", // unroutable
      port: 9,
      connectTimeoutMs: 100,
    });
    await expect(client.connect()).rejects.toThrow(/Connection timed out/);
  });

  it("enforces backpressure thresholds", async () => {
    const maxBackpressureBytes = 8;
    const bpServer = new QWormholeServer<string>({
      host: "127.0.0.1",
      port: 0,
      maxBackpressureBytes,
    });
    bpServer.on("error", () => {}); // silence expected backpressure error
    const connectionReady = new Promise<QWormholeServerConnection>(resolve => {
      bpServer.once("connection", client => resolve(client));
    });
    const address = await bpServer.listen();

    const socket = net.createConnection({
      host: "127.0.0.1",
      port: address.port,
    });
    const connection = await connectionReady;
    expect(connection).toBeDefined();

    await expect(
      connection!.send(Buffer.alloc(maxBackpressureBytes * 2)),
    ).rejects.toThrow(/Backpressure/);
    socket.destroy();
    await bpServer.close();
  });

  it(
    "performs versioned handshake",
    { timeout: 20000 }, // Increase Vitest timeout to 20s
    async () => {
      console.log("[TEST] Starting handshake test");
      // const jsonDeserializer = (buf: Buffer) =>
      //   JSON.parse(buf.toString("utf8"));
      const hsServer = new QWormholeServer<any>({
        host: "127.0.0.1",
        port: 0,
        protocolVersion: "1.0.0",
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
      });
      hsServer.on("listening", info => {
        console.log(`[SERVER] Listening on ${info.host}:${info.port}`);
      });
      hsServer.on("connection", () => {
        console.log("[SERVER] Client connected");
      });
      hsServer.on("message", ({ data }) => {
        console.log(`[SERVER] Received message`, data);
      });
      hsServer.on("error", err => {
        console.error("[SERVER] Error:", err);
      });
      // Wait for handshake message
      const received = new Promise<any>(resolve => {
        hsServer.once("message", ({ data }) => resolve(data));
      });
      const address = await hsServer.listen();
      console.log(`[TEST] Server listening on port ${address.port}`);

      const client = new QWormholeClient<any>({
        host: "127.0.0.1",
        port: address.port,
        protocolVersion: "1.0.0",
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
      });
      client.on("connect", () => {
        console.log("[CLIENT] Connected to server");
      });
      client.on("error", err => {
        console.error("[CLIENT] Error:", err);
      });

      await client.connect();
      console.log(
        "[CLIENT] Sending handshake message using enqueueHandshake()",
      );
      // Send handshake using the same method as the client implementation
      // This ensures framing and serialization match protocol expectations
      // @ts-ignore: access private for test
      await client.enqueueHandshake();
      const msg = await received;
      console.log(`[TEST] Handshake received:`, msg);
      expect(msg).toEqual({
        type: "handshake",
        version: "1.0.0",
        tags: undefined,
      });
      // Send a JSON message after handshake and expect echo
      const echoReceived = new Promise<any>(resolve => {
        hsServer.once("message", ({ data }) => resolve(data));
      });
      const testPayload = { type: "test", value: 42 };
      await client.send(testPayload);
      const echoMsg = await echoReceived;
      console.log(`[TEST] Echo received:`, echoMsg);
      expect(echoMsg).toEqual(testPayload);
      client.disconnect();
      await hsServer.close();
      console.log("[TEST] Handshake test complete");
    },
  );
});
