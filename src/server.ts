import net from "node:net";
import { randomUUID } from "node:crypto";
import { LengthPrefixedFramer } from "./framing";
import { TypedEventEmitter } from "./typedEmitter";
import { bufferDeserializer, defaultSerializer } from "./codecs";
import { QWormholeError } from "./errors";
import { TokenBucket, PriorityQueue, delay } from "./qos";
import {
  isNegantropicHandshake,
  verifyNegantropicHandshake,
} from "./negantropic-handshake";
import { isHandshakePayload, type HandshakePayload } from "./handshake-policy";
import type {
  Payload,
  QWormholeServerConnection,
  QWormholeServerEvents,
  QWormholeServerOptions,
  Serializer,
  Deserializer,
  QWormholeTelemetry,
  SendOptions,
} from "types";

const randomId = () =>
  typeof randomUUID === "function"
    ? randomUUID()
    : Math.random().toString(36).slice(2);

type ManagedConnection = QWormholeServerConnection & {
  backpressured: boolean;
  queue: PriorityQueue<PayloadWithOptions>;
  limiter?: TokenBucket;
  handshakePending: boolean;
};

type PayloadWithOptions = { payload: Payload; options?: SendOptions };

type InternalServerOptions<TMessage> = Omit<
  QWormholeServerOptions<TMessage>,
  "onAuthorizeConnection"
> & {
  serializer: Serializer;
  deserializer: Deserializer<TMessage>;
  framing: "length-prefixed" | "none";
  onAuthorizeConnection?: QWormholeServerOptions<TMessage>["onAuthorizeConnection"];
  rateLimitBytesPerSec?: number;
  rateLimitBurstBytes?: number;
  verifyHandshake?: (payload: unknown) => boolean | Promise<boolean>;
};

