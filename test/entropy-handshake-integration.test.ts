import { describe, it, expect } from "vitest";
import {
  QWormholeClient,
  QWormholeServer,
  createNegantropicHandshake,
  jsonDeserializer,
} from "../src/index";

describe("Entropy-Adaptive Handshake Integration", () => {
  it("derives entropy policy from handshake nIndex", async () => {
    // Create handshake with known nIndex
    const handshake = createNegantropicHandshake({ version: "1.0.0" });

    const server = new QWormholeServer<unknown>({
      host: "127.0.0.1",
      port: 0,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
    });

    const connectionReady = new Promise<{
      nIndex?: number;
      policy?: { mode: string; batchSize: number; trustLevel: number };
      entropyMetrics?: {
        entropy?: number;
        coherence?: string;
        entropyVelocity?: string;
      };
    }>(resolve => {
      server.once("connection", client => {
        const timer = setInterval(() => {
          if (!client.handshakePending && client.handshake) {
            clearInterval(timer);
            resolve({
              nIndex: client.handshake.nIndex,
              policy: client.handshake.policy,
              entropyMetrics: client.handshake.entropyMetrics,
            });
          }
        }, 5);
      });
    });

    const address = await server.listen();

    const client = new QWormholeClient<unknown>({
      host: "127.0.0.1",
      port: address.port,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
      handshakeSigner: () => handshake,
    });

    await client.connect();
    const result = await connectionReady;

    // Verify policy was derived
    expect(result.policy).toBeDefined();
    expect(result.policy?.mode).toMatch(
      /^(trust-zero|trust-light|immune|paranoia)$/,
    );
    expect(result.policy?.batchSize).toBeGreaterThan(0);
    expect(result.policy?.trustLevel).toBeGreaterThanOrEqual(0);
    expect(result.policy?.trustLevel).toBeLessThanOrEqual(1);

    // Verify entropy metrics were computed
    expect(result.entropyMetrics).toBeDefined();
    expect(result.entropyMetrics?.coherence).toMatch(
      /^(high|medium|low|chaos)$/,
    );

    client.disconnect();
    await server.close();
  });

  it("correctly categorizes high-trust peers (nIndex >= 0.85)", async () => {
    // Mock a high-trust handshake by manipulating the payload
    const server = new QWormholeServer<unknown>({
      host: "127.0.0.1",
      port: 0,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
    });

    const connectionReady = new Promise<{
      policy?: { mode: string; batchSize: number };
    }>(resolve => {
      server.once("connection", client => {
        const timer = setInterval(() => {
          if (!client.handshakePending && client.handshake) {
            clearInterval(timer);
            resolve({ policy: client.handshake.policy });
          }
        }, 5);
      });
    });

    const address = await server.listen();

    const client = new QWormholeClient<unknown>({
      host: "127.0.0.1",
      port: address.port,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
      handshakeSigner: () => ({
        type: "handshake",
        version: "1.0.0",
        nIndex: 0.9, // High trust
        entropyMetrics: {
          entropy: 0.8,
          entropyVelocity: "low",
          coherence: "high",
          negIndex: 0.9,
        },
      }),
    });

    await client.connect();
    const result = await connectionReady;

    expect(result.policy?.mode).toBe("trust-zero");
    expect(result.policy?.batchSize).toBe(64);

    client.disconnect();
    await server.close();
  });

  it("correctly categorizes low-trust peers (nIndex < 0.40)", async () => {
    const server = new QWormholeServer<unknown>({
      host: "127.0.0.1",
      port: 0,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
    });

    const connectionReady = new Promise<{
      policy?: { mode: string; batchSize: number };
    }>(resolve => {
      server.once("connection", client => {
        const timer = setInterval(() => {
          if (!client.handshakePending && client.handshake) {
            clearInterval(timer);
            resolve({ policy: client.handshake.policy });
          }
        }, 5);
      });
    });

    const address = await server.listen();

    const client = new QWormholeClient<unknown>({
      host: "127.0.0.1",
      port: address.port,
      protocolVersion: "1.0.0",
      framing: "length-prefixed",
      deserializer: jsonDeserializer,
      handshakeSigner: () => ({
        type: "handshake",
        version: "1.0.0",
        nIndex: 0.2, // Low trust / chaotic
        entropyMetrics: {
          entropy: 6.4,
          entropyVelocity: "spiking",
          coherence: "chaos",
          negIndex: 0.2,
        },
      }),
    });

    await client.connect();
    const result = await connectionReady;

    expect(result.policy?.mode).toBe("paranoia");
    expect(result.policy?.batchSize).toBe(1);

    client.disconnect();
    await server.close();
  });
});
