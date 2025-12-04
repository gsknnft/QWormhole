import { performance } from "node:perf_hooks";
import {
  QWormholeClient,
  NativeTcpClient,
  createQWormholeServer,
  isNativeAvailable,
} from "../src/index";
import { isNativeServerAvailable } from "../src/native-server";
import type {
  FramingMode,
  NativeBackend,
  Payload,
  QWormholeServerOptions,
  Serializer,
} from "../src/types/types";

type Mode = "ts" | "native-lws" | "native-libsocket";

const MODES: Mode[] = ["ts", "native-lws", "native-libsocket"];
function parseModeArg(): Mode[] {
  const arg = process.argv.find(a => a.startsWith("--mode="));
  if (!arg) return MODES;
  const val = arg.split("=")[1];
  if (val === "all") return MODES;
  if (MODES.includes(val as Mode)) return [val as Mode];
  return MODES;
}

const PAYLOAD = Buffer.alloc(1024, 1);
const TOTAL_MESSAGES = 10_000;
const TIMEOUT_MS = 5000;
const BENCH_FRAMING: FramingMode =
  process.env.QWORMHOLE_BENCH_FRAMING === "none" ? "none" : "length-prefixed";
const FRAME_HEADER_BYTES = 4;

const encodeLengthPrefixed = (payload: Buffer): Buffer => {
  const framed = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
  framed.writeUInt32BE(payload.length, 0);
  payload.copy(framed, FRAME_HEADER_BYTES);
  return framed;
};

const NATIVE_CLIENT_PAYLOAD =
  BENCH_FRAMING === "length-prefixed" ? encodeLengthPrefixed(PAYLOAD) : PAYLOAD;

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

interface Scenario {
  id: string;
  preferNativeServer: boolean;
  clientMode: Mode;
  serverBackend?: NativeBackend;
}

const serverBackends: NativeBackend[] = [];
if (isNativeServerAvailable("lws")) {
  serverBackends.push("lws");
}
if (isNativeServerAvailable("libsocket")) {
  serverBackends.push("libsocket");
}

const scenarios: Scenario[] = [];
for (const preferNativeServer of [false, true]) {
  const serverTargets = preferNativeServer
    ? serverBackends.length
      ? serverBackends
      : [undefined]
    : [undefined];
  for (const backend of serverTargets) {
    for (const mode of MODES) {
      const serverLabel = preferNativeServer
        ? backend
          ? `native-server(${backend})`
          : "native-server"
        : "ts-server";
      scenarios.push({
        id: `${serverLabel}+${mode}`,
        preferNativeServer,
        clientMode: mode,
        serverBackend: backend,
      });
    }
  }
}

