//TODO: Full coverage of client tests
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { QWormholeClient } from "../src/client/index.js";
import { jsonDeserializer, textDeserializer } from "../src/codecs.js";
import net from "node:net";
import { QWormholeServer } from "../src/server/index.js";
import { QWormholeClientOptions } from "../src/index.js";

const host = "127.0.0.1";

describe("QWormholeClient", () => {
  let server: QWormholeServer;
  let port: number;
  let address: net.AddressInfo;

beforeEach(async () => {
  server = new QWormholeServer<any>({
    host,
    port: 0,
    protocolVersion: "1.0.0",
    framing: "length-prefixed",
    deserializer: jsonDeserializer, // default
  });
  address = await server.listen();
  port = address.port;
});

afterEach(() => {
  server.close();
});
  // beforeEach(async () => {
  //   server = new QWormholeServer<any>({
  //     host: "127.0.0.1",
  //     port: 0,
  //     protocolVersion: "1.0.0",
  //     framing: "length-prefixed",
  //     deserializer: jsonDeserializer, // <-- ensure this is jsonDeserializer
  //   });
  //   address = await server.listen();
  //   port = address.port;
  // });

  it(
    "should connect to server and send/receive messages",
    { timeout: 20000 },
    async () => {
      const client = new QWormholeClient<any>({
        host: "127.0.0.1",
        port: address.port,
        deserializer: jsonDeserializer, // <-- use jsonDeserializer here
      });
      await client.connect();

      const testMessage = { type: "test", value: "Hello, QWormhole!" };
      const received = new Promise<any>(resolve => {
        server.once("message", ({ data }) => resolve(data));
      });

      await client.send(testMessage);
      const message = await received;
      expect(message).toEqual(testMessage);
      client.disconnect();
    },
  );

  it("should throw on connect to bad host", async () => {
    const client = new QWormholeClient<string>({
      host: "badhost",
      port,
      deserializer: textDeserializer,
      connectTimeoutMs: 100,
      reconnect: { enabled: false },
    });
    client.on("error", () => {
      // Ignore expected DNS errors in this test to avoid cross-platform uncaught exceptions
    });
    await expect(client.connect()).rejects.toThrow();
    client.disconnect();
  });

  it("should emit error on send when not connected", async () => {
    const client = new QWormholeClient<string>({
      host,
      port,
      deserializer: textDeserializer,
      requireConnectedForSend: true,
    });
    expect(() => client.send("fail")).toThrow(
      "QWormholeClient is not connected",
    );
  });

  it("should handle disconnect gracefully", async () => {
    const client = new QWormholeClient<string>({
      host,
      port,
      deserializer: textDeserializer,
    });
    await client.connect();
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("should throw error for invalid interface name", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      interfaceName: "nonexistent0",
      deserializer: jsonDeserializer,
    });
    await expect(client.connect()).rejects.toThrow(
      /Interface nonexistent0 not found/,
    );
  });

  it("should handle socket timeout event", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      idleTimeoutMs: 10,
      deserializer: jsonDeserializer,
    });
    await client.connect();
    const timeout = new Promise(resolve => client.once("timeout", resolve));
    await timeout;
    client.disconnect();
  });

  it("should handle socket error event", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: jsonDeserializer,
    });
    await client.connect();
    const error = new Promise(resolve => client.once("error", resolve));
    client.socket?.emit("error", new Error("Simulated error"));
    await error;
    client.disconnect();
  });

  it("should handle socket close event and trigger reconnect", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: jsonDeserializer,
      reconnect: {
        enabled: true,
        initialDelayMs: 10,
        maxDelayMs: 20,
        multiplier: 2,
        maxAttempts: 1,
      },
    });
    await client.connect();
    const ignoreReset = (err: NodeJS.ErrnoException) => {
      if (err?.code === "ECONNRESET" || err?.code === "EPIPE") return;
      throw err;
    };
    client.on("error", ignoreReset);
    const reconnecting = new Promise(resolve =>
      client.once("reconnecting", resolve),
    );
    // Also guard 'close' events
    client.on("close", () => {
      // ensure reconnect logic or silent teardown
    });
    client.socket?.emit("close", true);
    await reconnecting;
    client.off("error", ignoreReset);
    client.disconnect();
  });

  it("should build options with all fields set", () => {
    interface ReconnectOptions {
      enabled: boolean;
      initialDelayMs: number;
      maxDelayMs: number;
      multiplier: number;
      maxAttempts: number;
    }

    // interface QWormholeClientOptions<T> {
    //   host: string;
    //   port: number;
    //   framing: string;
    //   maxFrameLength: number;
    //   keepAlive: boolean;
    //   keepAliveDelayMs: number;
    //   idleTimeoutMs: number;
    //   reconnect: ReconnectOptions;
    //   serializer: (data: T) => Buffer;
    //   deserializer: (data: Buffer) => T;
    //   requireConnectedForSend: boolean;
    //   localAddress: string;
    //   localPort: number;
    //   interfaceName: string;
    //   connectTimeoutMs: number;
    //   protocolVersion: string;
    //   handshakeTags: Record<string, string>;
    //   rateLimitBytesPerSec: number;
    //   rateLimitBurstBytes: number;
    // }

    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      framing: "length-prefixed",
      maxFrameLength: 1024,
      keepAlive: false,
      keepAliveDelayMs: 1000,
      idleTimeoutMs: 1000,
      reconnect: {
        enabled: false,
        initialDelayMs: 1,
        maxDelayMs: 1,
        multiplier: 1,
        maxAttempts: 1,
      } as ReconnectOptions,
      serializer: (x: string): Buffer => Buffer.from("test"),
      deserializer: (x: Buffer): string => x.toString(),
      requireConnectedForSend: true,
      localAddress: "127.0.0.1",
      localPort: 1234,
      interfaceName: "lo",
      connectTimeoutMs: 100,
      protocolVersion: "1.0.0",
      handshakeTags: { foo: "bar" },
      rateLimitBytesPerSec: 100,
      rateLimitBurstBytes: 200,
    } as QWormholeClientOptions<string>);
    expect(client).toBeInstanceOf(QWormholeClient);
  });

  it("should not throw when sending if not connected and requireConnectedForSend is false", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: jsonDeserializer,
      requireConnectedForSend: false,
    });
    await expect(client.send("test")).toBeUndefined();
  });

  it("should drain queue with rate limiting", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: jsonDeserializer,
      rateLimitBytesPerSec: 1,
      rateLimitBurstBytes: 1,
    });
    await client.connect();
    await client.send("test");
    client.disconnect();
  });

  it("should handle double disconnect gracefully", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      deserializer: jsonDeserializer,
    });
    await client.connect();
    client.disconnect();
    expect(() => client.disconnect()).not.toThrow();
  });

  it("should enqueue handshake and drain queue", async () => {
    const client = new QWormholeClient<any>({
      host: "127.0.0.1",
      port,
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
    });
    await client.connect();
    await client.enqueueHandshake();
    client.disconnect();
  });



