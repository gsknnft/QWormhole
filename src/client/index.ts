import net from "node:net";
import tls from "node:tls";
import { LengthPrefixedFramer } from "../core/framing";
import { BatchFramer } from "../core/batch-framer";
import { defaultSerializer, bufferDeserializer } from "../core/codecs";
import { TypedEventEmitter } from "../utils/typedEmitter";
import { resolveInterfaceAddress } from "../utils/netUtils";
import { QWormholeError } from "../utils/errors";
import { TokenBucket, PriorityQueue, delay } from "../core/qos";
import { handshakePayloadSchema, type HandshakePayload } from "../schema/scp";
import {
  createFlowController,
  type FlowController,
} from "../core/flow-controller";
import {
  attachCoherenceAdapter,
  type CoherenceAdapterHandle,
  type CoherenceAdapterOptions,
} from "../coherence/adapter";
import type { EntropyMetrics } from "../handshake/entropy-policy";
import type {
  QWormholeClientEvents,
  QWormholeClientOptions,
  QWormholeReconnectOptions,
  Payload,
  QWormholeSocketLike,
  Deserializer,
  Serializer,
  SendOptions,
  FramingMode,
} from "src/types/types";
import { inferMessageType } from "../utils/negentropic-diagnostics";

const DEFAULT_RECONNECT: QWormholeReconnectOptions = {
  enabled: true,
  initialDelayMs: 300,
  maxDelayMs: 10_000,
  multiplier: 2,
  maxAttempts: Number.POSITIVE_INFINITY,
};

const DRAIN_BATCH_SIZE = 64;

type InternalOptions<TMessage> = Omit<
  QWormholeClientOptions<TMessage>,
  "reconnect"
> & {
  reconnect: QWormholeReconnectOptions;
  serializer: Serializer;
  deserializer: Deserializer<TMessage>;
  framing: FramingMode;
  rateLimitBytesPerSec?: number;
  rateLimitBurstBytes?: number;
  handshakeSigner?: () => Record<string, unknown>;
  heartbeatIntervalMs?: number;
  heartbeatPayload?: Payload;
  coherence?: CoherenceAdapterOptions;
};

type TrustSnapshotReason =
  | "close"
  | "error"
  | "disconnect"
  | "entropy-related"
  | "handshake";

