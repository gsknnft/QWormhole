import { BrowserEmitter } from "./emitter";
import type { BrowserTransport, BrowserTransportEvents, BrowserTransportStats } from "./types";

interface BrowserWebTransportCtor {
  new (url: string): BrowserWebTransportHandle;
}

interface BrowserWebTransportHandle {
  ready: Promise<void>;
  closed: Promise<unknown>;
  close(): Promise<void> | void;
  createBidirectionalStream(): Promise<BrowserBidirectionalStream>;
}

interface BrowserBidirectionalStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

export class BrowserWebTransportClient
  extends BrowserEmitter<BrowserTransportEvents>
  implements BrowserTransport
{
  readonly kind = "webtransport" as const;
  private transport: BrowserWebTransportHandle | null = null;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private readonly stats: BrowserTransportStats = { state: "idle" };

  constructor(private readonly url: string) {
    super();
  }

  async connect(): Promise<void> {
    const WebTransportCtor = (globalThis as typeof globalThis & {
      WebTransport?: BrowserWebTransportCtor;
    }).WebTransport;
    if (!WebTransportCtor) {
      this.stats.state = "failed";
      throw new Error("WebTransport is not available in this browser environment.");
    }

    this.stats.state = "connecting";
    const transport = new WebTransportCtor(this.url);
    this.transport = transport;

    try {
      await transport.ready;
      const stream = await transport.createBidirectionalStream();
      this.writer = stream.writable.getWriter();
      this.reader = stream.readable.getReader();
      this.stats.state = "open";
      this.emit("open");
      void this.readLoop();
    } catch (error) {
      this.stats.state = "failed";
      throw normalizeError(error);
    }

    void transport.closed
      .then(() => {
        this.stats.state = "closed";
        this.emit("close");
      })
      .catch((error) => {
        this.stats.state = "failed";
        this.emit("error", normalizeError(error));
      });
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error("Browser WebTransport client is not connected.");
    }
    await this.writer.write(data);
  }

  async close(): Promise<void> {
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      await this.writer?.close();
    } catch {}
    try {
      this.reader?.releaseLock();
    } catch {}
    try {
      this.writer?.releaseLock();
    } catch {}
    await this.transport?.close();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  onError(cb: (err: Error) => void): void {
    this.on("error", cb);
  }

  getStats(): BrowserTransportStats {
    return { ...this.stats };
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;
    try {
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) break;
        if (value) this.emit("data", value);
      }
    } catch (error) {
      this.stats.state = "failed";
      this.emit("error", normalizeError(error));
    }
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
