/**
 * Lightweight writev bench for the TS transport.
 *
 * Sends frames through a TS server/client loop, measures p50/p99 latency,
 * and surfaces batch utilisation plus dropped frames.
 */

import { performance } from "node:perf_hooks";
import { QWormholeClient, createQWormholeServer } from "../src";
import type { BatchFramer } from "../src/batch-framer";
import path from "node:path";

type NumberFlag = {
  name: string;
  env: string;
  defaultValue: number;
};

const numberFlag = ({ name, env, defaultValue }: NumberFlag): number => {
  const cli = process.argv
    .find(arg => arg.startsWith(`--${name}=`))
    ?.split("=")[1];
  const raw = cli ?? process.env[env];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const stringFlag = (name: string, env: string): string | undefined => {
  const cliArg = process.argv.find(arg => arg.startsWith(`--${name}`));
  if (!cliArg) return process.env[env];
  if (cliArg.includes("=")) return cliArg.split("=")[1];
  // If --csv is present with no value, use a sensible default
  if (cliArg === `--${name}`) return path.join(__dirname, "../data/bench-writev.csv");
  return process.env[env];
};

const TOTAL_FRAMES = numberFlag({
  name: "frames",
  env: "QW_WRITEV_FRAMES",
  defaultValue: 10_000,
});
const PAYLOAD_BYTES = numberFlag({
  name: "payload",
  env: "QW_WRITEV_PAYLOAD",
  defaultValue: 1024,
});
const TIMEOUT_MS = numberFlag({
  name: "timeout",
  env: "QW_WRITEV_TIMEOUT",
  defaultValue: 10_000,
});
const BATCH_SIZE = numberFlag({
  name: "batch",
  env: "QW_WRITEV_BATCH",
  defaultValue: 64,
});
const FLUSH_INTERVAL_MS = numberFlag({
  name: "flushMs",
  env: "QW_WRITEV_FLUSH_MS",
  defaultValue: 1,
});
const CSV_PATH = stringFlag("csv", "QW_WRITEV_CSV");

type FlushSamples = {
  buffers: number[];
  bytes: number[];
  backpressureEvents: number;
};

const buildPayload = (): Buffer => Buffer.alloc(PAYLOAD_BYTES, 7);

const quantile = (samples: number[], q: number): number => {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const mean = (samples: number[]): number =>
  samples.length
    ? samples.reduce((acc, value) => acc + value, 0) / samples.length
    : 0;

const attachFlushObservers = (
  framer: BatchFramer | undefined,
  target: FlushSamples,
): void => {
  if (!framer) return;
  framer.on("flush", ({ bufferCount, totalBytes }) => {
    target.buffers.push(bufferCount);
    target.bytes.push(totalBytes);
  });
  framer.on("backpressure", () => {
    target.backpressureEvents += 1;
  });
};

const tuneFramer = (framer: BatchFramer | undefined): void => {
  if (!framer) return;
  const mutable = framer as unknown as {
    batchSize?: number;
    flushIntervalMs?: number;
  };
  mutable.batchSize = BATCH_SIZE;
  mutable.flushIntervalMs = FLUSH_INTERVAL_MS;
};

const formatCsvRow = (row: Record<string, number | string>): string => {
  const header = Object.keys(row).join(",");
  const values = Object.values(row)
    .map(value => (typeof value === "string" ? JSON.stringify(value) : value))
    .join(",");
  return `${header}\n${values}\n`;
};

async function main(): Promise<void> {
  const payload = buildPayload();
  const pending = new Map<number, bigint>();
  const durationsMs: number[] = [];

  const clientFlush: FlushSamples = {
    buffers: [],
    bytes: [],
    backpressureEvents: 0,
  };
  const serverFlush: FlushSamples = {
    buffers: [],
    bytes: [],
    backpressureEvents: 0,
  };

  const { server } = createQWormholeServer<Buffer>({
    host: "127.0.0.1",
    port: 0,
    framing: "length-prefixed",
  });

  const serverFramerAttached = new Set<string>();
  server.on("message", ({ client, data }: { client: any; data: Buffer }) => {
    const framer = (client as unknown as { outboundFramer?: BatchFramer })
      .outboundFramer;
    if (framer && !serverFramerAttached.has(client.id)) {
      tuneFramer(framer);
      attachFlushObservers(framer, serverFlush);
      serverFramerAttached.add(client.id);
    }
    client.send(data);
  });

  const client = new QWormholeClient<Buffer>({
    host: "127.0.0.1",
    port: (await server.listen()).port,
    framing: "length-prefixed",
    entropyMetrics: { negIndex: 0.9 }, // bias towards macro batching
  });

  const clientFramer = (client as unknown as { outboundFramer?: BatchFramer })
    .outboundFramer;
  attachFlushObservers(clientFramer, clientFlush);
  tuneFramer(clientFramer);

  let received = 0;
  let dropped = 0;
  let benchFinished = false;

  try {
    await client.connect();

    const completion = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        dropped = TOTAL_FRAMES - durationsMs.length;
        benchFinished = true;
        reject(
          new Error(
            `Timeout waiting for frames (${TOTAL_FRAMES - durationsMs.length} outstanding)`,
          ),
        );
      }, TIMEOUT_MS);

      client.on("message", data => {
        if (benchFinished) return;
        const seq = data.readUInt32BE(0);
        const started = pending.get(seq);
        if (!started) {
          return;
        }
        pending.delete(seq);
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        durationsMs.push(elapsedMs);
        received += 1;
        if (received >= TOTAL_FRAMES) {
          benchFinished = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      client.on("close", ({ hadError }) => {
        if (benchFinished) return;
        benchFinished = true;
        clearTimeout(timeout);
        reject(
          new Error(
            hadError
              ? "Client closed with error before receiving all frames"
              : "Client closed before benchmark completed",
          ),
        );
      });
    });

    const wallStart = performance.now();

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const frame = Buffer.allocUnsafe(4 + payload.length);
      frame.writeUInt32BE(i, 0);
      payload.copy(frame, 4);
      pending.set(i, process.hrtime.bigint());
      void client.send(frame);
    }

    try {
      await completion;
    } catch (err) {
      // Swallow timeout for reporting; still print metrics below.
      console.warn(String(err));
    }

    const wallDurationMs = performance.now() - wallStart;
    const p50 = quantile(durationsMs, 0.5);
    const p99 = quantile(durationsMs, 0.99);
    const maxMs = durationsMs.length ? Math.max(...durationsMs) : Number.NaN;

    const clientFlushCount = clientFlush.buffers.length;
    const serverFlushCount = serverFlush.buffers.length;

    const formatFlush = (label: string, samples: FlushSamples) => {
      if (!samples.buffers.length) {
        console.log(`[${label}] no flush samples captured`);
        return;
      }
      const avgBuffers = mean(samples.buffers);
      const avgBytes = mean(samples.bytes);
      const maxBuffers = Math.max(...samples.buffers);
      const maxBytes = Math.max(...samples.bytes);
      console.log(
        `[${label}] flushes=${samples.buffers.length}, avgBuffers=${avgBuffers.toFixed(1)}, maxBuffers=${maxBuffers}, avgBytes=${(avgBytes / 1024).toFixed(1)} KiB, maxBytes=${(maxBytes / 1024).toFixed(1)} KiB, backpressure=${samples.backpressureEvents}`,
      );
    };

    dropped = TOTAL_FRAMES - durationsMs.length;

    console.log("=== qwormhole ts/writev bench ===");
    console.log(
      `frames=${TOTAL_FRAMES}, payload=${PAYLOAD_BYTES} bytes, timeout=${TIMEOUT_MS} ms`,
    );
    console.log(
      `batchSize=${BATCH_SIZE}, flushIntervalMs=${FLUSH_INTERVAL_MS}`,
    );
    console.log(
      `latency: p50=${p50.toFixed(2)} ms, p99=${p99.toFixed(
        2,
      )} ms, max=${maxMs.toFixed(2)} ms`,
    );
    console.log(
      `throughput: ${(TOTAL_FRAMES / (wallDurationMs / 1000)).toFixed(0)} msg/s over ${wallDurationMs.toFixed(2)} ms`,
    );
    console.log(
      `delivery: received=${durationsMs.length}, dropped=${dropped}, outstanding=${pending.size}`,
    );
    formatFlush("client->wire", clientFlush);
    formatFlush("server->client", serverFlush);
    console.log(
      `flush totals: client=${clientFlushCount}, server=${serverFlushCount}`,
    );

    if (CSV_PATH !== undefined) {
      const row = {
        frames: TOTAL_FRAMES,
        payloadBytes: PAYLOAD_BYTES,
        timeoutMs: TIMEOUT_MS,
        batchSize: BATCH_SIZE,
        flushIntervalMs: FLUSH_INTERVAL_MS,
        p50Ms: Number(p50.toFixed(3)),
        p99Ms: Number(p99.toFixed(3)),
        maxMs: Number(maxMs.toFixed(3)),
        throughputMsgSec: Number(
          (TOTAL_FRAMES / (wallDurationMs / 1000)).toFixed(3),
        ),
        received: durationsMs.length,
        dropped,
        outstanding: pending.size,
        clientFlushes: clientFlushCount,
        clientAvgBuffers: Number(mean(clientFlush.buffers).toFixed(3)),
        clientMaxBuffers: Math.max(...clientFlush.buffers, 0),
        clientAvgBytes: Number(mean(clientFlush.bytes).toFixed(3)),
        clientMaxBytes: Math.max(...clientFlush.bytes, 0),
        clientBackpressure: clientFlush.backpressureEvents,
        serverFlushes: serverFlushCount,
        serverAvgBuffers: Number(mean(serverFlush.buffers).toFixed(3)),
        serverMaxBuffers: Math.max(...serverFlush.buffers, 0),
        serverAvgBytes: Number(mean(serverFlush.bytes).toFixed(3)),
        serverMaxBytes: Math.max(...serverFlush.bytes, 0),
        serverBackpressure: serverFlush.backpressureEvents,
      };
      const csv = formatCsvRow(row);
      if (CSV_PATH) {
        await import("node:fs/promises").then(fs =>
          fs.writeFile(CSV_PATH, csv, "utf8"),
        );
        console.log(`csv written to ${CSV_PATH}`);
      } else {
        console.error(
          "No CSV path provided. Please use --csv=/path/to/file.csv so plot_bench.py can use it.",
        );
      }
    }
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    try {
      await server.close();
    } catch {
      // ignore
    }
  }
}

void main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
