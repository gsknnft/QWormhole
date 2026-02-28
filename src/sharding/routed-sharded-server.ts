import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { availableParallelism } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Payload, QWormholeServerOptions } from "../types/types";
import type {
  WorkerShardSerializableServerOptions,
  WorkerShardStats,
} from "./worker-sharded-server";

type UnsupportedWorkerServerOptionKeys =
  | "allowConnection"
  | "onAuthorizeConnection"
  | "verifyHandshake"
  | "onTelemetry"
  | "onTrustSnapshot"
  | "coherence"
  | "serializer"
  | "deserializer";

export interface RoutedShardedServerOptions
  extends QWormholeServerOptions<Buffer> {
  workers?: number;
  telemetryIntervalMs?: number;
  startupTimeoutMs?: number;
  workerExecArgv?: string[];
  workerEnv?: NodeJS.ProcessEnv;
  shardHost?: string;
}

export type RoutedShardedServerStats = {
  workers: number;
  listening: boolean;
  connections: number;
  acceptedConnections: number;
  proxiedConnections: number;
  messagesIn: number;
  bytesIn: number;
  errors: number;
  address?: AddressInfo;
  byWorker: WorkerShardStats[];
};

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

type ShardProcess = ReturnType<typeof spawn>;

type RoutedProxy = {
  id: string;
  client: net.Socket;
  upstream: net.Socket;
  shardIndex: number;
};

const DEFAULT_TELEMETRY_INTERVAL_MS = 250;
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;

const require_ = createRequire(
  path.join(process.cwd(), "src", "sharding", "routed-sharded-server.ts"),
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

const assertSerializableOptions = (
  options: RoutedShardedServerOptions,
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
      `RoutedShardedServer does not support non-serializable server options in this first pass: ${blocked.join(", ")}`,
    );
  }

  return {
    ...options,
    host: options.shardHost ?? "127.0.0.1",
    port: 0,
    reusePort: false,
  };
};

const onProcess = (
  worker: ShardProcess,
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
  worker: ShardProcess,
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
  worker: ShardProcess,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    worker as unknown as {
      once: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).once(event, listener);
};

const onServer = (
  server: net.Server,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    server as unknown as {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).on(event, listener);
};

const onceServer = (
  server: net.Server,
  event: string,
  listener: (...args: unknown[]) => void,
): void => {
  (
    server as unknown as {
      once: (event: string, listener: (...args: unknown[]) => void) => void;
    }
  ).once(event, listener);
};

const makeProxyId = (counter: number) => `routed-proxy-${counter}`;

export class RoutedShardedServer {
  private readonly options: RoutedShardedServerOptions;
  private readonly workerEntry = resolveProcessEntry();
  private readonly tsxCli = resolveTsxCli();
  private readonly shardStats = new Map<number, WorkerShardStats>();
  private readonly workers: ShardProcess[] = [];
  private readonly proxies = new Map<string, RoutedProxy>();
  private readonly acceptor: net.Server;
  private listening = false;
  private nextShardIndex = 0;
  private proxyCounter = 0;
  private acceptedConnections = 0;
  private errors = 0;
  private listeningAddress?: AddressInfo;

  constructor(options: RoutedShardedServerOptions) {
    this.options = options;
    this.acceptor = net.createServer(socket => {
      void this.handleInbound(socket);
    });
    onServer(
      this.acceptor,
      "error",
      ((error: Error) => {
        this.errors += 1;
        console.error("[RoutedShardedServer] error:", error);
      }) as unknown as (...args: unknown[]) => void,
    );
  }

