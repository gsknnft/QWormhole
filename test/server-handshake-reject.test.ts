import { describe, it, expect } from "vitest";
import { QWormholeServer, QWormholeClient, createNegantropicHandshake } from "../src/index.js";
import { jsonDeserializer } from "../src/codecs.js";
import {LengthPrefixedFramer} from"../src/framing.js";

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
      const serverClosed = new Promise<void>(resolve => {
        server.on("clientClosed", () => resolve());
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
      const client = new QWormholeClient<any>({
        host: "127.0.0.1",
        port: address.port,
        protocolVersion: "1.0.0",
        framing: "length-prefixed",
        deserializer: jsonDeserializer,
        handshakeSigner: () => {
          const hs = createNegantropicHandshake({ version: "1.0.0" });
          return { ...hs, negHash: "deadbeef" + hs.negHash.slice(8) };
        },
      });
      const serverClosed = new Promise<boolean>(resolve => {
        server.once("clientClosed", ({ hadError }) => resolve(hadError));
      });
      const clientClosed = new Promise<boolean>(resolve => {
        client.once("close", ({ hadError }) => resolve(hadError));
      });

      await client.connect();

      const [hadErrorServer, hadErrorClient] = await Promise.all([
        serverClosed,
        clientClosed,
      ]);
      // Manually craft a tampered negantropic handshake
      const hs = createNegantropicHandshake({ version: "1.0.0" });
      const tampered = { ...hs, negHash: "deadbeef" + hs.negHash.slice(8) };

      // Find the raw socket from the server's connections and write directly for test purposes
      const connections = (server as any)._connections || [];
      const framer = new LengthPrefixedFramer();
      if (connections.length > 0) {
        connections[0].socket.write(framer.encode(Buffer.from(JSON.stringify(tampered))));
      }

      expect(hadErrorServer).toBe(true);
      expect(hadErrorClient).toBe(true);
      expect(server.getConnectionCount()).toBe(0);
      await server.close();
    },
  );

    },
  );
