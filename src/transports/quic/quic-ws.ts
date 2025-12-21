import { EventEmitter } from "events"; // if you have a browser EventEmitter polyfill; otherwise swap to a tiny emitter
import type { QWormholeTransport } from "../transport";

type QuicWebStats = {
  state?: "new" | "ready" | "closed" | "failed";
};

export class QuicWebTransport extends EventEmitter implements QWormholeTransport {
  readonly type = "quic" as const;

  public stats: QuicWebStats = { state: "new" };
  private wt: WebTransport;

  private stream!: WebTransportBidirectionalStream;
  private writer!: WritableStreamDefaultWriter<Uint8Array>;
  private reader!: ReadableStreamDefaultReader<Uint8Array>;

  private reading = false;

  constructor(private url: string) {
    super();
    this.wt = new WebTransport(url);
  }

  onError(cb: (err: Error) => void): void {
    this.on("error", cb);
  }

  async connect(): Promise<void> {
    try {
      await this.wt.ready;
      this.stream = await this.wt.createBidirectionalStream();
      this.writer = this.stream.writable.getWriter();
      this.reader = this.stream.readable.getReader();
      this.stats.state = "ready";
      this.emit("connect");
    } catch (err) {
      this.stats.state = "failed";
      throw err;
    }
  }

  onData(cb: (data: Uint8Array) => void): void {
    if (this.reading) return;
    this.reading = true;

    void (async () => {
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) cb(value);
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.reading = false;
      }
    })();
  }

  send(data: Uint8Array): void {
    if (!this.writer) {
      this.emit("error", new Error("WebTransport not connected"));
      return;
    }

    void this.writer.write(data).catch(err => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });
  }


  getStats(): QuicWebStats {
    return { ...this.stats };
  }

    sendDatagram(data: Uint8Array): void {
      if (!this.wt.datagrams?.writable) return;
      const writer = this.wt.datagrams.writable.getWriter();
      void writer.write(data).finally(() => writer.releaseLock());
    }

    onDatagram(cb: (data: Uint8Array) => void): void {
      if (!this.wt.datagrams?.readable) return;
      const reader = this.wt.datagrams.readable.getReader();

      void (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) cb(value);
        }
      })();
    }


  close(): void {
    // fire-and-forget close; surface errors via error event
    void (async () => {
      try {
        try { await this.reader?.cancel(); } catch {}
        try { await this.writer?.close(); } catch {}
        try { this.reader?.releaseLock(); } catch {}
        try { this.writer?.releaseLock(); } catch {}
        try { await this.wt.close(); } catch {}

        this.stats.state = "closed";
        this.emit("close");
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }
}
