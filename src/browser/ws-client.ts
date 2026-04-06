import { BrowserEmitter } from "./emitter";
import type { BrowserTransport, BrowserTransportEvents, BrowserTransportStats } from "./types";

export class BrowserWSTransport
  extends BrowserEmitter<BrowserTransportEvents>
  implements BrowserTransport
{
  readonly kind = "ws" as const;
  private socket: WebSocket | null = null;
  private readonly stats: BrowserTransportStats = { state: "idle" };

  constructor(private readonly url: string, private readonly protocols?: string | string[]) {
    super();
  }

  connect(): Promise<void> {
    if (typeof WebSocket === "undefined") {
      const error = new Error("WebSocket is not available in this browser environment.");
      this.stats.state = "failed";
      return Promise.reject(error);
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    this.stats.state = "connecting";
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url, this.protocols);
      this.socket = socket;
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        this.stats.state = "open";
        this.stats.protocol = socket.protocol || undefined;
        this.emit("open");
        resolve();
      };

      socket.onmessage = (event) => {
        this.emit("data", toUint8Array(event.data));
      };

      socket.onerror = () => {
        const error = new Error("Browser WebSocket transport error.");
        this.stats.state = "failed";
        this.emit("error", error);
        reject(error);
      };

      socket.onclose = () => {
        this.stats.state = "closed";
        this.emit("close");
      };
    });
  }

  send(data: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.emit("error", new Error("Browser WebSocket transport is not connected."));
      return;
    }
    this.socket.send(data);
  }

  close(): void {
    this.socket?.close();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  onError(cb: (err: Error) => void): void {
    this.on("error", cb);
  }

  getStats(): BrowserTransportStats {
    return {
      ...this.stats,
      bufferedAmount: this.socket?.bufferedAmount ?? 0,
    };
  }
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Blob) return new Uint8Array();
  return new Uint8Array();
}
