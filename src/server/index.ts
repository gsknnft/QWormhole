import net from "node:net";
import tls from "node:tls";
import { createHash, randomUUID } from "node:crypto";
import { LengthPrefixedFramer } from "../framing";
import { BatchFramer } from "../batch-framer";
import { TypedEventEmitter } from "../typedEmitter";
import { bufferDeserializer, defaultSerializer } from "../codecs";
import { QWormholeError } from "../errors";
import { TokenBucket, PriorityQueue, delay } from "../qos";
import {
  isNegantropicHandshake,
  verifyNegantropicHandshake,
} from "../handshake/negantropic-handshake";
import { type HandshakePayload } from "../handshake/handshake-policy";
import {
  deriveEntropyPolicy,
  computeEntropyMetrics,
} from "../handshake/entropy-policy";
import type { EntropyMetrics } from "../handshake/entropy-policy";
import { handshakePayloadSchema } from "../schema/scp";
import { createFlowController, type FlowController } from "../flow-controller";
import type {
  Payload,
  QWormholeServerConnection,
  QWormholeServerEvents,
  QWormholeServerOptions,
  Serializer,
  Deserializer,
  QWormholeTelemetry,
  SendOptions,
  QWTlsOptions,
} from "src/types/types";

const randomId = () =>
  typeof randomUUID === "function"
    ? randomUUID()
    : Math.random().toString(36).slice(2);

type ManagedConnection = QWormholeServerConnection & {
  backpressured: boolean;
  queue: PriorityQueue<Buffer>;
  limiter?: TokenBucket;
  handshakePending: boolean;
  outboundFramer?: BatchFramer;
  flowController?: FlowController;
  entropyMetrics: EntropyMetrics;
  peerIsNative: boolean;
  handshakeMessageDelivered: boolean;
};

type TrustSnapshotReason = "close" | "error" | "disconnect";

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
  tls?: QWTlsOptions;
  emitHandshakeMessages?: boolean;
};

