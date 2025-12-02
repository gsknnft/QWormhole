import net from "node:net";
import { performance } from "node:perf_hooks";
import {
  QWormholeClient,
  isNativeAvailable,
  NativeTcpClient,
} from "../src/index";

const MODES: Mode[] = ["ts", "native-lws", "native-libsocket"];
function parseModeArg(): Mode[] {
  const arg = process.argv.find(a => a.startsWith("--mode="));
  if (!arg) return MODES;
  const val = arg.split("=")[1];
  if (val === "all") return MODES;
  if (MODES.includes(val as Mode)) return [val as Mode];
  return MODES;
}

const PAYLOAD = Buffer.alloc(1024, 1); // 1 KB
const TOTAL_MESSAGES = 10_000;
const TIMEOUT_MS = 5000;

type Mode = "ts" | "native-lws" | "native-libsocket";

const detectNativeBackend = (backend: "lws" | "libsocket") => {
  try {
    const client = new NativeTcpClient(backend);
    const ok = client.backend === backend;
    client.close();
    return ok;
  } catch {
    return false;
  }
};

const availableLws = detectNativeBackend("lws");
const availableLibsocket = detectNativeBackend("libsocket");

async function run(mode: Mode) {
  // Simple TCP server that counts raw bytes received.
  const server = net.createServer();
  let receivedBytes = 0;
  // let resolveDone: (() => void) | null = null;
  // const done = new Promise<void>(resolve => {
  //   resolveDone = resolve;
  // });

  server.on("connection", socket => {
    socket.on("data", chunk => {
      receivedBytes += chunk.length;
      if (receivedBytes >= PAYLOAD.length * TOTAL_MESSAGES) {
        server.close();
      }
    });
  });

  const address = await new Promise<net.AddressInfo>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const info = server.address();
      if (info && typeof info === "object") {
        resolve(info);
      } else {
        reject(new Error("Failed to bind server"));
      }
    });
  });

  const port = address.port;
  let tsClient: QWormholeClient<Buffer> | null = null;
  let nativeClient: NativeTcpClient | null = null;

  if (mode === "ts") {
    tsClient = new QWormholeClient<Buffer>({
      host: "127.0.0.1",
      port,
      framing: "none", // raw bytes for apples-to-apples comparison
    });
    await tsClient.connect();
  } else {
    const backend = mode === "native-lws" ? "lws" : "libsocket";
    nativeClient = new NativeTcpClient(backend);
    nativeClient.connect("127.0.0.1", port);
  }

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    if (tsClient) {
      tsClient.send(PAYLOAD);
    } else if (nativeClient) {
      nativeClient.send(PAYLOAD);
    }
  }

  const waitStart = performance.now();
  while (
    receivedBytes < PAYLOAD.length * TOTAL_MESSAGES &&
    performance.now() - waitStart < TIMEOUT_MS
  ) {
    await new Promise(r => setTimeout(r, 10));
  }
  const duration = performance.now() - start;

  if (tsClient) {
    tsClient.disconnect();
  }
  if (nativeClient) {
    nativeClient.close();
  }
  server.close();

  return {
    durationMs: duration,
    receivedBytes,
    messagesReceived: Math.floor(receivedBytes / PAYLOAD.length),
  };
}

async function main() {
  const modes = parseModeArg();
  const results: Record<string, any> = {};

  for (const mode of modes) {
    if (mode === "ts") {
      results["ts"] = await run("ts");
    } else if (mode === "native-lws" && isNativeAvailable() && availableLws) {
      results["native-lws"] = await run("native-lws");
    } else if (
      mode === "native-libsocket" &&
      isNativeAvailable() &&
      availableLibsocket
    ) {
      results["native-libsocket"] = await run("native-libsocket");
    }
  }

  // Print JSON
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));

  // Print summary table
  const pad = (s: string, n: number) => s.padEnd(n);
  const header = `${pad("Backend", 18)}${pad("Duration (ms)", 16)}${pad("Messages", 12)}${pad("Bytes", 12)}`;
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const mode of modes) {
    const r = results[mode];
    if (!r) continue;
    console.log(
      `${pad(mode, 18)}${pad(r.durationMs.toFixed(2), 16)}${pad(r.messagesReceived + "", 12)}${pad(r.receivedBytes + "", 12)}`,
    );
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
