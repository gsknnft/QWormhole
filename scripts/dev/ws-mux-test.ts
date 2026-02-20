import { WSTransport, WSTransportServer } from "../../src/transports/ws/ws-transport";
import { MuxSession } from "../../src/transports/mux/mux-session";
import { attachTransportDiagnostics } from "../../src/transports/diagnostics";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
interface Stream {
  on(event: "data", listener: (data: Uint8Array) => void): void;
  write(data: Uint8Array): void;
}
export async function mainWs() {
  const port = 8787;
  const server = new WSTransportServer(port);
  console.log("[SERVER] session", JSON.stringify(server, null, 2));

  server.on("connection", transport => {
    const mux = new MuxSession(buf => transport.send(buf));
    console.log("[MUX] session", JSON.stringify(mux, null, 2));
    transport.on("data", (data: Uint8Array) => mux.receiveRaw(data));
    mux.on("stream", (stream: Stream) => {
      stream.on("data", (data: Uint8Array) => {
        console.log("[WS SERVER] recv:", decoder.decode(data));
        stream.write(encoder.encode("pong"));
      });
    });
  });
  server.start();

  const client = new WSTransport(`ws://127.0.0.1:${port}`);
  await client.connect();
  attachTransportDiagnostics(client);
  const mux = new MuxSession(buf => client.send(buf));
  client.on("data", (data: Uint8Array) => mux.receiveRaw(data));
  const stream = mux.createStream();
  stream.on("data", (data: Uint8Array) => {
    console.log("[WS CLIENT] recv:", decoder.decode(data));
    client.close();
    server.stop();
  });
  stream.write(encoder.encode("ping"));
}

void mainWs().catch(err => {
  console.error(err);
  process.exit(1);
});