export class QWormholeClient<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeClientEvents<TMessage>
> {
  public socket?: net.Socket | QWormholeSocketLike;
  private hadSocketError = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private readonly options: InternalOptions<TMessage>;
  private readonly framer?: LengthPrefixedFramer;
  private readonly outboundFramer?: BatchFramer;
  private flowController?: FlowController;
  private coherenceAdapter?: CoherenceAdapterHandle;
  private readonly entropyMetrics: EntropyMetrics;
  private readonly peerIsNative: boolean;
  private connectTimer?: NodeJS.Timeout;
  private readonly queue = new PriorityQueue<Buffer>();
  private readonly limiter?: TokenBucket;
  private draining = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private pendingCloseReason: TrustSnapshotReason = "close";
  private trustSnapshotInFlight = false;
  private socketTokenCounter = 0;
  private settledCloseToken = 0;
  private currentSocketToken = 0;

  constructor(options: QWormholeClientOptions<TMessage>) {
    super();
    this.options = this.buildOptions(options);
    if (this.options.framing === "length-prefixed") {
      this.framer = new LengthPrefixedFramer({
        maxFrameLength: this.options.maxFrameLength,
      });
      this.framer.on("message", data =>
        this.emit("message", this.options.deserializer(data)),
      );
      this.framer.on("error", err => this.emit("error", err));
    }
    this.peerIsNative = this.options.peerIsNative ?? false;
    this.entropyMetrics = this.options.entropyMetrics ?? { negIndex: 0.5 };
    if (this.options.framing === "length-prefixed") {
      this.outboundFramer = new BatchFramer();
      if (!this.options.disableFlowController) {
        this.flowController = createFlowController(this.entropyMetrics, {
          peerIsNative: this.peerIsNative,
          fastPath: this.options.flowFastPath,
        });
        const tuneFramer = () => {
          if (!this.outboundFramer || !this.flowController) return;
          const batchSize = this.flowController.resolveBatchSize(
            this.peerIsNative,
          );
          const caps = this.flowController.resolveFramerCaps(this.peerIsNative);
          this.outboundFramer.setBatchTiming(batchSize, caps.flushMs);
          this.outboundFramer.setFlushCaps(caps.maxBuffers, caps.maxBytes);
        };
        this.outboundFramer.on("backpressure", ({ queuedBytes }) => {
          this.flowController?.onBackpressure(queuedBytes);
          tuneFramer();
        });
        this.outboundFramer.on("drain", () => {
          this.flowController?.onDrain();
          tuneFramer();
        });
        this.outboundFramer.on("flush", ({ bufferCount, totalBytes }) => {
          this.flowController?.handleFlushMetrics(bufferCount, totalBytes);
          tuneFramer();
        });
        this.flowController.on("sliceDrift", tuneFramer);
        tuneFramer();
      }
    }
    if (this.options.rateLimitBytesPerSec) {
      this.limiter = new TokenBucket(
        this.options.rateLimitBytesPerSec,
        this.options.rateLimitBurstBytes ?? this.options.rateLimitBytesPerSec,
      );
    }
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;

    this.closedByUser = false;
    this.clearReconnectTimer();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const localAddress =
        this.options.localAddress ??
        resolveInterfaceAddress(this.options.interfaceName);
      if (this.options.interfaceName && !localAddress) {
        reject(
          new QWormholeError(
            "E_INTERFACE_NOT_FOUND",
            `Interface ${this.options.interfaceName} not found`,
          ),
        );
        return;
      }

      const onConnect = () => {
        if (settled) return;
        const finalizeReady = () => {
          if (settled) return;
          settled = true;
          this.clearConnectTimer();
          this.reconnectAttempts = 0;
          this.emit("connect", undefined as never);
          this.emit("ready", undefined as never);
          this.startHeartbeat();
          resolve();
        };
        if (this.socket) {
          this.attachOutboundFramer(this.socket as net.Socket);
        }
        if (this.options.protocolVersion) {
          void this.enqueueHandshake()
            .then(() => finalizeReady())
            .catch(err => {
              if (settled) return;
              settled = true;
              this.clearConnectTimer();
              reject(err instanceof Error ? err : new Error(String(err)));
            });
          return;
        }
        finalizeReady();
      };

      const socket = this.options.socketFactory
        ? this.options.socketFactory({
            host: this.options.host,
            port: this.options.port,
            interfaceName: this.options.interfaceName,
            localAddress,
            localPort: this.options.localPort,
            connectTimeoutMs: this.options.connectTimeoutMs,
            idleTimeoutMs: this.options.idleTimeoutMs,
            tls: this.options.tls,
          })
        : this.options.tls?.enabled
          ? tls.connect(
              {
                host: this.options.host,
                port: this.options.port,
                servername: this.options.tls.servername ?? this.options.host,
                key: this.options.tls.key,
                cert: this.options.tls.cert,
                ca: this.options.tls.ca,
                passphrase: this.options.tls.passphrase,
                ALPNProtocols: this.options.tls.alpnProtocols,
                requestCert: this.options.tls.requestCert,
                rejectUnauthorized:
                  this.options.tls.rejectUnauthorized ??
                  true,
              },
              onConnect,
            )
          : net.createConnection(
              {
                host: this.options.host,
                port: this.options.port,
                localAddress,
                localPort: this.options.localPort,
              },
              onConnect,
            );

      this.socket = socket;
      const closeToken = ++this.socketTokenCounter;
      this.currentSocketToken = closeToken;

      if (this.options.keepAlive) {
        socket.setKeepAlive?.(true, this.options.keepAliveDelayMs);
      }
      if (this.options.idleTimeoutMs) {
        socket.setTimeout?.(this.options.idleTimeoutMs);
      }
      const socketHighWaterMark = this.options.socketHighWaterMark;
      if (
        typeof socketHighWaterMark === "number" &&
        Number.isFinite(socketHighWaterMark) &&
        socketHighWaterMark > 0
      ) {
        const writableState = (
          socket as net.Socket & {
            _writableState?: { highWaterMark?: number };
          }
        )._writableState;
        if (
          writableState &&
          typeof writableState.highWaterMark === "number" &&
          writableState.highWaterMark < socketHighWaterMark
        ) {
          writableState.highWaterMark = socketHighWaterMark;
        }
      }

      const wire = socket as unknown as {
        on: (event: string, cb: (...args: any[]) => void) => void;
        once?: (event: string, cb: (...args: any[]) => void) => void;
        off?: (event: string, cb: (...args: any[]) => void) => void;
      };

      wire.on("data", (chunk: Buffer) => this.handleData(chunk));
      wire.on("close", (hadError: boolean) =>
        this.handleClose(hadError, closeToken),
      );
      wire.on("timeout", () => {
        this.emit("timeout", undefined as never);
        socket.end();
      });

      wire.on("error", (err: Error) => {
        this.hadSocketError = true;
        this.emit("error", err);
        this.handleClose(true, closeToken); // Ensure hadError is true on error
        if (!settled) {
          settled = true;
          this.clearConnectTimer();
          reject(err);
        }
        this.scheduleReconnect();
      });

      if (this.options.connectTimeoutMs && this.options.connectTimeoutMs > 0) {
        this.connectTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.destroy?.();
          reject(
            new QWormholeError("E_CONNECT_TIMEOUT", "Connection timed out"),
          );
        }, this.options.connectTimeoutMs);
        return 0;
      }

      if (this.options.socketFactory) {
        try {
          const maybePromise = (
            socket as QWormholeSocketLike & { connect?: () => unknown }
          ).connect?.();
          if (
            maybePromise &&
            typeof (maybePromise as Promise<void>).then === "function"
          ) {
            (maybePromise as Promise<void>).then(onConnect).catch(err => {
              if (!settled) {
                settled = true;
                this.clearConnectTimer();
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            });
          } else {
            socket.once?.("connect", onConnect);
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            this.clearConnectTimer();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
    });
  }

  public async send(payload: Payload, options?: SendOptions): Promise<void> {
    this.enqueueSend(payload, options);
  }

  public async disconnect(): Promise<void> {
    this.pendingCloseReason = "disconnect";
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.detachOutboundFramer();
    const socket = this.socket;
    const closeToken = this.currentSocketToken;
    if (!socket) {
      this.handleClose(false, closeToken);
      return;
    }
    socket.end();
    socket.destroy();
    this.socket = undefined;
    queueMicrotask(() => {
      if (closeToken > this.settledCloseToken) {
        this.handleClose(false, closeToken);
      }
    });
  }

  public isConnected(): boolean {
    return Boolean(this.socket && !this.socket.destroyed);
  }

  private handleData(chunk: Buffer): void {
    if (this.options.framing === "length-prefixed" && this.framer) {
      this.framer.push(chunk);
    } else {
      this.emit("data", chunk);
      this.emit("message", this.options.deserializer(chunk));
    }
  }

  private handleClose(hadError: boolean, closeToken: number): void {
    if (closeToken <= this.settledCloseToken) return;
    this.settledCloseToken = closeToken;
    // If hadError is true, ensure hadSocketError is set
    if (hadError) this.hadSocketError = true;
    // If handshake is pending and connection closes, treat as error
    const handshakePending = Boolean(this.options.protocolVersion);
    const hadErrorFinal =
      this.hadSocketError || (handshakePending && !this.closedByUser);
    const snapshotReason: TrustSnapshotReason = hadErrorFinal
      ? "error"
      : this.pendingCloseReason;
    this.publishTrustSnapshot(snapshotReason);
    this.pendingCloseReason = "close";
    this.detachOutboundFramer();
    this.emit("close", { hadError: hadErrorFinal });
    this.hadSocketError = false;
    this.stopHeartbeat();
    this.socket = undefined;
    if (!this.closedByUser) {
      this.scheduleReconnect();
    } else {
      this.clearReconnectTimer();
    }
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    if (!this.options.reconnect.enabled) return;
    if (this.reconnectAttempts >= this.options.reconnect.maxAttempts) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempts += 1;
    const delayMs = Math.min(
      this.options.reconnect.initialDelayMs *
        this.options.reconnect.multiplier ** (this.reconnectAttempts - 1),
      this.options.reconnect.maxDelayMs,
    );

    this.emit("reconnecting", { attempt: this.reconnectAttempts, delayMs });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(err => this.emit("error", err));
    }, delayMs);
  }

  private buildOptions(
    options: QWormholeClientOptions<TMessage>,
  ): InternalOptions<TMessage> {
    const reconnect: QWormholeReconnectOptions = {
      ...DEFAULT_RECONNECT,
      ...(options.reconnect ?? {}),
    };
    const deserializer = (options.deserializer ??
      bufferDeserializer) as Deserializer<TMessage>;
    return {
      host: options.host,
      port: options.port,
      framing: options.framing ?? "length-prefixed",
      maxFrameLength: options.maxFrameLength ?? undefined,
      keepAlive: options.keepAlive ?? true,
      keepAliveDelayMs: options.keepAliveDelayMs ?? 30_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 0,
      reconnect,
      serializer: options.serializer ?? defaultSerializer,
      deserializer,
      requireConnectedForSend: options.requireConnectedForSend ?? false,
      localAddress: options.localAddress ?? undefined,
      localPort: options.localPort ?? undefined,
      interfaceName: options.interfaceName ?? undefined,
      connectTimeoutMs: options.connectTimeoutMs ?? undefined,
      protocolVersion: options.protocolVersion ?? undefined,
      handshakeTags: options.handshakeTags ?? undefined,
      rateLimitBytesPerSec: options.rateLimitBytesPerSec ?? undefined,
      rateLimitBurstBytes:
        options.rateLimitBurstBytes ?? options.rateLimitBytesPerSec,
      handshakeSigner: options.handshakeSigner ?? undefined,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? undefined,
      heartbeatPayload: options.heartbeatPayload ?? undefined,
      socketHighWaterMark: options.socketHighWaterMark ?? undefined,
      socketFactory: options.socketFactory ?? undefined,
      tls: options.tls,
      entropyMetrics: options.entropyMetrics,
      peerIsNative: options.peerIsNative,
      coherence: options.coherence ?? undefined,
      disableFlowController: options.disableFlowController ?? false,
      flowFastPath: options.flowFastPath ?? false,
    };
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
  }

  private attachOutboundFramer(socket: net.Socket | QWormholeSocketLike): void {
    this.outboundFramer?.attachSocket(socket as net.Socket);
    this.coherenceAdapter?.stop();
    this.coherenceAdapter = undefined;
    if (!this.outboundFramer || !this.flowController) return;
    if (!this.shouldEnableCoherence()) return;
    this.coherenceAdapter = attachCoherenceAdapter(
      this.outboundFramer,
      this.flowController,
      this.options.coherence,
    );
  }

  private detachOutboundFramer(): void {
    this.coherenceAdapter?.stop();
    this.coherenceAdapter = undefined;
    this.outboundFramer?.detachSocket();
  }

  private publishTrustSnapshot(reason: TrustSnapshotReason): void {
    if (!this.options.onTrustSnapshot) return;
    if (!this.flowController || !this.outboundFramer) return;
    if (this.trustSnapshotInFlight) return;
    this.trustSnapshotInFlight = true;
    const entropyMetrics = this.entropyMetrics;
    void (async () => {
      try {
        const [flowDiagnostics, batchStats] = await Promise.all([
          this.flowController!.snapshot(this.outboundFramer!, { reset: true }),
          this.outboundFramer!.snapshot({ reset: true }),
        ]);
        const queueStats = this.queue.snapshot({ reset: true });
        await this.options.onTrustSnapshot?.({
          direction: "client",
          reason,
          timestamp: Date.now(),
          remoteAddress: this.options.host,
          remotePort: this.options.port,
          peerId: this.options.handshakeTags?.origin as string | undefined,
          handshakeTags: this.options.handshakeTags,
          entropyMetrics,
          flowDiagnostics,
          batchStats,
          queueStats,
        });
      } catch (err) {
        // Surface snapshot issues for visibility but do not throw
        console.warn("[QWormholeClient] failed to publish trust snapshot", err);
      } finally {
        this.trustSnapshotInFlight = false;
      }
    })();
  }

  private enqueueSend(payload: Payload, options?: SendOptions): void {
    if (!this.socket || this.socket.destroyed) {
      if (this.options.requireConnectedForSend) {
        throw new Error("QWormholeClient is not connected");
      }
      return;
    }
    this.recordNegentropicSample(payload);
    const serialized = this.options.serializer(payload);
    this.queue.enqueue(serialized, options?.priority ?? 0);
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length > 0) {
      if (!this.socket || this.socket.destroyed) break;
      const batch = this.queue.dequeueMany(DRAIN_BATCH_SIZE);
      if (batch.length === 0) break;
      for (const next of batch) {
        if (!this.socket || this.socket.destroyed) break;
        if (this.limiter) {
          const estimatedBytes =
            this.options.framing === "length-prefixed"
              ? next.length + 4
              : next.length;
          const wait = this.limiter.reserve(estimatedBytes);
          if (wait > 0) {
            await delay(wait);
          }
        }
        if (this.outboundFramer && this.flowController) {
          const pending = this.flowController.enqueue(next, this.outboundFramer);
          if (pending) {
            try {
              await pending;
            } catch (err) {
              this.emit(
                "error",
                err instanceof Error ? err : new Error(String(err)),
              );
            }
          }
          continue;
        }
        if (this.outboundFramer) {
          this.outboundFramer.encodeToBatch(next);
          continue;
        }
        const framed =
          this.options.framing === "length-prefixed" && this.framer
            ? this.framer.encode(next)
            : next;
        const wrote = this.socket.write(framed);
        if (!wrote) {
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              const sock = this.socket as unknown as {
                off?: (event: string, cb: (...args: any[]) => void) => void;
              };
              sock?.off?.("error", onError);
              resolve();
            };
            const onError = (err: Error) => {
              const sock = this.socket as unknown as {
                off?: (event: string, cb: (...args: any[]) => void) => void;
              };
              sock?.off?.("drain", onDrain);
              reject(err);
            };
            const sock = this.socket as unknown as {
              once?: (event: string, cb: (...args: any[]) => void) => void;
            };
            sock?.once?.("drain", onDrain);
            sock?.once?.("error", onError);
          });
        }
      }
    }
    if (this.outboundFramer && this.flowController) {
      await this.flowController.flushPending(this.outboundFramer);
    }
    this.draining = false;
    if (this.queue.length > 0) {
      void this.drainQueue();
    }
  }

  public async enqueueHandshake(): Promise<void> {
    const signerPayload = (this.options.handshakeSigner?.() ??
      {}) as Partial<HandshakePayload>;
    const tlsTags = this.buildTlsHandshakeTags();
    const mergedTags = {
      ...(this.options.handshakeTags ?? {}),
      ...(signerPayload.tags ?? {}),
      ...(tlsTags ?? {}),
    };
    const finalTags =
      Object.keys(mergedTags).length > 0 ? mergedTags : undefined;
    const payload = handshakePayloadSchema.parse({
      type: "handshake",
      ...signerPayload,
      version: signerPayload.version ?? this.options.protocolVersion,
      tags: finalTags,
    });
    await this.enqueueSendAsync(payload, { priority: -100 });
  }

  /**
   * Async version of enqueueSend that waits for the drain to complete
   */
  private async enqueueSendAsync(
    payload: Payload,
    options?: SendOptions,
  ): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      if (this.options.requireConnectedForSend) {
        throw new Error("QWormholeClient is not connected");
      }
      return;
    }
    this.recordNegentropicSample(payload);
    const serialized = this.options.serializer(payload);
    this.queue.enqueue(serialized, options?.priority ?? 0);
    await this.drainQueue();
  }

  private startHeartbeat(): void {
    if (!this.options.heartbeatIntervalMs) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket || this.socket.destroyed) return;
      const payload = this.options.heartbeatPayload ?? {
        type: "ping",
        ts: Date.now(),
      };
      this.enqueueSend(payload, { priority: 100 });
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private recordNegentropicSample(payload: Payload): void {
    if (!this.flowController) return;
    this.flowController.recordMessageType(inferMessageType(payload));
  }

  private shouldEnableCoherence(): boolean {
    if (this.options.coherence?.enabled !== undefined) {
      return this.options.coherence.enabled;
    }
    return process.env.QWORMHOLE_COHERENCE === "1";
  }

  private buildTlsHandshakeTags(): Record<string, string | number> | undefined {
    if (!this.socket) return;
    const socket = this.socket as QWormholeSocketLike;
    const tags: Record<string, string> = {};

    const peer = socket.getPeerCertificate?.(true) as
      | (tls.PeerCertificate & { fingerprint256?: string })
      | { fingerprint?: string; fingerprint256?: string }
      | null
      | undefined;
    if (peer && Object.keys(peer).length) {
      if (peer.fingerprint256) tags.tlsFingerprint256 = peer.fingerprint256;
      if (peer.fingerprint) tags.tlsFingerprint = peer.fingerprint;
    }

    if (socket.alpnProtocol) {
      tags.tlsAlpn = socket.alpnProtocol;
    } else {
      const tlsInfo = socket.getTlsInfo?.();
      if (tlsInfo?.alpnProtocol) {
        tags.tlsAlpn = tlsInfo.alpnProtocol;
      }
      if (tlsInfo?.peerFingerprint256) {
        tags.tlsFingerprint256 = tlsInfo.peerFingerprint256;
      }
      if (tlsInfo?.peerFingerprint) {
        tags.tlsFingerprint = tlsInfo.peerFingerprint;
      }
    }

    const exported = this.exportTlsSessionKey(socket);
    if (exported) tags.tlsSessionKey = exported;
    return Object.keys(tags).length ? tags : undefined;
  }

  private exportTlsSessionKey(
    socket: Pick<QWormholeSocketLike, "exportKeyingMaterial">,
  ): string | undefined {
    if (!this.options.tls?.exportKeyingMaterial) return undefined;
    if (typeof socket.exportKeyingMaterial !== "function") return undefined;
    const label =
      this.options.tls.exportKeyingMaterial.label ?? "qwormhole-negentropic";
    const length = this.options.tls.exportKeyingMaterial.length ?? 32;
    const context =
      this.options.tls.exportKeyingMaterial.context ?? Buffer.alloc(0);
    try {
      const material = socket.exportKeyingMaterial(length, label, context);
      if (!material) return undefined;
      return material.toString("base64");
    } catch {
      return undefined;
    }
  }
}
