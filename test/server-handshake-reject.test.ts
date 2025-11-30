import { describe, it, expect } from "vitest";
import { QWormholeServer, QWormholeClient } from "../src/index.js";
import { jsonDeserializer } from "../src/codecs.js";

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
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000)),
      ]);
      // Wait for server to drop the client after destroy()
      const start = Date.now();
      while (server.getConnectionCount() > 0 && Date.now() - start < 500) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(server.getConnectionCount()).toBe(0);
      expect(hadError).not.toBe(false);
      await server.close();
    },
  );
});
