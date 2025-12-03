import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { jsonDeserializer } from "../src/codecs.js";
import {
  QWormholeClient,
  QWormholeServer,
  createNegantropicHandshake,
  verifyNegantropicHandshake,
} from "../src/index.js";
import { computeNIndex } from "../src/handshake/negantropic-handshake.js";

describe("computeNIndex", () => {
  const adversarialBase64 = fc.oneof(
    fc.string(),
    fc.base64String(),
    fc.constant(""),
    fc.constant("===="),
  );

  it("always returns a finite clamped value", () => {
    fc.assert(
      fc.property(adversarialBase64, input => {
        const nIndex = computeNIndex(input);
        expect(Number.isFinite(nIndex)).toBe(true);
        expect(nIndex).toBeGreaterThanOrEqual(0);
        expect(nIndex).toBeLessThanOrEqual(1);
      }),
      { numRuns: 250 },
    );
  });

  it("handles massive inputs without skewing bounds", () => {
    fc.assert(
      fc.property(
        fc.base64String({ minLength: 4096, maxLength: 16384 }),
        input => {
          const nIndex = computeNIndex(input);
          expect(nIndex).toBeGreaterThanOrEqual(0);
          expect(nIndex).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("returns zero for empty or malformed payloads", () => {
    expect(computeNIndex("")).toBe(0);
    expect(computeNIndex("====")).toBe(0);
    expect(computeNIndex("A".repeat(10000))).toBeLessThanOrEqual(1);
  });
});

describe("Negantropic handshake", () => {
  it("creates and verifies signed handshake payloads", () => {
    const hs = createNegantropicHandshake({
      version: "1.0.0",
      tags: { device: "alpha" },
    });
    expect(hs.type).toBe("handshake");
    expect(typeof hs.signature).toBe("string");
    expect(typeof hs.negHash).toBe("string");
    expect(hs.nIndex).toBeGreaterThanOrEqual(0);
    expect(verifyNegantropicHandshake(hs)).toBe(true);

    const tampered = { ...hs, negHash: "00" + hs.negHash.slice(2) };
    expect(verifyNegantropicHandshake(tampered)).toBe(false);
  });

  it("allows server-side handshake verification", async () => {
    const handshake = createNegantropicHandshake({ version: "1.0.0" });
    const server = new QWormholeServer<any>({
      host: "127.0.0.1",
      port: 0,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
      verifyHandshake: verifyNegantropicHandshake,
    });
    const connectionReady = new Promise<string | undefined>(resolve => {
      server.once("connection", client => {
        const timer = setInterval(() => {
          if (!client.handshakePending) {
            clearInterval(timer);
            resolve(client.handshake?.negHash);
          }
        }, 5);
      });
    });
    const address = await server.listen();
    const client = new QWormholeClient<any>({
      host: "127.0.0.1",
      port: address.port,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
      handshakeSigner: () => createNegantropicHandshake({ version: "1.0.0" }),
    });

    await client.connect();
    const negHash = await connectionReady;
    expect(negHash).toBeDefined();
    client.disconnect();
    await server.close();
  });
});
