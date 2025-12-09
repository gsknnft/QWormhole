import { WSTransport, WSTransportServer } from "../../src/transports/ws/ws-transport";
import { MuxSession } from "../../src/core/mux/mux-session";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function main() {
  const port = 8787;
  const server = new WSTransportServer(port);
  server.on("connection", transport => {
    const mux = new MuxSession(buf => transport.send(buf));
    transport.on("data", data => mux.receiveRaw(data));
    mux.on("stream", stream => {
      stream.on("data", data => {
        console.log("[WS SERVER] recv:", decoder.decode(data));
        stream.write(encoder.encode("pong"));
      });
    });
  });
  server.start();

  const client = new WSTransport(`ws://127.0.0.1:${port}`);
  await client.connect();
  const mux = new MuxSession(buf => client.send(buf));
  client.on("data", data => mux.receiveRaw(data));
  const stream = mux.createStream();
  stream.on("data", data => {
    console.log("[WS CLIENT] recv:", decoder.decode(data));
    client.close();
    server.stop();
  });
  stream.write(encoder.encode("ping"));
}

void main().catch(err => {
  console.error(err);
  process.exit(1);
});
