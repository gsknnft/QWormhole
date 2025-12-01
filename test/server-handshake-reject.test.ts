import { describe, it, expect } from "vitest";
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
});
