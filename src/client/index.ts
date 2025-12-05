import net from "node:net";
import tls from "node:tls";
import { LengthPrefixedFramer } from "../framing";
import { BatchFramer } from "../batch-framer";
import { defaultSerializer, bufferDeserializer } from "../codecs";
import { TypedEventEmitter } from "../typedEmitter";
import { resolveInterfaceAddress } from "../utils/netUtils";
import { QWormholeError } from "../errors";
import { TokenBucket, PriorityQueue, delay } from "../qos";
import { handshakePayloadSchema, type HandshakePayload } from "../schema/scp";
import { createFlowController, type FlowController } from "../flow-controller";
import type { EntropyMetrics } from "../handshake/entropy-policy";
import type {
  QWormholeClientEvents,
  QWormholeClientOptions,
  QWormholeReconnectOptions,
  Payload,
  Deserializer,
  Serializer,
  SendOptions,
} from "src/types/types";

const DEFAULT_RECONNECT: QWormholeReconnectOptions = {
  enabled: true,
  initialDelayMs: 300,
  maxDelayMs: 10_000,
  multiplier: 2,
  maxAttempts: Number.POSITIVE_INFINITY,
};

type InternalOptions<TMessage> = Omit<
  QWormholeClientOptions<TMessage>,
  "reconnect"
> & {
  reconnect: QWormholeReconnectOptions;
  serializer: Serializer;
  deserializer: Deserializer<TMessage>;
  framing: "length-prefixed" | "none";
  rateLimitBytesPerSec?: number;
  rateLimitBurstBytes?: number;
  handshakeSigner?: () => Record<string, unknown>;
  heartbeatIntervalMs?: number;
  heartbeatPayload?: Payload;
};

type TrustSnapshotReason = "close" | "error" | "disconnect";

export class QWormholeClient<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeClientEvents<TMessage>
> {
  public socket?: net.Socket;
  private hadSocketError = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private readonly options: InternalOptions<TMessage>;
  private readonly framer?: LengthPrefixedFramer;
  private readonly outboundFramer?: BatchFramer;
  private flowController?: FlowController;
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
      this.flowController = createFlowController(this.entropyMetrics, {
        peerIsNative: this.peerIsNative,
      });
      this.outboundFramer.on("backpressure", ({ queuedBytes }) => {
        this.flowController?.onBackpressure(queuedBytes);
      });
      this.outboundFramer.on("drain", () => {
        this.flowController?.onDrain();
      });
    }
    if (this.options.rateLimitBytesPerSec) {
      this.limiter = new TokenBucket(
        this.options.rateLimitBytesPerSec,
        this.options.rateLimitBurstBytes,
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

      const socket = this.options.tls?.enabled
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
                this.options.tls.requestCert ??
                false,
            },
            () => {
              settled = true;
              this.clearConnectTimer();
              this.reconnectAttempts = 0;
              this.attachOutboundFramer(socket);
              if (this.options.protocolVersion) {
                this.enqueueHandshake();
              }
              this.emit("connect", undefined as never);
              this.emit("ready", undefined as never);
              this.startHeartbeat();
              resolve();
            },
          )
        : net.createConnection(
            {
              host: this.options.host,
              port: this.options.port,
              localAddress,
              localPort: this.options.localPort,
            },
            () => {
              settled = true;
              this.clearConnectTimer();
              this.reconnectAttempts = 0;
              this.attachOutboundFramer(socket);
              if (this.options.protocolVersion) {
                this.enqueueHandshake();
              }
              this.emit("connect", undefined as never);
              this.emit("ready", undefined as never);
              this.startHeartbeat();
              resolve();
            },
          );

      this.socket = socket;
      const closeToken = ++this.socketTokenCounter;
      this.currentSocketToken = closeToken;

      if (this.options.keepAlive) {
        socket.setKeepAlive(true, this.options.keepAliveDelayMs);
      }
      if (this.options.idleTimeoutMs) {
        socket.setTimeout(this.options.idleTimeoutMs);
      }

      socket.on("data", chunk => this.handleData(chunk));
      socket.on("close", hadError => this.handleClose(hadError, closeToken));
      socket.on("timeout", () => {
        this.emit("timeout", undefined as never);
        socket.end();
      });

      socket.on("error", err => {
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
          socket.destroy();
          reject(
            new QWormholeError("E_CONNECT_TIMEOUT", "Connection timed out"),
          );
        }, this.options.connectTimeoutMs);
        return 0;
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
      tls: options.tls,
      entropyMetrics: options.entropyMetrics,
      peerIsNative: options.peerIsNative,
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

  private attachOutboundFramer(socket: net.Socket): void {
    this.outboundFramer?.attachSocket(socket);
  }

  private detachOutboundFramer(): void {
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
    const serialized = this.options.serializer(payload);
    this.queue.enqueue(serialized, options?.priority ?? 0);
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length > 0) {
      if (!this.socket || this.socket.destroyed) break;
      const next = this.queue.dequeue();
      if (!next) break;
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
        await this.flowController.enqueue(next, this.outboundFramer);
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
            this.socket?.off("error", onError);
            resolve();
          };
          const onError = (err: Error) => {
            this.socket?.off("drain", onDrain);
            reject(err);
          };
          this.socket?.once("drain", onDrain);
          this.socket?.once("error", onError);
        });
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
  private async enqueueSendAsync(payload: Payload, options?: SendOptions): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      if (this.options.requireConnectedForSend) {
        throw new Error("QWormholeClient is not connected");
      }
      return;
    }
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

  private buildTlsHandshakeTags(): Record<string, string | number> | undefined {
    if (!this.socket || !(this.socket instanceof tls.TLSSocket)) return;
    const tags: Record<string, string> = {};
    const peer = this.socket.getPeerCertificate?.(true) as
      | (tls.PeerCertificate & { fingerprint256?: string })
      | null;
    if (peer && Object.keys(peer).length) {
      if (peer.fingerprint256) tags.tlsFingerprint256 = peer.fingerprint256;
      if (peer.fingerprint) tags.tlsFingerprint = peer.fingerprint;
    }
    if (this.socket.alpnProtocol) {
      tags.tlsAlpn = this.socket.alpnProtocol;
    }
    const exported = this.exportTlsSessionKey(this.socket);
    if (exported) tags.tlsSessionKey = exported;
    return Object.keys(tags).length ? tags : undefined;
  }

  private exportTlsSessionKey(socket: tls.TLSSocket): string | undefined {
    if (!this.options.tls?.exportKeyingMaterial) return undefined;
    if (typeof socket.exportKeyingMaterial !== "function") return undefined;
    const label =
      this.options.tls.exportKeyingMaterial.label ?? "qwormhole-negentropic";
    const length = this.options.tls.exportKeyingMaterial.length ?? 32;
    const context =
      this.options.tls.exportKeyingMaterial.context ?? Buffer.alloc(0);
    try {
      const material = socket.exportKeyingMaterial(length, label, context);
      return material.toString("base64");
    } catch {
      return undefined;
    }
  }
}
