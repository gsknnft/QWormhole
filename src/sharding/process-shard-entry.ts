import { createRequire } from "node:module";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Payload } from "../types/types";
import type { QWormholeServer as QWormholeServerType } from "../server";
import type {
  WorkerShardSerializableServerOptions,
} from "./worker-sharded-server";

const require_ = createRequire(
  path.join(process.cwd(), "src", "sharding", "process-shard-entry.ts"),
);
const { QWormholeServer } = require_("../server") as typeof import("../server");

type WorkerShardBootstrap = {
  options: WorkerShardSerializableServerOptions;
  shardIndex: number;
  shardCount: number;
  telemetryIntervalMs: number;
};

type WorkerShardStats = {
  processId: number;
  listening: boolean;
  address?: AddressInfo;
  connections: number;
  messagesIn: number;
  bytesIn: number;
  errors: number;
};

type WorkerShardCommand =
  | { type: "bootstrap"; payload: WorkerShardBootstrap }
  | { type: "broadcast"; payload: Payload }
  | { type: "shutdown"; gracefulMs: number };

const estimatePayloadBytes = (payload: unknown): number => {
  if (Buffer.isBuffer(payload)) return payload.length;
  if (payload instanceof Uint8Array) return payload.byteLength;
  if (typeof payload === "string") return Buffer.byteLength(payload);
  if (payload && typeof payload === "object") {
    return Buffer.byteLength(JSON.stringify(payload));
  }
  return Buffer.byteLength(String(payload ?? ""));
};

if (typeof process.send !== "function") {
  throw new Error("process shard entry requires IPC");
}

let server: QWormholeServerType<Buffer> | null = null;
let telemetryTimer: NodeJS.Timeout | null = null;
let shardIndex = -1;

const stats: WorkerShardStats = {
  processId: process.pid,
  listening: false,
  connections: 0,
  messagesIn: 0,
  bytesIn: 0,
  errors: 0,
};

const postMessage = (message: unknown): void => {
  process.send?.(message);
};

const attachServer = (bootstrap: WorkerShardBootstrap) => {
  shardIndex = bootstrap.shardIndex;
  server = new QWormholeServer<Buffer>({
    ...bootstrap.options,
    reusePort: bootstrap.options.reusePort ?? true,
  });

  server.on("connection", () => {
    stats.connections = server?.getConnectionCount() ?? 0;
  });

  server.on("clientClosed", () => {
    stats.connections = server?.getConnectionCount() ?? 0;
  });

  server.on("message", ({ data }) => {
    stats.messagesIn += 1;
    stats.bytesIn += estimatePayloadBytes(data);
  });

  server.on("error", error => {
    stats.errors += 1;
    postMessage({
      type: "error",
      shardIndex,
      error: error.message,
    });
  });

  telemetryTimer = setInterval(() => {
    postMessage({
      type: "telemetry",
      shardIndex,
      stats,
    });
  }, bootstrap.telemetryIntervalMs);

  telemetryTimer.unref?.();
};

const shutdown = async (gracefulMs: number) => {
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
  if (server) {
    await server.shutdown(gracefulMs);
    server = null;
  }
  postMessage({
    type: "shutdown-complete",
    shardIndex,
  });
  process.disconnect?.();
};

process.on("message", async (message: WorkerShardCommand) => {
  if (message.type === "bootstrap") {
    try {
      attachServer(message.payload);
      const address = await server!.listen();
      stats.listening = true;
      stats.address = address;
      postMessage({
        type: "ready",
        shardIndex,
        processId: process.pid,
        address,
      });
    } catch (error) {
      postMessage({
        type: "error",
        shardIndex: message.payload.shardIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      process.disconnect?.();
      process.exitCode = 1;
    }
    return;
  }

  if (message.type === "broadcast") {
    server?.broadcast(message.payload);
    return;
  }

  if (message.type === "shutdown") {
    await shutdown(message.gracefulMs);
  }
});
