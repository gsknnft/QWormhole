import { availableParallelism } from "node:os";
import cluster from "node:cluster";
import type { Worker as ClusterWorker } from "node:cluster";

import { createRequire } from "node:module";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Payload, QWormholeServerOptions } from "../types/types";

type UnsupportedWorkerServerOptionKeys =
  | "allowConnection"
  | "onAuthorizeConnection"
  | "verifyHandshake"
  | "onTelemetry"
  | "onTrustSnapshot"
  | "coherence"
  | "serializer"
  | "deserializer";

export type WorkerShardSerializableServerOptions = Omit<
  QWormholeServerOptions<Buffer>,
  UnsupportedWorkerServerOptionKeys
>;

export type WorkerShardStats = {
  shardIndex: number;
  processId: number;
  listening: boolean;
  address?: AddressInfo;
  connections: number;
  messagesIn: number;
  bytesIn: number;
  errors: number;
};

export type WorkerShardedServerStats = {
  workers: number;
  listening: boolean;
  connections: number;
  messagesIn: number;
  bytesIn: number;
  errors: number;
  byWorker: WorkerShardStats[];
};

export interface WorkerShardedServerOptions
  extends QWormholeServerOptions<Buffer> {
  workers?: number;
  telemetryIntervalMs?: number;
  startupTimeoutMs?: number;
  workerExecArgv?: string[];
  workerEnv?: NodeJS.ProcessEnv;
}

type WorkerShardBootstrap = {
  options: WorkerShardSerializableServerOptions;
  shardIndex: number;
  shardCount: number;
  telemetryIntervalMs: number;
};

type WorkerShardReady = {
  type: "ready";
  shardIndex: number;
  processId: number;
  address: AddressInfo;
};

type WorkerShardTelemetry = {
  type: "telemetry";
  shardIndex: number;
  stats: Omit<WorkerShardStats, "shardIndex">;
};

type WorkerShardError = {
  type: "error";
  shardIndex: number;
  error: string;
};

type WorkerShardShutdownComplete = {
  type: "shutdown-complete";
  shardIndex: number;
};

type WorkerShardMessage =
  | WorkerShardReady
  | WorkerShardTelemetry
  | WorkerShardError
  | WorkerShardShutdownComplete;

type WorkerShardCommand =
  | { type: "bootstrap"; payload: WorkerShardBootstrap }
  | { type: "broadcast"; payload: Payload }
  | { type: "shutdown"; gracefulMs: number };

const DEFAULT_TELEMETRY_INTERVAL_MS = 250;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;

const require_ = createRequire(
  path.join(process.cwd(), "src", "sharding", "worker-sharded-server.ts"),
);

const resolveProcessEntry = (): string => {
  const ext = path.extname(__filename) || ".js";
  return path.join(__dirname, `process-shard-entry${ext}`);
};

const resolveTsxCli = (): string =>
  path.join(path.dirname(require_.resolve("tsx/package.json")), "dist", "cli.mjs");

const defaultWorkerCount = () =>
  Math.max(1, (typeof availableParallelism === "function"
    ? availableParallelism()
    : 1) - 1);

const assertShardPlatformSupport = (
  workerCount: number,
  reusePort: boolean | undefined,
): void => {
  if (workerCount <= 1) return;
  if (!reusePort) {
    throw new Error(
      "WorkerShardedServer requires reusePort for multi-worker binding in this first pass",
    );
  }
  if (process.platform === "win32") {
    throw new Error(
      "WorkerShardedServer multi-worker shard bind is not supported on this Windows runtime. Use Linux for shard bind tests, or run the single-worker smoke locally.",
    );
  }
};

const assertSerializableOptions = (
  options: WorkerShardedServerOptions,
): WorkerShardSerializableServerOptions => {
  const blocked: Array<UnsupportedWorkerServerOptionKeys> = [];
  if (options.allowConnection) blocked.push("allowConnection");
  if (options.onAuthorizeConnection) blocked.push("onAuthorizeConnection");
  if (options.verifyHandshake) blocked.push("verifyHandshake");
  if (options.onTelemetry) blocked.push("onTelemetry");
  if (options.onTrustSnapshot) blocked.push("onTrustSnapshot");
  if (options.coherence) blocked.push("coherence");
  if (options.serializer) blocked.push("serializer");
  if (options.deserializer) blocked.push("deserializer");

  if (blocked.length > 0) {
    throw new Error(
      `WorkerShardedServer does not support non-serializable server options in this first pass: ${blocked.join(", ")}`,
    );
  }

  return {
    ...options,
    reusePort: options.reusePort ?? true,
  };
};

