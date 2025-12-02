import { describe, it, expect, vi } from "vitest";
import net from "node:net";
import {
  QWormholeServer,
  QWormholeClient,
  createNegantropicHandshake,
} from "../src/index.js";
import { jsonDeserializer } from "../src/codecs.js";
import { LengthPrefixedFramer } from "../src/framing.js";

describe("QWormholeServer handshake rejection", () => {
  it(
    "destroys connection when verifyHandshake returns false",
    { timeout: 8000 },
    async () => {
      const server = new QWormholeServer<any>({
        host: "127.0.0.1",
        port: 0,
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
        verifyHandshake: () => false,
      });
      const address = await server.listen();

      const client = new QWormholeClient<any>({
        host: "127.0.0.1",
        port: address.port,
        protocolVersion: "1.0.0",
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
      });

      const closed = new Promise<boolean>(resolve => {
        client.on("close", ({ hadError }) => resolve(hadError));
      });
      const errored = new Promise<boolean>(resolve => {
        client.on("error", () => resolve(true));
      });

      await client.connect();
      const hadError = await Promise.race([
        closed,
        errored,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500)),
      ]);
      await server.close();
      expect(server.getConnectionCount()).toBe(0);
      expect(hadError).toBe(false);
    },
  );

  it("handles verifyHandshake throwing", async () => {
    const server = new QWormholeServer<any>({
      host: "127.0.0.1",
      port: 0,
      framing: "length-prefixed",
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
      verifyHandshake: () => {
        throw new Error("boom");
      },
    });
    const address = await server.listen();

    const errorSeen = new Promise<boolean>(resolve => {
      server.once("error", () => resolve(true));
    });
    const closed = new Promise<boolean>(resolve => {
      server.once("clientClosed", ({ hadError }) => resolve(hadError));
    });

    const framer = new LengthPrefixedFramer();
    const socket = net.createConnection(address.port, address.address);
    const hs = { type: "handshake", version: "1.0.0" };
    socket.write(framer.encode(Buffer.from(JSON.stringify(hs))));

    const hadError = await Promise.race([
      closed,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 800)),
    ]);
    const err = await Promise.race([
      errorSeen,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 800)),
    ]);
    expect(hadError).toBe(true);
    expect(err).toBe(true);
    expect(server.getConnectionCount()).toBe(0);
    socket.destroy();
    await server.close();
  });

  it("handles invalid JSON handshake", async () => {
    const server = new QWormholeServer<any>({
      host: "127.0.0.1",
      port: 0,
      framing: "length-prefixed",
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
    });
    const address = await server.listen();

    const errorSeen = new Promise<boolean>(resolve => {
      server.once("error", () => resolve(true));
    });
    const closed = new Promise<boolean>(resolve => {
      server.once("clientClosed", ({ hadError }) => resolve(hadError));
    });

    const framer = new LengthPrefixedFramer();
    const socket = net.createConnection(address.port, address.address);
    socket.write(framer.encode(Buffer.from("{not-json")));

    const hadError = await Promise.race([
      closed,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 800)),
    ]);
    const err = await Promise.race([
      errorSeen,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 800)),
    ]);
    expect(hadError).toBe(true);
    expect(err).toBe(true);
    expect(server.getConnectionCount()).toBe(0);
    socket.destroy();
    await server.close();
  });

  it(
    "rejects invalid negantropic handshake signatures",
    { timeout: 8000 },
    async () => {
      const server = new QWormholeServer<any>({
        host: "127.0.0.1",
        port: 0,
        protocolVersion: "1.0.0",
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
      });
      const address = await server.listen();

      const serverClosed = new Promise<boolean>(resolve => {
        server.once("clientClosed", ({ hadError }) => resolve(hadError));
      });
      const errorSeen = new Promise<boolean>(resolve => {
        server.once("error", () => resolve(true));
      });

      const framer = new LengthPrefixedFramer();
      const socket = net.createConnection(address.port, address.address);
      const hs = createNegantropicHandshake({ version: "1.0.0" });
      const tampered = { ...hs, negHash: "deadbeef" + hs.negHash.slice(8) };
      socket.write(framer.encode(Buffer.from(JSON.stringify(tampered))));

      const hadErrorServer = await Promise.race([
        serverClosed,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500)),
      ]);
      const errorEmitted = await Promise.race([
        errorSeen,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 500)),
      ]);

      expect(hadErrorServer).toBe(true);
      expect(errorEmitted).toBe(true);
      expect(server.getConnectionCount()).toBe(0);
      socket.destroy();
      await server.close();
    },
  );

  it("handles verifyHandshake async rejection path", async () => {
    const telemetry: any[] = [];
    interface ServerOptions<T> {
      host: string;
      port: number;
      framing: "length-prefixed";
      protocolVersion: string;
      deserializer: (data: Buffer) => T;
      verifyHandshake: () => Promise<never>;
      onTelemetry: (snapshot: Record<string, unknown>) => void;
    }

    const server = new QWormholeServer<any>({
      host: "127.0.0.1",
      port: 0,
      framing: "length-prefixed",
      protocolVersion: "1.0.0",
      deserializer: jsonDeserializer,
      verifyHandshake: (): Promise<never> => Promise.reject(new Error("nope")),
      onTelemetry: (snapshot: Record<string, unknown>) => telemetry.push({ ...snapshot }),
    });

    const connectionReady = new Promise<void>(resolve => {
      server.once("connection", () => resolve());
    });
    const closed = new Promise<boolean>(resolve => {
      server.once("clientClosed", ({ hadError }) => resolve(hadError));
    });

    const address = await server.listen();
    const framer = new LengthPrefixedFramer();
    const socket = net.createConnection(address.port, address.address);

    await connectionReady;
    socket.write(
      framer.encode(Buffer.from(JSON.stringify({ type: "handshake", version: "1.0.0" }))),
    );

    const hadError = await Promise.race([
      closed,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000)),
    ]);

    expect(hadError).toBe(true);
    expect(server.getConnectionCount()).toBe(0);
    expect(telemetry.some(t => t.connections === 0)).toBe(true);

    socket.destroy();
    await server.close();
  });

  it("publishes telemetry for backpressure and drain", async () => {
    const telemetry: any[] = [];
    interface TelemetrySnapshot {
      connections?: number;
      backpressureEvents?: number;
      drainEvents?: number;
      [key: string]: unknown;
    }

    interface ServerOptions<T> {
      host: string;
      port: number;
      onTelemetry: (snapshot: TelemetrySnapshot) => void;
    }

    const server = new QWormholeServer<Buffer>({
      host: "127.0.0.1",
      port: 0,
      onTelemetry: (snapshot: TelemetrySnapshot) => telemetry.push({ ...snapshot }),
    });
    const connectionReady = new Promise<any>(resolve => {
      server.once("connection", client => resolve(client));
    });
    const backpressured = new Promise<string>(resolve => {
      server.once("backpressure", ({ client }) => resolve(client.id));
    });
    const drained = new Promise<string>(resolve => {
      server.once("drain", ({ client }) => resolve(client.id));
    });

    const address = await server.listen();
    const socket = net.createConnection(address.port, address.address);
    const connection = await connectionReady;

    const writeSpy = vi
      .spyOn(connection.socket, "write")
      .mockImplementation(() => {
        setTimeout(() => connection.socket.emit("drain"), 5);
        return false;
      });

    await connection.send(Buffer.from("hello"));
    const bpId = await Promise.race([
      backpressured,
      new Promise<string>(resolve => setTimeout(() => resolve(""), 500)),
    ]);
    const drainId = await Promise.race([
      drained,
      new Promise<string>(resolve => setTimeout(() => resolve(""), 500)),
    ]);

    expect(bpId).toBe(connection.id);
    expect(drainId).toBe(connection.id);
    expect(telemetry.some(t => t.backpressureEvents > 0)).toBe(true);
    expect(telemetry.some(t => t.drainEvents > 0)).toBe(true);

    writeSpy.mockRestore();
    socket.destroy();
    await server.close();
  });
});