export class QWormholeServer<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeServerEvents<TMessage>
> {
  private failedHandshakes = new Map<string, number>();
  private readonly server: net.Server;
  private readonly clients = new Map<string, ManagedConnection>();
  private readonly options: InternalServerOptions<TMessage>;
  private readonly encoder = new LengthPrefixedFramer();
  private telemetry: QWormholeTelemetry = {
    bytesIn: 0,
    bytesOut: 0,
    connections: 0,
    backpressureEvents: 0,
    drainEvents: 0,
  };

  constructor(options: QWormholeServerOptions<TMessage>) {
    super();
    this.options = this.buildOptions(options);
    this.server = net.createServer(
      { allowHalfOpen: this.options.allowHalfOpen },
      socket => {
        void this.handleConnection(socket);
      },
    );
    this.server.on("error", err => this.emit("error", err));
    this.on("error", err => {
      console.error("[QWormholeServer] error:", err);
    });
  }

  async listen(): Promise<net.AddressInfo> {
    return new Promise((resolve, reject) => {
      this.server.listen(
        { host: this.options.host, port: this.options.port },
        () => {
          const address = this.server.address();
          if (!address || typeof address === "string") {
            reject(
              new Error(
                "QWormholeServer could not determine listening address",
              ),
            );
            return;
          }
          this.emit("listening", address);
          resolve(address);
        },
      );

      this.server.once("error", reject);
    });
  }

  async close(): Promise<void> {
    return new Promise(resolve => {
      for (const client of this.clients.values()) {
        client.destroy();
      }
      this.clients.clear();
      this.server.close(() => {
        this.emit("close", undefined as never);
        resolve();
      });
    });
  }

  broadcast(payload: Payload): void {
    for (const client of this.clients.values()) {
      void client.send(payload);
    }
  }

  async shutdown(gracefulMs = 1000): Promise<void> {
    this.server.close();
    const endPromises = Array.from(this.clients.values()).map(client =>
      client.end(),
    );
    await Promise.race([
      Promise.allSettled(endPromises),
      new Promise(resolve => setTimeout(resolve, gracefulMs)),
    ]);
    for (const client of this.clients.values()) {
      client.destroy();
    }
    this.clients.clear();
    this.emit("close", undefined as never);
  }

  getConnection(id: string): QWormholeServerConnection | undefined {
    return this.clients.get(id);
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  private async handleConnection(socket: net.Socket): Promise<void> {
    if (
      this.options.maxClients &&
      this.clients.size >= this.options.maxClients
    ) {
      socket.destroy();
      this.emit(
        "error",
        new QWormholeError("E_MAX_CLIENTS", "Max clients reached"),
      );
      return;
    }

    if (this.options.allowConnection) {
      const allow = await this.options.allowConnection(
        socket.remoteAddress ?? undefined,
      );
      if (!allow) {
        socket.destroy();
        return;
      }
    }

    if (this.options.onAuthorizeConnection) {
      const allow = await this.options.onAuthorizeConnection(socket);
      if (!allow) {
        socket.destroy();
        return;
      }
    }

    const connection = this.createConnection(socket);
    const decoder =
      this.options.framing === "length-prefixed"
        ? new LengthPrefixedFramer({
            maxFrameLength: this.options.maxFrameLength,
          })
        : undefined;

    if (this.options.keepAlive) {
      socket.setKeepAlive(true, this.options.keepAliveDelayMs);
    }
    if (this.options.idleTimeoutMs) {
      socket.setTimeout(this.options.idleTimeoutMs);
    }

    if (decoder) {
      decoder.on("message", data => {
        if (
          connection.handshakePending &&
          this.handleHandshake(connection, data)
        )
          return;
        this.emit("message", {
          client: connection,
          data: this.options.deserializer(data),
        });
      });
      decoder.on("error", err => this.emit("error", err));
    }

    this.clients.set(connection.id, connection);
    this.telemetry.connections = this.clients.size;
    this.publishTelemetry();
    this.emit("connection", connection);

    socket.on("data", chunk => {
      this.telemetry.bytesIn += chunk.length;
      if (decoder) {
        decoder.push(chunk);
      } else {
        if (
          connection.handshakePending &&
          this.handleHandshake(connection, chunk)
        )
          return;
        this.emit("message", {
          client: connection,
          data: this.options.deserializer(chunk),
        });
      }
      this.publishTelemetry();
    });

    socket.on("close", hadError => {
      this.clients.delete(connection.id);
      this.telemetry.connections = this.clients.size;
      this.publishTelemetry();
      this.emit("clientClosed", { client: connection, hadError });
    });

    socket.on("timeout", () => socket.end());
    socket.on("error", err => {
      // Prevent uncaught exceptions during handshake rejection
      this.emit("error", err);
    });
  }

  private createConnection(socket: net.Socket): ManagedConnection {
    const id = randomId();
    const connection: ManagedConnection = {
      id,
      socket,
      remoteAddress: socket.remoteAddress ?? undefined,
      remotePort: socket.remotePort ?? undefined,
      send: (payload: Payload, options?: SendOptions) =>
        this.write(connection, payload, options).catch(err => {
          this.emit("error", err);
          throw err;
        }),
      end: () => socket.end(),
      destroy: () => socket.destroy(),
      backpressured: false,
      queue: new PriorityQueue<PayloadWithOptions>(),
      limiter: this.options.rateLimitBytesPerSec
        ? new TokenBucket(
            this.options.rateLimitBytesPerSec,
            this.options.rateLimitBurstBytes,
          )
        : undefined,
      handshakePending: Boolean(this.options.protocolVersion),
    };
    return connection;
  }

  private async write(
    connection: ManagedConnection,
    payload: Payload,
    options?: SendOptions,
  ): Promise<void> {
    connection.queue.enqueue({ payload, options }, options?.priority ?? 0);
    if (connection.backpressured) return;

    while (connection.queue.length > 0) {
      const next = connection.queue.dequeue();
      if (!next) break;
      const { payload: item } = next;

      const serialized = this.options.serializer(item);
      const framed =
        this.options.framing === "length-prefixed"
          ? this.encoder.encode(serialized)
          : serialized;

      if (connection.limiter) {
        const wait = connection.limiter.reserve(framed.length);
        if (wait > 0) {
          await delay(wait);
        }
      }

      const projectedBuffer = connection.socket.writableLength + framed.length;
      if (
        this.options.maxBackpressureBytes &&
        projectedBuffer > this.options.maxBackpressureBytes
      ) {
        const err = new QWormholeError(
          "E_BACKPRESSURE",
          "Backpressure limit exceeded",
        );
        connection.socket.destroy(err);
        throw err;
      }

      const canWrite = connection.socket.write(framed);
      this.telemetry.bytesOut += framed.length;
      this.publishTelemetry();
      if (canWrite) {
        if (connection.backpressured) {
          connection.backpressured = false;
          this.emit("drain", { client: connection });
          this.telemetry.drainEvents += 1;
        }
        continue;
      }

      connection.backpressured = true;
      this.telemetry.backpressureEvents += 1;
      this.publishTelemetry();
      this.emit("backpressure", {
        client: connection,
        queuedBytes: connection.socket.writableLength,
        threshold:
          this.options.maxBackpressureBytes ?? Number.POSITIVE_INFINITY,
      });

      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          connection.socket.off("error", onError);
          connection.backpressured = false;
          this.emit("drain", { client: connection });
          this.telemetry.drainEvents += 1;
          resolve();
        };
        const onError = (err: Error) => {
          connection.socket.off("drain", onDrain);
          reject(err);
        };
        connection.socket.once("drain", onDrain);
        connection.socket.once("error", onError);
      });
    }
  }

  private buildOptions(
    options: QWormholeServerOptions<TMessage>,
  ): InternalServerOptions<TMessage> {
    const deserializer = (options.deserializer ??
      bufferDeserializer) as Deserializer<TMessage>;

    return {
      host: options.host,
      port: options.port,
      localAddress: options.localAddress ?? undefined,
      localPort: options.localPort ?? undefined,
      interfaceName: options.interfaceName ?? undefined,
      connectTimeoutMs: options.connectTimeoutMs ?? undefined,
      protocolVersion: options.protocolVersion ?? undefined,
      handshakeTags: options.handshakeTags ?? undefined,
      allowHalfOpen: options.allowHalfOpen ?? false,
      framing: options.framing ?? "length-prefixed",
      maxFrameLength: options.maxFrameLength ?? undefined,
      keepAlive: options.keepAlive ?? true,
      keepAliveDelayMs: options.keepAliveDelayMs ?? 30_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 0,
      maxBackpressureBytes: options.maxBackpressureBytes ?? 5 * 1024 * 1024,
      rateLimitBytesPerSec: options.rateLimitBytesPerSec ?? undefined,
      rateLimitBurstBytes:
        options.rateLimitBurstBytes ?? options.rateLimitBytesPerSec,
      maxClients: options.maxClients ?? undefined,
      onTelemetry: options.onTelemetry,
      allowConnection: options.allowConnection,
      serializer: options.serializer ?? defaultSerializer,
      deserializer,
      reconnect: options.reconnect ?? {
        enabled: false,
        initialDelayMs: 0,
        maxDelayMs: 0,
        multiplier: 0,
        maxAttempts: 0,
      },
      onAuthorizeConnection: options.onAuthorizeConnection,
      verifyHandshake: options.verifyHandshake,
    };
  }

  private handleHandshake(
    connection: ManagedConnection,
    data: Buffer,
  ): boolean {
    let verified = false;
    try {
      const parsedPayload = JSON.parse(data.toString("utf8"));
      if (!isHandshakePayload(parsedPayload)) return false;
      const parsed: HandshakePayload = parsedPayload;
      if (
        this.options.protocolVersion &&
        parsed.version &&
        parsed.version !== this.options.protocolVersion
      ) {
        this.clients.delete(connection.id);
        connection.socket.destroy(new Error("Protocol version mismatch"));
        this.emit("clientClosed", { client: connection, hadError: true });
        this.telemetry.connections = this.clients.size;
        this.publishTelemetry();
        connection.handshakePending = false;
        return true;
      }
      const verify = this.options.verifyHandshake;
      if (verify) {
        const result = verify(parsed);
        if (result instanceof Promise) {
          result
            .then(ok => {
              if (!ok) {
                this.clients.delete(connection.id);
                connection.socket.destroy(new Error("Handshake rejected"));
                this.emit("clientClosed", {
                  client: connection,
                  hadError: true,
                });
                this.telemetry.connections = this.clients.size;
                this.publishTelemetry();
                connection.handshakePending = false;
                return false;
              }
              this.attachHandshake(connection, parsed);
            })
            .catch(err => {
              this.clients.delete(connection.id);
              connection.socket.destroy(
                err instanceof Error ? err : new Error(String(err)),
              );
              this.emit("clientClosed", { client: connection, hadError: true });
              this.telemetry.connections = this.clients.size;
              this.publishTelemetry();
              connection.handshakePending = false;
              return false;
            });
          return false;
        }
        if (!result) {
          const key = connection.remoteAddress ?? connection.id;
          const count = this.failedHandshakes.get(key) ?? 0;
          this.failedHandshakes.set(key, count + 1);
          this.clients.delete(connection.id);
          connection.socket.destroy(new Error("Handshake rejected"));
          this.emit("clientClosed", { client: connection, hadError: true });
          this.telemetry.connections = this.clients.size;
          this.publishTelemetry();
          connection.handshakePending = false;
          return false;
        }
      } else if (
        isNegantropicHandshake(parsed) &&
        !verifyNegantropicHandshake(parsed)
      ) {
        this.clients.delete(connection.id);
        this.emit(
          "error",
          new QWormholeError(
            "E_INVALID_HANDSHAKE_SIGNATURE",
            "Invalid negantropic handshake signature",
          ),
        );
        connection.socket.destroy(
          new Error("Invalid negantropic handshake signature"),
        );
        this.emit("clientClosed", { client: connection, hadError: true });
        this.telemetry.connections = this.clients.size;
        this.publishTelemetry();
        connection.handshakePending = false;
        return false;
      }
      this.attachHandshake(connection, parsed);
      verified = true;
      return verified;
    } catch {
      this.clients.delete(connection.id);
      this.emit(
        "error",
        new QWormholeError(
          "E_INVALID_HANDSHAKE_SIGNATURE",
          "Invalid negantropic handshake signature",
        ),
      );
      connection.socket.destroy(); // Prevent uncaught exception
      this.emit("clientClosed", { client: connection, hadError: true });
      this.telemetry.connections = this.clients.size;
      this.publishTelemetry();
      connection.handshakePending = false;
      return false;
    }
  }

  private attachHandshake(
    connection: ManagedConnection,
    parsed: HandshakePayload,
  ): void {
    connection.handshake = {
      version: parsed.version,
      tags: parsed.tags,
      nIndex: parsed.nIndex,
      negHash: parsed.negHash,
    };
    connection.handshakePending = false;
  }

  private publishTelemetry(): void {
    this.options.onTelemetry?.(this.telemetry);
  }
}
