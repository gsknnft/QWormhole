import net from "node:net";
import { LengthPrefixedFramer } from "./framing";
import { defaultSerializer, bufferDeserializer } from "./codecs";
import { TypedEventEmitter } from "./typedEmitter";
import { resolveInterfaceAddress } from "./netUtils";
import { QWormholeError } from "./errors";
import { TokenBucket, PriorityQueue, delay } from "./qos";
import type {
  QWormholeClientEvents,
  QWormholeClientOptions,
  QWormholeReconnectOptions,
  Payload,
  Deserializer,
  Serializer,
  SendOptions,
} from "types";

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
};

export class QWormholeClient<TMessage = Buffer> extends TypedEventEmitter<
  QWormholeClientEvents<TMessage>
> {
  public socket?: net.Socket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private readonly options: InternalOptions<TMessage>;
  private readonly framer?: LengthPrefixedFramer;
  private connectTimer?: NodeJS.Timeout;
  private readonly queue = new PriorityQueue<{
    buffer: Buffer;
    priority: number;
  }>();
  private readonly limiter?: TokenBucket;
  private draining = false;

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

      const socket = net.createConnection(
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
          if (this.options.protocolVersion) {
            this.enqueueHandshake();
          }
          this.emit("connect", undefined as never);
          this.emit("ready", undefined as never);
          resolve();
        },
      );

      this.socket = socket;

      if (this.options.keepAlive) {
        socket.setKeepAlive(true, this.options.keepAliveDelayMs);
      }
      if (this.options.idleTimeoutMs) {
        socket.setTimeout(this.options.idleTimeoutMs);
      }

      socket.on("data", chunk => this.handleData(chunk));
      socket.on("close", hadError => this.handleClose(hadError));
      socket.on("timeout", () => {
        this.emit("timeout", undefined as never);
        socket.end();
      });

      socket.on("error", err => {
        if (!settled) {
          settled = true;
          this.clearConnectTimer();
          reject(err);
        }
        this.emit("error", err);
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
      }
    });
  }

  public send(payload: Payload, options?: SendOptions): void {
    this.enqueueSend(payload, options);
  }

  public disconnect(): void {
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.socket?.end();
    this.socket?.destroy();
    this.socket = undefined;
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

  private handleClose(hadError: boolean): void {
    this.emit("close", { hadError });
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

  private enqueueSend(payload: Payload, options?: SendOptions): void {
    if (!this.socket || this.socket.destroyed) {
      if (this.options.requireConnectedForSend) {
        throw new Error("QWormholeClient is not connected");
      }
      return;
    }
    const serialized = this.options.serializer(payload);
    const framed =
      this.options.framing === "length-prefixed" && this.framer
        ? this.framer.encode(serialized)
        : serialized;
    this.queue.enqueue({ buffer: framed, priority: options?.priority ?? 0 });
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
        const wait = this.limiter.reserve(next.buffer.length);
        if (wait > 0) {
          await delay(wait);
        }
      }
      const wrote = this.socket.write(next.buffer);
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
    this.draining = false;
  }

  public async enqueueHandshake(): Promise<void> {
    const payload =
      this.options.handshakeSigner?.() ?? {
        type: "handshake",
        version: this.options.protocolVersion,
        tags: this.options.handshakeTags,
      };
    this.enqueueSend(payload, { priority: -100 });
  }
}
