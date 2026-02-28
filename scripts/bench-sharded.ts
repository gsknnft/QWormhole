import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import {
  QWormholeClient,
  QWormholeServer,
  WorkerShardedServer,
  type WorkerShardedServerStats,
} from "../src/index";

type ShardScenarioResult = {
  id: string;
  workers: number;
  clients: number;
  messages: number;
  skipped?: boolean;
  reason?: string;
  durationMs: number;
  messagesReceived: number;
  bytesReceived: number;
  msgsPerSec: number;
  mbPerSec: number;
  workerStats?: WorkerShardedServerStats;
};

const TOTAL_MESSAGES = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_MESSAGES ?? "100000") || 100000,
);
const BENCH_CLIENTS = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_CLIENTS ?? "16") || 16,
);
const WARMUP_MESSAGES = Math.max(
  0,
  Number(process.env.QWORMHOLE_BENCH_WARMUP_MESSAGES ?? "5000") || 5000,
);
const SHARD_WORKERS = Math.max(
  1,
  Number(process.env.QWORMHOLE_BENCH_SHARD_WORKERS ?? "4") || 4,
);
const CONFIGURED_SHARD_PORT = Math.max(
  0,
  Number(process.env.QWORMHOLE_BENCH_SHARD_PORT ?? "0") || 0,
);
const TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.QWORMHOLE_BENCH_TIMEOUT_MS ?? "10000") || 10000,
);
const REPORT_PATH =
  process.env.QWORMHOLE_BENCH_REPORT ?? "data/sharded_core_diagnostics.md";
const JSONL_PATH =
  process.env.QWORMHOLE_BENCH_JSONL ?? "data/sharded_core_diagnostics.jsonl";

