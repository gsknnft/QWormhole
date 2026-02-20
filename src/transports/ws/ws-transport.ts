import { EventEmitter } from "events";
import WebSocket, { WebSocketServer } from "ws";
import { MuxSession } from "../mux/mux-session";
import type { QWormholeTransport } from "../transport";

export class WSTransport extends EventEmitter implements QWormholeTransport {
  readonly type = "ws" as const;
  public socket: WebSocket | null = null;
  public mux: MuxSession | null = null;

  constructor(private url: string) {
    super();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.socket = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        this.emit("open");
        resolve();
      };

      ws.onmessage = evt => {
        const data =
          evt.data instanceof ArrayBuffer
            ? new Uint8Array(evt.data)
            : typeof evt.data === "string"
              ? new TextEncoder().encode(evt.data)
              : new Uint8Array();
        this.emit("data", data);
        this.mux?.receiveRaw(data);
      };

      ws.onerror = err => {
        this.emit("error", err);
        reject(err);
      };
      ws.onclose = () => this.emit("close");

      this.mux = new MuxSession(buf => this.send(buf));
      this.emit("mux", this.mux);
    });
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  send(data: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(data);
  }

  close(): void {
    if (this.socket) this.socket.close();
  }
}

export class WSTransportServer extends EventEmitter {
  private wss: WebSocketServer | null = null;

  constructor(private port: number) {
    super();
  }

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on("connection", ws => {
      const transport = new WSTransport("");
      transport.socket = ws;
      ws.binaryType = "arraybuffer";
      transport.mux = new MuxSession(buf => transport.send(buf));
      ws.on("message", data => {
        const u8 =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : typeof data === "string"
              ? new TextEncoder().encode(data)
              : new Uint8Array();
        transport.emit("data", u8);
        transport.mux?.receiveRaw(u8);
      });
      ws.on("close", () => transport.emit("close"));
      ws.on("error", err => transport.emit("error", err));
      this.emit("connection", transport);
    });
    this.emit("listening", { port: this.port });
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
  }
}