const onProcess = (
  worker: ClusterWorker,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    worker as unknown as {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).on(event, listener);
};

const offProcess = (
  worker: ClusterWorker,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    worker as unknown as {
      off: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).off(event, listener);
};

const onceProcess = (
  worker: ClusterWorker,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    worker as unknown as {
      once: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).once(event, listener);
};

export class WorkerShardedServer {
  private readonly options: WorkerShardedServerOptions;
  private readonly workerEntry = resolveProcessEntry();
  private readonly tsxCli = resolveTsxCli();
  private readonly shardStats = new Map<number, WorkerShardStats>();
  private readonly workers: ClusterWorker[] = [];
  private listening = false;

  constructor(options: WorkerShardedServerOptions) {
    if (!cluster.isPrimary) {
      throw new Error("WorkerShardedServer must be created on the primary process");
    }
    this.options = options;
  }

  async listen(): Promise<void> {
    if (this.listening) return;

    const workerCount = this.options.workers ?? defaultWorkerCount();
    const telemetryIntervalMs =
      this.options.telemetryIntervalMs ?? DEFAULT_TELEMETRY_INTERVAL_MS;
    const startupTimeoutMs =
      this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    const workerOptions = assertSerializableOptions(this.options);
    assertShardPlatformSupport(workerCount, workerOptions.reusePort);
    cluster.setupPrimary({
      exec: this.workerEntry,
      execArgv:
        (this.options.workerExecArgv ?? []).length > 0
          ? this.options.workerExecArgv
          : [this.tsxCli],
      silent: false,
    });

    const startupPromises = Array.from({ length: workerCount }, (_unused, index) =>
      this.spawnWorker(
        {
          options: workerOptions,
          shardIndex: index,
          shardCount: workerCount,
          telemetryIntervalMs,
        },
        startupTimeoutMs,
      ),
    );

    try {
      await Promise.all(startupPromises);
      this.listening = true;
    } catch (error) {
      await this.forceTerminateWorkers();
      if (
        error instanceof Error &&
        error.message.includes("EADDRINUSE") &&
        workerCount > 1
      ) {
        throw new Error(
          `WorkerShardedServer could not bind ${workerCount} workers to the same port on this runtime. reusePort same-port worker startup is not functioning here.`,
        );
      }
      throw error;
    }
  }

  broadcast(payload: Payload): void {
    for (const worker of this.workers) {
      worker.send?.({ type: "broadcast", payload } satisfies WorkerShardCommand);
    }
  }

  getStats(): WorkerShardedServerStats {
    const byWorker = [...this.shardStats.values()].sort(
      (a, b) => a.shardIndex - b.shardIndex,
    );
    return {
      workers: this.workers.length,
      listening: this.listening,
      connections: byWorker.reduce((sum, stat) => sum + stat.connections, 0),
      messagesIn: byWorker.reduce((sum, stat) => sum + stat.messagesIn, 0),
      bytesIn: byWorker.reduce((sum, stat) => sum + stat.bytesIn, 0),
      errors: byWorker.reduce((sum, stat) => sum + stat.errors, 0),
      byWorker,
    };
  }