const PAYLOAD = Buffer.alloc(1024, 1);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const reserveBenchPort = async (): Promise<number> => {
  if (CONFIGURED_SHARD_PORT > 0) return CONFIGURED_SHARD_PORT;
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port =
    address && typeof address === "object" && "port" in address
      ? address.port
      : 0;
  await new Promise<void>((resolve, reject) => {
    server.close(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  if (!port) {
    throw new Error("failed to reserve a shard bench port");
  }
  return port;
};

const waitForCompletion = async (
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> => {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(10);
  }
  return predicate();
};

const connectClients = async (port: number) =>
  Promise.all(
    Array.from({ length: BENCH_CLIENTS }, async () => {
      const client = new QWormholeClient<Buffer>({
        host: "127.0.0.1",
        port,
        framing: "length-prefixed",
      });
      await client.connect();
      return client;
    }),
  );

const disconnectClients = async (clients: QWormholeClient<Buffer>[]) => {
  for (const client of clients) {
    client.disconnect();
  }
  await sleep(50);
};

const runSingleProcessTs = async (): Promise<ShardScenarioResult> => {
  const server = new QWormholeServer<Buffer>({
    host: "127.0.0.1",
    port: 0,
    framing: "length-prefixed",
  });

  let messagesReceived = 0;
  let bytesReceived = 0;
  server.on("message", ({ data }) => {
    messagesReceived += 1;
    bytesReceived += data.length;
  });

  const address = await server.listen();
  const clients = await connectClients(address.port);

  try {
    for (let i = 0; i < WARMUP_MESSAGES; i++) {
      await clients[i % clients.length].send(PAYLOAD);
    }
    await waitForCompletion(() => messagesReceived >= WARMUP_MESSAGES, TIMEOUT_MS);
    messagesReceived = 0;
    bytesReceived = 0;

    const start = performance.now();
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      await clients[i % clients.length].send(PAYLOAD);
    }
    const completed = await waitForCompletion(
      () => messagesReceived >= TOTAL_MESSAGES,
      TIMEOUT_MS,
    );
    const durationMs = performance.now() - start;
    if (!completed) {
      throw new Error(
        `single-process TS timed out (${messagesReceived}/${TOTAL_MESSAGES})`,
      );
    }
    return {
      id: "ts-server+ts",
      workers: 1,
      clients: BENCH_CLIENTS,
      messages: TOTAL_MESSAGES,
      durationMs,
      messagesReceived,
      bytesReceived,
      msgsPerSec: messagesReceived / (durationMs / 1000),
      mbPerSec: bytesReceived / (durationMs / 1000) / (1024 * 1024),
    };
  } finally {
    await disconnectClients(clients);
    await server.close();
  }
};

const runShardedTs = async (): Promise<ShardScenarioResult> => {
  let server: WorkerShardedServer | null = null;
  let clients: QWormholeClient<Buffer>[] = [];
  try {
    const shardPort = await reserveBenchPort();
    server = new WorkerShardedServer({
      host: "127.0.0.1",
      port: shardPort,
      framing: "length-prefixed",
      workers: SHARD_WORKERS,
      reusePort: true,
      telemetryIntervalMs: 25,
    });

    await server.listen();
    const stats = server.getStats();
    const port = stats.byWorker[0]?.address?.port;
    if (!port) {
      await server.shutdown();
      throw new Error("sharded server did not expose a bound port");
    }

    clients = await connectClients(port);

    for (let i = 0; i < WARMUP_MESSAGES; i++) {
      await clients[i % clients.length].send(PAYLOAD);
    }
    await waitForCompletion(
      () => server.getStats().messagesIn >= WARMUP_MESSAGES,
      TIMEOUT_MS,
    );

    const baselineStats = server.getStats();
    const baselineMessages = baselineStats.messagesIn;
    const baselineBytes = baselineStats.bytesIn;

    const start = performance.now();
    for (let i = 0; i < TOTAL_MESSAGES; i++) {
      await clients[i % clients.length].send(PAYLOAD);
    }
    const completed = await waitForCompletion(
      () => server.getStats().messagesIn - baselineMessages >= TOTAL_MESSAGES,
      TIMEOUT_MS,
    );
    const durationMs = performance.now() - start;
    const endStats = server.getStats();
    const messagesReceived = endStats.messagesIn - baselineMessages;
    const bytesReceived = endStats.bytesIn - baselineBytes;
    if (!completed) {
      throw new Error(
        `sharded TS timed out (${messagesReceived}/${TOTAL_MESSAGES})`,
      );
    }
    return {
      id: `sharded-ts-server+ts(${SHARD_WORKERS}w)`,
      workers: SHARD_WORKERS,
      clients: BENCH_CLIENTS,
      messages: TOTAL_MESSAGES,
      durationMs,
      messagesReceived,
      bytesReceived,
      msgsPerSec: messagesReceived / (durationMs / 1000),
      mbPerSec: bytesReceived / (durationMs / 1000) / (1024 * 1024),
      workerStats: endStats,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        id: `sharded-ts-server+ts(${SHARD_WORKERS}w)`,
        workers: SHARD_WORKERS,
        clients: BENCH_CLIENTS,
        messages: TOTAL_MESSAGES,
        skipped: true,
        reason: error.message,
        durationMs: 0,
        messagesReceived: 0,
        bytesReceived: 0,
        msgsPerSec: 0,
        mbPerSec: 0,
      };
    }
    throw error;
  } finally {
    if (clients.length > 0) {
      await disconnectClients(clients);
    }
    if (server) {
      await server.shutdown();
    }
  }
};

const writeReport = async (results: ShardScenarioResult[]) => {
  const summaryRows = results
    .map(
      result =>
        `| ${result.id} | ${result.workers} | ${result.clients} | ${result.messages} | ${result.durationMs.toFixed(2)} | ${result.messagesReceived} | ${result.bytesReceived} | ${result.msgsPerSec.toFixed(0)} | ${result.mbPerSec.toFixed(2)} | ${result.skipped ? `skipped: ${result.reason ?? "unknown"}` : "ok"} |`,
    )
    .join("\n");

  const workerSections = results
    .filter(result => result.workerStats)
    .map(result => {
      const rows = result.workerStats!.byWorker
        .map(
          worker =>
            `| ${worker.shardIndex} | ${worker.processId} | ${worker.listening ? "yes" : "no"} | ${worker.connections} | ${worker.messagesIn} | ${worker.bytesIn} | ${worker.errors} | ${worker.address?.port ?? "-"} |`,
        )
        .join("\n");
      return [
        `## ${result.id} Workers`,
        "",
        "| Shard | Process | Listening | Connections | Messages | Bytes | Errors | Port |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        rows,
        "",
      ].join("\n");
    })
    .join("\n");

  const report = [
    "# QWormhole Sharded Bench Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Environment",
    "",
    "```json",
    JSON.stringify(
      {
        QWORMHOLE_BENCH_MESSAGES: String(TOTAL_MESSAGES),
        QWORMHOLE_BENCH_CLIENTS: String(BENCH_CLIENTS),
        QWORMHOLE_BENCH_WARMUP_MESSAGES: String(WARMUP_MESSAGES),
        QWORMHOLE_BENCH_SHARD_WORKERS: String(SHARD_WORKERS),
      },
      null,
      2,
    ),
    "```",
    "",
    "## Summary",
    "",
    "| Scenario | Workers | Clients | Messages | Duration (ms) | Received | Bytes | Msg/s | MB/s | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    summaryRows,
    "",
    workerSections,
    "## Raw JSON",
    "",
    "```json",
    JSON.stringify(results, null, 2),
    "```",
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, report, "utf8");
  await fs.appendFile(
    JSONL_PATH,
    results.map(result => JSON.stringify(result)).join("\n") + "\n",
    "utf8",
  );
};

const main = async () => {
  const results = [await runSingleProcessTs(), await runShardedTs()];
  await writeReport(results);
  console.log(JSON.stringify(results, null, 2));
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
