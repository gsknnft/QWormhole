import { createQWormholeClient, createQWormholeServer } from "./factory";
import { bufferDeserializer, defaultSerializer } from "./codecs";
import { BaseRuntime, type RuntimeOptions } from "./base-runtime";
import { QWormholeClient } from "../client";
import { QWormholeServer } from "../server";
import {
  QWormholeClientOptions,
  INativeTcpClient,
  Payload,
  QWormholeServerOptions,
} from "../types";
import { NativeQWormholeServer } from "./native-server";
import { resolveBindHost } from "../security/env";

export interface QWormholeRuntimeOptions<TMessage = unknown>
  extends RuntimeOptions {
  interfaceName?: string;
  localAddress?: string;
  localPort?: number;
  rateLimitBytesPerSec?: number;
  rateLimitBurstBytes?: number;
  serializer?: QWormholeClientOptions<TMessage>["serializer"];
  deserializer?: QWormholeClientOptions<TMessage>["deserializer"];
}

export class QWormholeRuntime<TMessage = Buffer> extends BaseRuntime<
  TMessage,
  QWormholeRuntimeOptions<TMessage>
> {
  private client?: QWormholeClient<TMessage> | INativeTcpClient;
  private server?: QWormholeServer<TMessage> | NativeQWormholeServer<TMessage>;

  constructor(options: QWormholeRuntimeOptions<TMessage> = {}) {
    super(options);
  }

  createClient(
    options: Omit<
      QWormholeClientOptions<TMessage>,
      "serializer" | "deserializer"
    >,
  ): QWormholeClient<TMessage> | INativeTcpClient {
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
      detectNative: this.opts.detectNative,
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
      detectNative: this.opts.detectNative,
    });
    return server;
  }

  async listen(port = 0, host = resolveBindHost("0.0.0.0")): Promise<void> {
    await this.init();
    await this.closeServer();
    const server = this.createServer({ host, port });
    this.server = server;
    this.attachServer(server);
    await server.listen();
  }

  async connect(endpoint: string): Promise<void> {
    await this.init();
    await this.closeClient();
    const { host, port } = resolveEndpoint(endpoint);
    const client = this.createClient({ host, port });
    if (!(client instanceof QWormholeClient)) {
      throw new Error(
        "QWormholeRuntime.connect requires a TS client. Set forceTs: true or preferNative: false.",
      );
    }
    this.client = client;
    this.attachClient(client);
    await client.connect();
  }

  async send(msg: TMessage): Promise<void> {
    if (this.client instanceof QWormholeClient) {
      await this.client.send(msg as unknown as Payload);
      return;
    }
    if (this.client) {
      this.client.send(msg as unknown as string | Buffer);
      return;
    }
    if (this.server) {
      this.server.broadcast(msg as unknown as Payload);
      return;
    }
    throw new Error("QWormholeRuntime.send called without an active client or server.");
  }

  async close(): Promise<void> {
    await this.closeClient();
    await this.closeServer();
  }

  private attachClient(client: QWormholeClient<TMessage>): void {
    client.on("connect", () => this.emit("connect"));
    client.on("ready", () => this.emit("ready"));
    client.on("message", message => this.emit("message", message));
    client.on("error", err => this.emit("error", err));
    client.on("timeout", () => this.emit("timeout"));
    client.on("reconnecting", info => this.emit("reconnecting", info));
    client.on("close", evt => this.emit("close", evt));
  }

  private attachServer(
    server: QWormholeServer<TMessage> | NativeQWormholeServer<TMessage>,
  ): void {
    server.on("listening", info => this.emit("listening", info));
    server.on("connection", client => this.emit("connection", client));
    server.on("message", ({ data }) => this.emit("message", data));
    server.on("backpressure", info => this.emit("backpressure", info));
    server.on("drain", info => this.emit("drain", info));
    server.on("clientClosed", info => this.emit("clientClosed", info));
    server.on("error", err => this.emit("error", err));
    server.on("close", () => this.emit("close"));
  }

  private async closeClient(): Promise<void> {
    if (!this.client) return;
    if (this.client instanceof QWormholeClient) {
      await this.client.disconnect();
    } else {
      this.client.close();
    }
    this.client = undefined;
  }

  private async closeServer(): Promise<void> {
    if (!this.server) return;
    await this.server.close();
    this.server = undefined;
  }
}

const resolveEndpoint = (endpoint: string): { host: string; port: number } => {
  const normalized = endpoint.includes("://") ? endpoint : `tcp://${endpoint}`;
  const url = new URL(normalized);
  const port = Number(url.port);
  if (!url.hostname || !port) {
    throw new Error(`Invalid endpoint "${endpoint}". Expected host:port or tcp://host:port.`);
  }
  return { host: url.hostname, port };
};
