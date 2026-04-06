import {
  QWormholeClient,
  QWormholeServer,
  textDeserializer,
  textSerializer,
} from "../../src";
import { NativeSocketAdapter } from "../../src/core/native-socket";

const WAIT_MS = Number(process.env.QWORMHOLE_SECURE_SMOKE_WAIT_MS ?? "5000");
const HOST = process.env.QWORMHOLE_SECURE_SMOKE_HOST ?? "127.0.0.1";
const PAYLOAD = process.env.QWORMHOLE_SECURE_SMOKE_PAYLOAD ?? "secure-native-lws-smoke";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await sleep(25);
  }
};

const main = async () => {
  const events: string[] = [];

  const server = new QWormholeServer<string>({
    host: HOST,
    port: 0,
    framing: "length-prefixed",
    serializer: textSerializer,
    deserializer: textDeserializer,
  });

  server.on("error", err => {
    events.push(`server:error:${err.message}`);
    console.error("[secure-native-smoke] server error", err);
  });
  server.on("connection", client => {
    const tags = client.handshake?.tags ?? {};
    events.push(`server:connection:${JSON.stringify(tags)}`);
  });
  server.on("message", async ({ client, data }) => {
    events.push(`server:message:${data}`);
    await client.send(`echo:${data}`);
  });

  const address = await server.listen();

  let reply: string | null = null;
  const client = new QWormholeClient<string>({
    host: HOST,
    port: address.port,
    framing: "length-prefixed",
    serializer: textSerializer,
    deserializer: textDeserializer,
    handshakeTags: {
      service: "secure-native-smoke",
      origin: "secure-native-lws-smoke",
    },
    socketFactory: socketOpts =>
      new NativeSocketAdapter({
        ...socketOpts,
        preferredBackend: "lws",
      }),
  });

  client.on("connect", () => {
    events.push("client:connect");
  });
  client.on("ready", () => {
    events.push("client:ready");
  });
  client.on("close", evt => {
    events.push(`client:close:${evt.hadError ? "error" : "clean"}`);
  });
  client.on("error", err => {
    events.push(`client:error:${err.message}`);
    console.error("[secure-native-smoke] client error", err);
  });
  client.on("message", msg => {
    reply = msg;
    events.push(`client:message:${msg}`);
  });

  try {
    await client.connect();
    await client.send(PAYLOAD);
    await waitFor(() => reply !== null, WAIT_MS, "secure native echo reply");

    console.log(
      JSON.stringify(
        {
          ok: true,
          host: HOST,
          port: address.port,
          payload: PAYLOAD,
          reply,
          events,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.disconnect().catch(() => void 0);
    await server.close().catch(() => void 0);
  }
};

main().catch(err => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