const toBytes: Serializer = (payload: Payload): Buffer => {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (typeof payload === "string") return Buffer.from(payload);
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (typeof payload === "object" && payload !== null) {
    return Buffer.from(JSON.stringify(payload));
  }
  return Buffer.from(String(payload ?? ""));
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const clientModeAvailable = (mode: Mode): boolean => {
  if (mode === "ts") return true;
  if (mode === "native-lws") return availableLws && isNativeAvailable();
  return availableLibsocket && isNativeAvailable();
};

const serverModeAvailable = (
  preferNative: boolean,
  backend?: NativeBackend,
): boolean => {
  if (!preferNative) return true;
  return isNativeServerAvailable(backend);
};

type ScenarioResult = {
  id: string;
  serverMode: Mode;
  clientMode: Mode;
  preferredServerBackend?: NativeBackend;
  durationMs: number;
  messagesReceived: number;
  bytesReceived: number;
  framing: FramingMode;
  skipped?: boolean;
  reason?: string;
  msgsPerSec?: number;
  mbPerSec?: number;
};

async function waitForCompletion(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

async function runScenario({
  id,
  preferNativeServer,
  clientMode,
  serverBackend,
}: Scenario): Promise<ScenarioResult> {
  if (!clientModeAvailable(clientMode)) {
    return {
      id,
      clientMode,
      serverMode: preferNativeServer ? "native-lws" : "ts",
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: BENCH_FRAMING,
      skipped: true,
      reason: "Native client backend unavailable",
    };
  }

  if (!serverModeAvailable(preferNativeServer, serverBackend)) {
    return {
      id,
      clientMode,
      serverMode: "ts",
      preferredServerBackend: serverBackend,
      durationMs: 0,
      messagesReceived: 0,
      bytesReceived: 0,
      framing: BENCH_FRAMING,
      skipped: true,
      reason: serverBackend
        ? `Native server backend ${serverBackend} unavailable`
        : "Native server backend unavailable",
    };
  }

  type BenchServerOptions = QWormholeServerOptions<Buffer> & {
    preferNative?: boolean;
    preferredNativeBackend?: NativeBackend;
  };
  const serverResult = createQWormholeServer({
    host: "127.0.0.1",
    port: 0,
    framing: BENCH_FRAMING,
    serializer: toBytes,
    deserializer: (data: Buffer) => data as Buffer,
    preferNative: preferNativeServer,
    preferredNativeBackend: serverBackend,
  } as BenchServerOptions);
  const serverMode = serverResult.mode;
  const serverInstance = serverResult.server;

  const address = await serverInstance.listen();
  const port = address.port;

  let tsClient: QWormholeClient<Buffer> | null = null;
  let nativeClient: NativeTcpClient | null = null;
  if (clientMode === "ts") {
    tsClient = new QWormholeClient<Buffer>({
      host: "127.0.0.1",
      port,
      framing: BENCH_FRAMING,
      serializer: toBytes,
      deserializer: (data: Buffer) => data,
    });
    await tsClient.connect();
  } else {
    const backend = clientMode === "native-lws" ? "lws" : "libsocket";
    nativeClient = new NativeTcpClient(backend);
    nativeClient.connect("127.0.0.1", port);
  }

  let messagesReceived = 0;
  let bytesReceived = 0;
  const onMessage = ({ data }: { data: Buffer }) => {
    const buffer = Buffer.isBuffer(data) ? data : toBytes(data);
    messagesReceived += 1;
    bytesReceived += buffer.length;
  };
  serverInstance.on("message", onMessage as never);

  const start = performance.now();
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    if (tsClient) {
      tsClient.send(PAYLOAD);
    } else if (nativeClient) {
      nativeClient.send(NATIVE_CLIENT_PAYLOAD);
    }
  }

  await waitForCompletion(() => messagesReceived >= TOTAL_MESSAGES, TIMEOUT_MS);
  const duration = performance.now() - start;

  serverInstance.off("message", onMessage as never);

  if (tsClient) {
    tsClient.disconnect();
  }
  if (nativeClient) {
    nativeClient.close();
  }
  await serverInstance.close();

  const seconds = duration / 1000;
  const msgsPerSec =
    seconds > 0 && messagesReceived > 0
      ? messagesReceived / seconds
      : undefined;
  const mbPerSec =
    seconds > 0 && bytesReceived > 0
      ? bytesReceived / seconds / (1024 * 1024)
      : undefined;

  return {
    id,
    serverMode: serverMode as Mode,
    clientMode,
    preferredServerBackend: serverBackend,
    durationMs: duration,
    messagesReceived,
    bytesReceived,
    framing: BENCH_FRAMING,
    msgsPerSec,
    mbPerSec,
  };
}

async function main() {
  const modes = parseModeArg();
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (!modes.includes(scenario.clientMode)) continue;
    const res = await runScenario(scenario);
    results.push(res);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results, null, 2));

  const pad = (s: string, n: number) => s.toString().padEnd(n);
  const header = `${pad("Scenario", 28)}${pad("Server", 15)}${pad("Client", 15)}${pad(
    "Duration (ms)",
    16,
  )}${pad("Messages", 12)}${pad("Bytes", 12)}${pad("Msg/s", 12)}${pad(
    "MB/s",
    12,
  )}${pad("Framing", 12)}${pad("Status", 10)}`;
  console.log("\n" + header);
  console.log("-".repeat(header.length));
  for (const res of results) {
    console.log(
      `${pad(res.id, 28)}${pad(res.serverMode, 15)}${pad(res.clientMode, 15)}${pad(
        res.durationMs ? res.durationMs.toFixed(2) : "-",
        16,
      )}${pad(`${res.messagesReceived ?? "-"}`, 12)}${pad(
        `${res.bytesReceived ?? "-"}`,
        12,
      )}${pad(
        res.msgsPerSec && Number.isFinite(res.msgsPerSec)
          ? res.msgsPerSec.toFixed(0)
          : "-",
        12,
      )}${pad(
        res.mbPerSec && Number.isFinite(res.mbPerSec)
          ? res.mbPerSec.toFixed(2)
          : "-",
        12,
      )}${pad(res.framing, 12)}${pad(res.skipped ? "skipped" : "ok", 10)}`,
    );
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
