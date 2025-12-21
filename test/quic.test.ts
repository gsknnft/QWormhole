import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QuicTransport, QuicServer, quicAvailable, loadQuicBinding } from "../src/transports/quic";

// Hint loader to the local built native binary.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidate = path.resolve(__dirname, "..", "dist", "native", "qwquic.node");
process.env.QW_QUIC_PATH = process.env.QW_QUIC_PATH || candidate;
process.env.QW_QUIC_DEBUG = "1";
const certPath = path.resolve(__dirname, "..", "libwebsockets", "build", "libwebsockets-test-server.pem");
const keyPath = path.resolve(__dirname, "..", "libwebsockets", "build", "libwebsockets-test-server.key.pem");
const defaultAlpn = ["h3"];

const binding = loadQuicBinding();
const skip = !binding || !QuicServer.isAvailable();
if (skip) {
  console.warn("QUIC test skipped: binding unavailable or QuicServer unavailable", { bindingLoaded: !!binding });
}
describe.skipIf(skip)("QUIC smoke", () => {
  let server: QuicServer;
  let client: QuicTransport;

  beforeAll(async () => {
    server = new QuicServer({
      host: "127.0.0.1",
      port: 0,
      certPath,
      keyPath,
      alpn: defaultAlpn,
    });
    // Server echo handler
    server.on("connection", conn => {
      conn.onData((data: Uint8Array) => {
        conn.send(data);
      });
    });
    await server.listen();
  });

  afterAll(async () => {
    await client?.close?.();
    server?.close();
  });

  it("echoes over default stream", async () => {
    const port = server.port;
    expect(port).toBeGreaterThan(0);

    client = new QuicTransport({
      host: "127.0.0.1",
      port: port!,
      alpn: defaultAlpn,
      sni: "localhost",
      verifyPeer: false,
    });

    const connected = new Promise<void>(resolve => {
      server.once("connection", () => resolve());
    });

    await client.connect();
    await connected;
    await new Promise(r => setTimeout(r, 50));

    await new Promise<void>((resolve, reject) => {
      client.on("error", reject);
      client.onData(chunk => {
        expect(Buffer.from(chunk).toString()).toBe("hello");
        resolve();
      });
      const sendWithRetry = (attempts: number) => {
        try {
          client.send(Buffer.from("hello"));
        } catch (err) {
          if (attempts > 0) {
            setTimeout(() => sendWithRetry(attempts - 1), 50);
          } else {
            reject(err);
          }
        }
      };
      sendWithRetry(5);
    });
  });
});