  async shutdown(gracefulMs = 1_000): Promise<void> {
    const workers = [...this.workers];
    if (workers.length === 0) {
      this.listening = false;
      return;
    }

    await Promise.all(
      workers.map(
        worker =>
          new Promise<void>(resolve => {
            const onMessage = (message: WorkerShardMessage) => {
              if (
                message.type === "shutdown-complete" ||
                message.type === "error"
              ) {
                offProcess(
                  worker,
                  "message",
                  onMessage as unknown as (...args: unknown[]) => void,
                );
                resolve();
              }
            };
            onProcess(
              worker,
              "message",
              onMessage as unknown as (...args: unknown[]) => void,
            );
            worker.send?.({
              type: "shutdown",
              gracefulMs,
            } satisfies WorkerShardCommand);
          }),
      ),
    );

    await Promise.all(
      workers.map(
        worker =>
          new Promise<void>(resolve => {
            if (worker.isDead() || !worker.isConnected()) {
              resolve();
              return;
            }
            onceProcess(worker, "exit", () => resolve());
            worker.kill();
          }),
      ),
    );
    this.workers.length = 0;
    this.shardStats.clear();
    this.listening = false;
  }

  private async forceTerminateWorkers(): Promise<void> {
    const workers = [...this.workers];
    if (workers.length === 0) {
      this.shardStats.clear();
      this.listening = false;
      return;
    }
    await Promise.allSettled(
      workers.map(
        worker =>
          new Promise<void>(resolve => {
            if (worker.isDead() || !worker.isConnected()) {
              resolve();
              return;
            }
            onceProcess(worker, "exit", () => resolve());
            worker.kill();
          }),
      ),
    );
    this.workers.length = 0;
    this.shardStats.clear();
    this.listening = false;
  }

  private spawnWorker(
      bootstrap: WorkerShardBootstrap,
      startupTimeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = cluster.fork({
        ...process.env,
        ...this.options.workerEnv,
      });
      this.workers.push(worker);

      const rejectWith = (error: Error) => {
        cleanup();
        if (worker.isConnected()) {
          worker.kill();
        }
        reject(error);
      };

      const startupTimer = setTimeout(() => {
        rejectWith(
          new Error(
            `Worker shard ${bootstrap.shardIndex} did not become ready within ${startupTimeoutMs}ms`,
          ),
        );
      }, startupTimeoutMs);

      const cleanup = () => {
        clearTimeout(startupTimer);
        offProcess(
          worker,
          "message",
          onMessage as unknown as (...args: unknown[]) => void,
        );
        offProcess(
          worker,
          "error",
          onError as unknown as (...args: unknown[]) => void,
        );
        offProcess(
          worker,
          "exit",
          onExit as unknown as (...args: unknown[]) => void,
        );
      };

      const onMessage = (message: WorkerShardMessage) => {
        if (message.type === "ready") {
          this.shardStats.set(message.shardIndex, {
            shardIndex: message.shardIndex,
            processId: message.processId,
            listening: true,
            address: message.address,
            connections: 0,
            messagesIn: 0,
            bytesIn: 0,
            errors: 0,
          });
          cleanup();
          onProcess(
            worker,
            "message",
            ((followup: WorkerShardMessage) =>
              this.onWorkerMessage(followup)) as unknown as (
              ...args: unknown[]
            ) => void,
          );
          resolve();
          return;
        }

        if (message.type === "error") {
          rejectWith(new Error(message.error));
        }
      };

      const onError = (error: Error) => {
        rejectWith(error);
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        this.workers.splice(this.workers.indexOf(worker), 1);
        reject(
          new Error(
            `Worker shard ${bootstrap.shardIndex} exited before ready with code ${code ?? "null"} signal ${signal ?? "null"}`,
          ),
        );
      };

      onProcess(
        worker,
        "message",
        onMessage as unknown as (...args: unknown[]) => void,
      );
      onProcess(
        worker,
        "error",
        onError as unknown as (...args: unknown[]) => void,
      );
      onProcess(
        worker,
        "exit",
        onExit as unknown as (...args: unknown[]) => void,
      );

      worker.send?.({
        type: "bootstrap",
        payload: bootstrap,
      } satisfies WorkerShardCommand);
    });
  }

  private onWorkerMessage(message: WorkerShardMessage): void {
    if (message.type === "telemetry") {
      this.shardStats.set(message.shardIndex, {
        shardIndex: message.shardIndex,
        ...message.stats,
      });
      return;
    }

    if (message.type === "error") {
      const current = this.shardStats.get(message.shardIndex);
      if (current) {
        this.shardStats.set(message.shardIndex, {
          ...current,
          errors: current.errors + 1,
        });
      }
    }
  }
}