export class QWormholeServer<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeServerEvents<TMessage>
> {
  // Track failed handshakes with timestamp for TTL-based cleanup
  private failedHandshakes = new Map<string, { count: number; lastFailed: number }>();
  private failedHandshakesTTLMs = 60 * 60 * 1000; // 1 hour TTL
  private failedHandshakesMaxSize = 10000; // Maximum entries to prevent unbounded growth
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
    if (this.options.tls?.enabled) {
      this.server = tls.createServer(
        {
          key: this.options.tls.key,
          cert: this.options.tls.cert,
          ca: this.options.tls.ca,
          requestCert: this.options.tls.requestCert,
          rejectUnauthorized:
            this.options.tls.rejectUnauthorized ??
            Boolean(this.options.tls.requestCert),
          ALPNProtocols: this.options.tls.alpnProtocols,
          passphrase: this.options.tls.passphrase,
        },
        socket => {
          void this.handleConnection(socket);
        },
      );
    } else {
      this.server = net.createServer(
        { allowHalfOpen: this.options.allowHalfOpen },
        socket => {
          void this.handleConnection(socket);
        },
      );
    }
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

  async close(_gracefulMs = 250): Promise<void> {
    const clients = Array.from(this.clients.values());

    for (const connection of clients) {
      try {
        connection.end();
      } catch (err) {
        this.emit("error", err as Error);
      }
    }

    for (const connection of clients) {
      try {
        connection.destroy();
      } catch (err) {
        this.emit("error", err as Error);
      }
    }

    this.clients.clear();

    await new Promise<void>((resolve, reject) => {
      const onClose = () => {
        cleanup();
        this.emit("close", undefined as never);
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this.server.off("close", onClose);
        this.server.off("error", onError);
      };
      this.server.once("close", onClose);
      this.server.once("error", onError);
      this.server.close();
    });
  }

  broadcast(payload: Payload): void {
    for (const client of this.clients.values()) {
      void client.send(payload);
    }
  }

  async shutdown(gracefulMs = 1000): Promise<void> {
    await this.close(gracefulMs);
  }

  getConnection(id: string): QWormholeServerConnection | undefined {
    return this.clients.get(id);
  }

  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Record a failed handshake attempt with TTL-based cleanup
   */
  private recordFailedHandshake(key: string): void {
    const now = Date.now();
    
    // Prune expired entries if map is getting large
    if (this.failedHandshakes.size >= this.failedHandshakesMaxSize) {
      this.pruneExpiredHandshakeFailures();
    }
    
    // Still too large after pruning? Remove oldest entries
    if (this.failedHandshakes.size >= this.failedHandshakesMaxSize) {
      const sortedEntries = Array.from(this.failedHandshakes.entries())
        .sort((a, b) => a[1].lastFailed - b[1].lastFailed);
      // Remove oldest 10%
      const toRemove = Math.ceil(sortedEntries.length * 0.1);
      for (let i = 0; i < toRemove; i++) {
        this.failedHandshakes.delete(sortedEntries[i][0]);
      }
    }
    
    const existing = this.failedHandshakes.get(key);
    if (existing) {
      this.failedHandshakes.set(key, { 
        count: existing.count + 1, 
        lastFailed: now 
      });
    } else {
      this.failedHandshakes.set(key, { count: 1, lastFailed: now });
    }
  }

  /**
   * Prune expired handshake failure entries
   */
  private pruneExpiredHandshakeFailures(): void {
    const now = Date.now();
    for (const [key, entry] of this.failedHandshakes.entries()) {
      if (now - entry.lastFailed > this.failedHandshakesTTLMs) {
        this.failedHandshakes.delete(key);
      }
    }
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
        const payload = this.options.deserializer(data);
        const handledHandshake =
          connection.handshakePending && this.handleHandshake(connection, data);
        if (handledHandshake) {
          if (this.options.emitHandshakeMessages) {
            connection.handshakeMessageDelivered = true;
            this.emit("message", { client: connection, data: payload });
          }
          return;
        }
        if (
          this.options.emitHandshakeMessages &&
          connection.handshakeMessageDelivered &&
          this.isHandshakePayload(payload)
        ) {
          return;
        }
        this.emit("message", { client: connection, data: payload });
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
        const payload = this.options.deserializer(chunk);
        const handledHandshake =
          connection.handshakePending &&
          this.handleHandshake(connection, chunk);
        if (handledHandshake) {
          if (this.options.emitHandshakeMessages) {
            connection.handshakeMessageDelivered = true;
            this.emit("message", { client: connection, data: payload });
          }
          return;
        }
        if (
          this.options.emitHandshakeMessages &&
          connection.handshakeMessageDelivered &&
          this.isHandshakePayload(payload)
        ) {
          return;
        }
        this.emit("message", { client: connection, data: payload });
      }
      this.publishTelemetry();
    });

    socket.on("close", hadError => {
      this.publishTrustSnapshot(connection, hadError ? "error" : "close");
      connection.outboundFramer?.detachSocket();
      connection.outboundFramer = undefined;
      connection.flowController = undefined;
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
    const entropyMetrics = computeEntropyMetrics(0.5);
    const outboundFramer =
      this.options.framing === "length-prefixed"
        ? new BatchFramer()
        : undefined;
    outboundFramer?.attachSocket(socket);
    const flowController = outboundFramer
      ? createFlowController(entropyMetrics)
      : undefined;
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
      queue: new PriorityQueue<Buffer>(),
      limiter: this.options.rateLimitBytesPerSec
        ? new TokenBucket(
            this.options.rateLimitBytesPerSec,
            this.options.rateLimitBurstBytes,
          )
        : undefined,
      handshakePending: Boolean(this.options.protocolVersion),
      outboundFramer,
      flowController,
      entropyMetrics,
      peerIsNative: false,
      handshakeMessageDelivered: false,
    };

    if (outboundFramer) {
      outboundFramer.on("backpressure", ({ queuedBytes }) => {
        connection.flowController?.onBackpressure(queuedBytes);
        this.telemetry.backpressureEvents += 1;
        this.publishTelemetry();
        this.emit("backpressure", {
          client: connection,
          queuedBytes,
          threshold:
            this.options.maxBackpressureBytes ?? Number.POSITIVE_INFINITY,
        });
      });
      outboundFramer.on("drain", () => {
        connection.flowController?.onDrain();
        this.telemetry.drainEvents += 1;
        this.publishTelemetry();
        this.emit("drain", { client: connection });
      });
    }
    return connection;
  }

  private async write(
    connection: ManagedConnection,
    payload: Payload,
    options?: SendOptions,
  ): Promise<void> {
    const serialized = this.options.serializer(payload);
    const priority = options?.priority ?? 0;
    connection.queue.enqueue(serialized, priority);

    const usingFlowController = Boolean(
      connection.outboundFramer && connection.flowController,
    );

    if (connection.backpressured && !usingFlowController) return;

    while (connection.queue.length > 0) {
      const next = connection.queue.dequeue();
      if (!next) break;
      const estimatedBytes =
        this.options.framing === "length-prefixed"
          ? next.length + 4
          : next.length;

      if (connection.limiter) {
        const wait = connection.limiter.reserve(estimatedBytes);
        if (wait > 0) {
          await delay(wait);
        }
      }

      if (
        usingFlowController &&
        connection.outboundFramer &&
        connection.flowController
      ) {
        const projectedBuffer =
          connection.socket.writableLength + estimatedBytes;
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
        await connection.flowController.enqueue(
          next,
          connection.outboundFramer,
        );
        continue;
      }

      const framed =
        this.options.framing === "length-prefixed"
          ? this.encoder.encode(next)
          : next;

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
          this.publishTelemetry();
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
          this.publishTelemetry();
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

    if (
      usingFlowController &&
      connection.outboundFramer &&
      connection.flowController
    ) {
      await connection.flowController.flushPending(connection.outboundFramer);
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
      emitHandshakeMessages: options.emitHandshakeMessages ?? false,
      reconnect: options.reconnect ?? {
        enabled: false,
        initialDelayMs: 0,
        maxDelayMs: 0,
        multiplier: 0,
        maxAttempts: 0,
      },
      onAuthorizeConnection: options.onAuthorizeConnection,
      verifyHandshake: options.verifyHandshake,
      tls: options.tls,
    };
  }

  private handleHandshake(
    connection: ManagedConnection,
    data: Buffer,
  ): boolean {
    let verified = false;
    try {
      const parsedPayload = JSON.parse(data.toString("utf8"));
      const parsedResult = handshakePayloadSchema.safeParse(parsedPayload);
      if (!parsedResult.success) {
        this.emit(
          "error",
          new QWormholeError(
            "E_INVALID_HANDSHAKE_PAYLOAD",
            "Invalid handshake payload",
          ),
        );
        this.clients.delete(connection.id);
        connection.socket.destroy(new Error("Invalid handshake payload"));
        this.emit("clientClosed", { client: connection, hadError: true });
        this.telemetry.connections = this.clients.size;
        this.publishTelemetry();
        connection.handshakePending = false;
        return true;
      }
      const parsed: HandshakePayload = parsedResult.data;
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
      if (!this.verifyTlsFingerprint(connection.socket, parsed.tags)) {
        this.clients.delete(connection.id);
        connection.socket.destroy(new Error("TLS fingerprint mismatch"));
        this.emit("clientClosed", { client: connection, hadError: true });
        this.telemetry.connections = this.clients.size;
        this.publishTelemetry();
        connection.handshakePending = false;
        return false;
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
          this.recordFailedHandshake(key);
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
    const tlsInfo = this.collectTlsInfo(connection.socket, parsed.negHash);

    // Derive entropy policy from handshake (0.3.2)
    const nIndex = parsed.nIndex ?? parsed.entropyMetrics?.negIndex ?? 0.5;
    const entropyMetrics =
      parsed.entropyMetrics ?? computeEntropyMetrics(nIndex);
    const policy = deriveEntropyPolicy(entropyMetrics);
    const peerIsNative = policy.framing === "zero-copy-writev";

    connection.handshake = {
      version: parsed.version,
      tags: parsed.tags,
      nIndex: parsed.nIndex,
      negHash: parsed.negHash,
      entropyMetrics: {
        entropy: entropyMetrics.entropy,
        entropyVelocity: entropyMetrics.entropyVelocity,
        coherence: entropyMetrics.coherence,
        negIndex: entropyMetrics.negIndex,
      },
      policy: {
        mode: policy.mode,
        framing: policy.framing,
        batchSize: policy.batchSize,
        codec: policy.codec,
        requireAck: policy.requireAck,
        requireChecksum: policy.requireChecksum,
        trustLevel: policy.trustLevel,
      },
      tls: tlsInfo,
    };
    connection.entropyMetrics = entropyMetrics;
    connection.peerIsNative = peerIsNative;
    if (connection.outboundFramer) {
      connection.flowController = createFlowController(entropyMetrics, {
        peerIsNative,
      });
    }
    connection.handshakePending = false;
  }

  private collectTlsInfo(socket: net.Socket, negHash?: string) {
    if (!(socket instanceof tls.TLSSocket)) return undefined;
    const peer = socket.getPeerCertificate?.(true) as
      | (tls.PeerCertificate & { fingerprint256?: string })
      | null;
    const cipher = socket.getCipher?.();
    const rawProtocol = socket.getProtocol?.();
    const tlsInfo = {
      alpnProtocol:
        socket.alpnProtocol === null ? undefined : socket.alpnProtocol,
      authorized: socket.authorized,
      peerFingerprint256: peer?.fingerprint256,
      peerFingerprint: peer?.fingerprint,
      protocol: rawProtocol === null ? undefined : rawProtocol,
      cipher: cipher?.name,
      tlsSessionKey: this.deriveTlsSessionKey(socket, negHash),
    };
    return tlsInfo;
  }

  private deriveTlsSessionKey(
    socket: tls.TLSSocket,
    negHash?: string,
  ): string | undefined {
    const opts = this.options.tls?.exportKeyingMaterial;
    if (!opts || typeof socket.exportKeyingMaterial !== "function") return;
    const label = opts.label ?? "qwormhole-negentropic";
    const length = opts.length ?? 32;
    const context = opts.context ?? Buffer.alloc(0);
    try {
      const material = socket.exportKeyingMaterial(length, label, context);
      if (negHash) {
        return createHash("sha256")
          .update(material)
          .update(negHash)
          .digest("base64");
      }
      return material.toString("base64");
    } catch {
      return undefined;
    }
  }

  private verifyTlsFingerprint(
    socket: net.Socket,
    tags?: Record<string, unknown>,
  ): boolean {
    if (!(socket instanceof tls.TLSSocket)) return true;
    if (!tags) return true;
    const expected256 =
      typeof (tags as Record<string, unknown>).tlsFingerprint256 === "string"
        ? (tags as Record<string, string>).tlsFingerprint256
        : undefined;
    const expected =
      typeof (tags as Record<string, unknown>).tlsFingerprint === "string"
        ? (tags as Record<string, string>).tlsFingerprint
        : undefined;
    if (!expected256 && !expected) return true;
    const peer = socket.getPeerCertificate?.(true) as
      | (tls.PeerCertificate & { fingerprint256?: string })
      | null;
    if (!peer || Object.keys(peer).length === 0) return false;
    if (expected256 && peer.fingerprint256 !== expected256) return false;
    if (expected && peer.fingerprint !== expected) return false;
    return true;
  }

  private publishTelemetry(): void {
    this.options.onTelemetry?.(this.telemetry);
  }

  private publishTrustSnapshot(
    connection: ManagedConnection,
    reason: TrustSnapshotReason,
  ): void {
    const sink = this.options.onTrustSnapshot;
    if (!sink) return;
    const framer = connection.outboundFramer;
    const controller = connection.flowController;
    if (!framer || !controller) return;
    const handshake = connection.handshake;
    const remoteAddress = connection.remoteAddress;
    const remotePort = connection.remotePort;
    const peerId =
      (handshake?.tags?.origin as string | undefined) ?? connection.id;
    void (async () => {
      try {
        const [flowDiagnostics, batchStats] = await Promise.all([
          controller.snapshot(framer, { reset: true }),
          framer.snapshot({ reset: true }),
        ]);
        await sink({
          direction: "server",
          reason,
          timestamp: Date.now(),
          remoteAddress,
          remotePort,
          peerId,
          handshakeTags: handshake?.tags,
          entropyMetrics: handshake?.entropyMetrics,
          policyTrustLevel: handshake?.policy?.trustLevel,
          flowDiagnostics,
          batchStats,
        });
      } catch (err) {
        console.warn("[QWormholeServer] failed to publish trust snapshot", err);
      }
    })();
  }

  private isHandshakePayload(payload: unknown): payload is { type?: string } {
    return (
      !!payload &&
      typeof payload === "object" &&
      (payload as { type?: string }).type === "handshake"
    );
  }
}
