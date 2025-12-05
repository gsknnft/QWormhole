//TODO: Full coverage of client tests
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { QWormholeClient } from "../src/client/index.js";
import { jsonDeserializer, textDeserializer } from "../src/codecs.js";
import net from "node:net";
import { QWormholeServer } from "../src/server/index.js";
import { QWormholeClientOptions } from "../src/index.js";

const host = "127.0.0.1";
const EVENT_TIMEOUT_MS = 2_000;

type EventEmitterLike = {
  once(event: string, handler: (...args: any[]) => void): unknown;
  off?: (event: string, handler: (...args: any[]) => void) => unknown;
  removeListener?: (event: string, handler: (...args: any[]) => void) => unknown;
};

const waitForEvent = <T = unknown>(
  emitter: EventEmitterLike,
  event: string,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let timer: NodeJS.Timeout;
    const handler = async (value: T) => {
      clearTimeout(timer);
      await cleanup();
      resolve(value);
    };
    const cleanup = async () => {
      if (typeof emitter.off === "function") {
        emitter.off(event, handler);
      } else if (typeof emitter.removeListener === "function") {
        emitter.removeListener(event, handler);
      }
    };
    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting ${timeoutMs}ms for '${event}' event`,
        ),
      );
    }, timeoutMs);
    emitter.once(event, handler);
  });

describe("QWormholeClient", () => {
  let server: QWormholeServer;
  let port: number;
  let address: net.AddressInfo;
  const swallowProcessReset = (err: NodeJS.ErrnoException) => {
    if (err?.code === "ECONNRESET" || err?.code === "EPIPE") return;
    process.off("uncaughtException", swallowProcessReset);
    throw err;
  };

  beforeAll(() => {
    process.on("uncaughtException", swallowProcessReset);
  });

  afterAll(() => {
    process.off("uncaughtException", swallowProcessReset);
  });

  beforeEach(async () => {
    server = new QWormholeServer<any>({
      host,
      port: 0,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer, // default
    });
    server.on("error", () => {
      // swallow expected connection resets during teardown-heavy tests
    });
    address = await server.listen();
    port = address.port;
    console.log("[client.test] server listening on", port);
  });

  afterEach(async () => {
    const start = Date.now();
    const connectionCount = server.getConnectionCount();
    const sockets = Array.from((server as any).clients?.values?.() ?? []).map(
      (conn: any) => ({
        id: conn.id,
        destroyed: conn.socket?.destroyed,
        readyState: conn.socket?.readyState,
      }),
    );
    console.log(
      "[client.test] afterEach closing server connections",
      connectionCount,
      sockets,
    );
    await server?.close();
    if (server.getConnectionCount() === 0) {
      console.log(
        "[client.test] all server connections closed successfully",
      );
    } else {
      console.error(
        "[client.test] server connections remaining after close:",
        server.getConnectionCount(),
      );
    }
    console.log(
      "[client.test] afterEach closed server in",
      Date.now() - start,
      "ms",
    );
  });

  it(
    "should connect to server and send/receive messages",
    { timeout: 20000 },
    async () => {
      const client = new QWormholeClient<any>({
        host: "127.0.0.1",
        port: address.port,
        protocolVersion: "1.0.0",
        deserializer: jsonDeserializer, // <-- use jsonDeserializer here
      });
      server.on("connection", () =>
        console.log("[client.test] server connection"),
      );
      server.on("clientClosed", evt =>
        console.log("[client.test] server clientClosed", evt),
      );
      await client.connect();
      console.log("[client.test] connected");

      const testMessage = { type: "test", value: "Hello, QWormhole!" };
      const logMessage = ({ data }: { data: unknown }) => {
        console.log("[client.test] server message", data);
      };
      server.on("message", logMessage);
      const received = waitForEvent<{ data: unknown }>(
        server as EventEmitterLike,
        "message",
      );

      await new Promise(resolve => setTimeout(resolve, 10));
      console.log("[client.test] sending payload");
      await client.send(testMessage);
      console.log("[client.test] send returned");
      const { data: message } = await received;
      console.log("[client.test] received", message);
      server.off("message", logMessage);
      expect(message).toEqual(testMessage);
      await client.disconnect();
    },
  );

  it("should throw on connect to bad host", async () => {
    const client = new QWormholeClient<string>({
      host: "badhost",
      port,
      protocolVersion: "1.0.0",
      deserializer: textDeserializer,
      connectTimeoutMs: 100,
      reconnect: { enabled: false },
    });
    client.on("error", () => {
      // Ignore expected DNS errors in this test to avoid cross-platform uncaught exceptions
    });
    await expect(client.connect()).rejects.toThrow();
    await client.disconnect();
  });

  it("should emit error on send when not connected", async () => {
    const client = new QWormholeClient<string>({
      host,
      port,
      protocolVersion: "1.0.0",
      deserializer: textDeserializer,
      requireConnectedForSend: true,
    });
    await expect(client.send("fail")).rejects.toThrow(
      "QWormholeClient is not connected",
    );
  });

  it("should handle disconnect gracefully", async () => {
    const client = new QWormholeClient<string>({
      host,
      port,
      protocolVersion: "1.0.0",
      deserializer: textDeserializer,
    });
    await client.connect();
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("should throw error for invalid interface name", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      interfaceName: "nonexistent0",
      protocolVersion: "1.0.0",
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
      protocolVersion: "1.0.0",
      idleTimeoutMs: 10,
      deserializer: jsonDeserializer,
    });
    await client.connect();
    await waitForEvent(client as EventEmitterLike, "timeout");
    await client.disconnect();
  });

  it("should handle socket error event", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
    });
    await client.connect();
    const error = waitForEvent(client as EventEmitterLike, "error");
    client.socket?.emit("error", new Error("Simulated error"));
    await error;
    await client.disconnect();
  });

  it("should handle socket close event and trigger reconnect", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      protocolVersion: "1.0.0",
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
    const reconnecting = waitForEvent(client as EventEmitterLike, "reconnecting");
    // Also guard 'close' events
    client.on("close", () => {
      // ensure reconnect logic or silent teardown
    });
    const activeSocket = client.socket;
    client.socket?.emit("close", true);
    activeSocket?.destroy();
    await reconnecting;
    client.off("error", ignoreReset);
    await client.disconnect();
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
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
      requireConnectedForSend: false,
    });
    expect(await client.send("test")).toBeUndefined();
  });

  it("should drain queue with rate limiting", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
      rateLimitBytesPerSec: 1,
      rateLimitBurstBytes: 1,
    });
    await client.connect();
    await client.send("test");
    await client.disconnect();
  });

  it("should handle double disconnect gracefully", async () => {
    const client = new QWormholeClient<string>({
      host: "127.0.0.1",
      port,
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
    });
    await client.connect();
    await client.disconnect();
    expect(() => client.disconnect()).not.toThrow();
  });

  
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
  await client.disconnect();
})
;

  // it("should enqueue handshake and drain queue", async () => {
  //   const client = new QWormholeClient<any>({
  //     host: "127.0.0.1",
  //     port,
  //     protocolVersion: "1.0.0",
  //     deserializer: jsonDeserializer,
  //   });
  //   console.log("[client.test] connecting for handshake test");
  //   await client.connect();
  //   console.log("[client.test] connected, enqueueing handshake");
  //   await client.enqueueHandshake();
  //   console.log("[client.test] handshake enqueued, disconnecting");
  //   client.disconnect();
  //   console.log("[client.test] disconnect invoked");
  //   await waitForEvent(client as EventEmitterLike, "close");
  //   console.log("[client.test] close event observed");
  //   if (!client.isConnected()) {
  //     console.log("[client.test] client is disconnected as expected");
  //   } else {
  //     console.error("[client.test] client is still connected unexpectedly");
  //   }
  // });


/*

it("should emit error if serializer throws", async () => {
  const client = new QWormholeClient<string>({
    host,
    port,
    serializer: () => { throw new Error("bad serializer"); },
    deserializer: jsonDeserializer,
  });
  await client.connect();
  const error = new Promise(resolve => client.once("error", resolve));
  await client.send("test");
  await expect(error).resolves.toBeInstanceOf(Error);
  await client.disconnect();
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
  await client.disconnect();
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