  async listen(): Promise<AddressInfo> {
    if (this.listening && this.listeningAddress) return this.listeningAddress;

    const workerCount = this.options.workers ?? defaultWorkerCount();
    const telemetryIntervalMs =
      this.options.telemetryIntervalMs ?? DEFAULT_TELEMETRY_INTERVAL_MS;
    const startupTimeoutMs =
      this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    const workerOptions = assertSerializableOptions(this.options);

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
      this.listeningAddress = await new Promise<AddressInfo>((resolve, reject) => {
        this.acceptor.listen(
          {
            host: this.options.host,
            port: this.options.port,
          },
          () => {
            const address = this.acceptor.address();
            if (!address || typeof address === "string") {
              reject(new Error("RoutedShardedServer could not determine listening address"));
              return;
            }
            resolve(address);
          },
        );
        onceServer(
          this.acceptor,
          "error",
          reject as unknown as (...args: unknown[]) => void,
        );
      });
      this.listening = true;
      return this.listeningAddress;
    } catch (error) {
      await this.forceTerminateWorkers();
      throw error;
    }
  }

  broadcast(payload: Payload): void {
    for (const worker of this.workers) {
      worker.send?.({ type: "broadcast", payload } satisfies WorkerShardCommand);
    }
  }

  getStats(): RoutedShardedServerStats {
    const byWorker = [...this.shardStats.values()].sort(
      (a, b) => a.shardIndex - b.shardIndex,
    );
    return {
      workers: this.workers.length,
      listening: this.listening,
      connections: byWorker.reduce((sum, stat) => sum + stat.connections, 0),
      acceptedConnections: this.acceptedConnections,
      proxiedConnections: this.proxies.size,
      messagesIn: byWorker.reduce((sum, stat) => sum + stat.messagesIn, 0),
      bytesIn: byWorker.reduce((sum, stat) => sum + stat.bytesIn, 0),
      errors:
        this.errors + byWorker.reduce((sum, stat) => sum + stat.errors, 0),
      address: this.listeningAddress,
      byWorker,
    };
  }

  async shutdown(gracefulMs = 1_000): Promise<void> {
    this.listening = false;
    await new Promise<void>(resolve => {
      this.acceptor.close(() => resolve());
    });

    for (const proxy of this.proxies.values()) {
      proxy.client.destroy();
      proxy.upstream.destroy();
    }
    this.proxies.clear();

    const workers = [...this.workers];
    if (workers.length === 0) return;

    await Promise.all(
      workers.map(
        worker =>
          new Promise<void>(resolve => {
            const onMessage = (message: WorkerShardMessage) => {
              if (message.type === "shutdown-complete" || message.type === "error") {
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
            if (worker.killed || worker.exitCode !== null) {
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
    this.listeningAddress = undefined;
  }

  private async forceTerminateWorkers(): Promise<void> {
    const workers = [...this.workers];
    if (workers.length === 0) return;
    await Promise.allSettled(
      workers.map(
        worker =>
          new Promise<void>(resolve => {
            if (worker.killed || worker.exitCode !== null) {
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
  }

  private async handleInbound(client: net.Socket): Promise<void> {
    const targetShard = this.selectShard();
    if (!targetShard?.address) {
      client.destroy(new Error("No shard is ready to accept routed traffic"));
      return;
    }

    this.acceptedConnections += 1;
    const proxyId = makeProxyId(++this.proxyCounter);
    const upstream = net.createConnection({
      host: targetShard.address.address,
      port: targetShard.address.port,
    });

    client.pause();
    client.setNoDelay(true);
    upstream.setNoDelay(true);

    const cleanup = () => {
      this.proxies.delete(proxyId);
      client.removeAllListeners("error");
      upstream.removeAllListeners("error");
      client.removeAllListeners("close");
      upstream.removeAllListeners("close");
    };

    const fail = (error?: Error) => {
      cleanup();
      if (error) this.errors += 1;
      client.destroy(error);
      upstream.destroy(error);
    };

    upstream.once("connect", () => {
      this.proxies.set(proxyId, {
        id: proxyId,
        client,
        upstream,
        shardIndex: targetShard.shardIndex,
      });
      client.pipe(upstream);
      upstream.pipe(client);
      client.resume();
    });

    client.on("error", err => fail(err));
    upstream.on("error", err => fail(err));
    client.on("close", cleanup);
    upstream.on("close", cleanup);
  }

  private selectShard(): WorkerShardStats | undefined {
    const shards = [...this.shardStats.values()]
      .filter(stat => stat.listening && stat.address)
      .sort((a, b) => a.shardIndex - b.shardIndex);
    if (shards.length === 0) return undefined;
    const shard = shards[this.nextShardIndex % shards.length];
    this.nextShardIndex = (this.nextShardIndex + 1) % shards.length;
    return shard;
  }

  private spawnWorker(
    bootstrap: WorkerShardBootstrap,
    startupTimeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = spawn(
        process.execPath,
        [
          ...((this.options.workerExecArgv ?? []).length > 0
            ? (this.options.workerExecArgv ?? [])
            : [this.tsxCli]),
          this.workerEntry,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            ...this.options.workerEnv,
          },
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        },
      );
      this.workers.push(worker);

      const rejectWith = (error: Error) => {
        cleanup();
        if (worker.exitCode === null && !worker.killed) {
          worker.kill();
        }
        reject(error);
      };

      const startupTimer = setTimeout(() => {
        rejectWith(
          new Error(
            `Routed shard ${bootstrap.shardIndex} did not become ready within ${startupTimeoutMs}ms`,
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

      const onError = (error: Error) => rejectWith(error);

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        this.workers.splice(this.workers.indexOf(worker), 1);
        reject(
          new Error(
            `Routed shard ${bootstrap.shardIndex} exited before ready with code ${code ?? "null"} signal ${signal ?? "null"}`,
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
      this.errors += 1;
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