/*

  it("should respect keepAlive and not disconnect prematurely", async () => {
  const client = new QWormholeClient<string>({
    host,
    port,
    deserializer: jsonDeserializer,
    keepAlive: true,
    keepAliveDelayMs: 50,
  });
  await client.connect();
  // Wait a bit longer than keepAliveDelayMs
  await new Promise(res => setTimeout(res, 100));
  expect(client.isConnected()).toBe(true);
  client.disconnect();
});

it("should emit error if serializer throws", async () => {
  const client = new QWormholeClient<string>({
    host,
    port,
    serializer: () => { throw new Error("bad serializer"); },
    deserializer: jsonDeserializer,
  });
  await client.connect();
  const error = new Promise(resolve => client.once("error", resolve));
  client.send("test");
  await expect(error).resolves.toBeInstanceOf(Error);
  client.disconnect();
});

it("should enforce maxFrameLength", async () => {
  const client = new QWormholeClient<string>({
    host,
    port,
    deserializer: jsonDeserializer,
    maxFrameLength: 10,
  });
  await client.connect();
  await expect(client.send("this message is too long"))
    .rejects.toThrow(/frame length/i);
  client.disconnect();
});

it("should exhaust reconnect attempts", async () => {
  const client = new QWormholeClient<string>({
    host: "badhost",
    port,
    deserializer: jsonDeserializer,
    reconnect: { enabled: true, maxAttempts: 1, initialDelayMs: 10, maxDelayMs: 20, multiplier: 2 },
  });
  const error = new Promise(resolve => client.once("error", resolve));
  await expect(client.connect()).rejects.toThrow();
  await expect(error).resolves.toBeInstanceOf(Error);
});
*/



});
