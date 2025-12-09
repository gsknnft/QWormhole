import { KcpServer } from "../../src/transports/kcp/kcp-server";
import { KcpSession } from "../../src/transports/kcp/kcp-session";
import { MuxSession } from "../../src/core/mux/mux-session";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function main() {
  const listenPort = 9999;
  const server = new KcpServer({ listenPort, conv: 1 });

  server.on("session", ({ key, mux }) => {
    console.log("[SERVER] session", key);
    mux.on("stream", stream => {
      stream.on("data", data => {
        console.log("[SERVER] got:", decoder.decode(data));
        stream.write(encoder.encode("pong"));
      });
    });
  });

  server.start();

  const client = new KcpSession({ address: "127.0.0.1", port: listenPort }, { conv: 1 });
  await client.connect();
  const mux = new MuxSession(buf => client.send(buf));
  client.on("data", buf => mux.receiveRaw(buf));

  const stream = mux.createStream();
  stream.on("data", data => {
    console.log("[CLIENT] got:", decoder.decode(data));
    client.close();
    server.stop();
  });
  stream.write(encoder.encode("ping"));
}

void main().catch(err => {
  console.error(err);
  process.exit(1);
});
