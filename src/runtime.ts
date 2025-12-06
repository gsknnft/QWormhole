import { createQWormholeClient, createQWormholeServer } from "./factory";
import { bufferDeserializer, defaultSerializer } from "./codecs";
import {
  QWormholeClient,
  QWormholeServer,
  QWormholeClientOptions,
  QWormholeServerOptions,
  NativeQWormholeServer,
  NativeTcpClient,
} from "./index";

export interface QWormholeRuntimeOptions<TMessage = unknown> {
  protocolVersion?: string;
  handshakeTags?: Record<string, string | number>;
  preferNative?: boolean;
  forceTs?: boolean;
  interfaceName?: string;
  localAddress?: string;
  localPort?: number;
  rateLimitBytesPerSec?: number;
  rateLimitBurstBytes?: number;
  serializer?: QWormholeClientOptions<TMessage>["serializer"];
  deserializer?: QWormholeClientOptions<TMessage>["deserializer"];
}

export class QWormholeRuntime<TMessage = Buffer> {
  private readonly opts: QWormholeRuntimeOptions<TMessage>;

  constructor(options: QWormholeRuntimeOptions<TMessage> = {}) {
    this.opts = options;
  }

  createClient(
    options: Omit<
      QWormholeClientOptions<TMessage>,
      "serializer" | "deserializer"
    >,
  ): QWormholeClient<TMessage> | NativeTcpClient {
    const merged: QWormholeClientOptions<TMessage> = {
      serializer: (this.opts.serializer ??
        defaultSerializer) as QWormholeClientOptions<TMessage>["serializer"],
      deserializer: (this.opts.deserializer ??
        bufferDeserializer) as QWormholeClientOptions<TMessage>["deserializer"],
      protocolVersion: this.opts.protocolVersion,
      handshakeTags: this.opts.handshakeTags,
      interfaceName: this.opts.interfaceName,
      localAddress: this.opts.localAddress,
      localPort: this.opts.localPort,
      rateLimitBytesPerSec: this.opts.rateLimitBytesPerSec,
      rateLimitBurstBytes: this.opts.rateLimitBurstBytes,
      ...options,
    };
    const { client } = createQWormholeClient<TMessage>({
      ...merged,
      preferNative: this.opts.preferNative,
      forceTs: this.opts.forceTs,
    });
    return client;
  }

  createServer(
    options: Omit<
      QWormholeServerOptions<TMessage>,
      "serializer" | "deserializer"
    >,
  ): QWormholeServer<TMessage> | NativeQWormholeServer<TMessage> {
    const merged: QWormholeServerOptions<TMessage> = {
      serializer: (this.opts.serializer ??
        defaultSerializer) as QWormholeServerOptions<TMessage>["serializer"],
      deserializer: (this.opts.deserializer ??
        bufferDeserializer) as QWormholeServerOptions<TMessage>["deserializer"],
      protocolVersion: this.opts.protocolVersion,
      handshakeTags: this.opts.handshakeTags,
      rateLimitBytesPerSec: this.opts.rateLimitBytesPerSec,
      rateLimitBurstBytes: this.opts.rateLimitBurstBytes,
      ...options,
    };
    const { server } = createQWormholeServer<TMessage>({
      ...merged,
      preferNative: this.opts.preferNative,
      forceTs: this.opts.forceTs,
    });
    return server;
  }
}
