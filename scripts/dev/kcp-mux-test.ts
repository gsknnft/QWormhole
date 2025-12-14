import { KcpServer } from "../../src/transports/kcp/kcp-server";
import { KcpSession } from "../../src/transports/kcp/kcp-session";
import { MuxSession } from "../../src/transports/mux/mux-session";
import { MuxStream } from "../../src/transports/mux/mux-stream";
import { attachTransportDiagnostics } from "../../src/transports/diagnostics";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function mainKCP() {
  const listenPort = 9999;
  const server = new KcpServer({ listenPort, conv: 1 });
  console.log("[SERVER] session", JSON.stringify(server, null, 2));

  server.on("session", ({ key, mux }) => {
    console.log("[SERVER] host:port", key);
    console.log("[MUX] session", JSON.stringify(mux, null, 2));
    mux.on("stream", (stream: MuxStream) => {
      stream.on("data", (data: Uint8Array) => {
        console.log("[SERVER] got:", decoder.decode(data));
        stream.write(encoder.encode("pong"));
      });
    });
  });

  server.start();

  const client = new KcpSession(
    { address: "127.0.0.1", port: listenPort },
    { conv: 1 },
  );
  await client.connect();
  attachTransportDiagnostics(client);
  const mux = new MuxSession(buf => client.send(buf));
  client.on("data", buf => mux.receiveRaw(buf));

  const stream = await mux.createStream();
  stream.on("data", (data: Uint8Array) => {
    console.log("[CLIENT] got:", decoder.decode(data));
    client.close();
    server.stop();
  });
  stream.write(encoder.encode("ping"));
}

void mainKCP().catch(err => {
  console.error(err);
  process.exit(1);
});
