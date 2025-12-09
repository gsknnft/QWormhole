import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { KcpConfig, DEFAULT_KCP_CONFIG } from "./kcp-config";
import { MuxSession } from "../../core/mux/mux-session";

type KcpModule = any;

function loadKcp(): KcpModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node-kcp");
}

export interface KcpServerOptions extends KcpConfig {
  listenPort: number;
}

interface SessionState {
  kcp: any;
  mux: MuxSession;
  lastSeen: number;
  context: { address: string; port: number };
}

/**
 * KCP server that maintains one KCP instance per remote endpoint.
 * Simplified for LAN/point-to-point use; no session cleanup/keepalive yet.
 */
export class KcpServer extends EventEmitter {
  private socket: dgram.Socket;
  private sessions = new Map<string, SessionState>();
  private timer?: NodeJS.Timeout;
  private kcpModule: KcpModule;

  constructor(private opts: KcpServerOptions) {
    super();
    this.kcpModule = loadKcp();
    this.socket = dgram.createSocket("udp4");
  }

  start(): void {
    const merged: KcpConfig = {
      ...DEFAULT_KCP_CONFIG,
      ...this.opts,
      nodelay: { ...DEFAULT_KCP_CONFIG.nodelay, ...(this.opts.nodelay ?? {}) },
    };
    this.socket.on("message", (msg, rinfo) => {
      const key = `${rinfo.address}:${rinfo.port}`;
      let session = this.sessions.get(key);
      if (!session) {
        const kcp = new this.kcpModule.KCP(merged.conv, {
          address: rinfo.address,
          port: rinfo.port,
        });
        kcp.nodelay(
          merged.nodelay!.nodelay,
          merged.nodelay!.interval,
          merged.nodelay!.resend,
          merged.nodelay!.nc,
        );
        kcp.wndsize(merged.sndWnd ?? DEFAULT_KCP_CONFIG.sndWnd, merged.rcvWnd ?? DEFAULT_KCP_CONFIG.rcvWnd);
        kcp.setmtu(merged.mtu ?? DEFAULT_KCP_CONFIG.mtu);
        kcp.stream(merged.stream ?? DEFAULT_KCP_CONFIG.stream);
        if (merged.ackNodelay) kcp.acknodelay(1);
        kcp.output((data: Buffer, size: number, context: { address: string; port: number }) => {
          this.socket.send(data, 0, size, context.port, context.address);
        });
        const mux = new MuxSession(buf => kcp.send(buf));
        session = { kcp, mux, lastSeen: Date.now(), context: { address: rinfo.address, port: rinfo.port } };
        this.sessions.set(key, session);
        this.emit("session", { key, mux });
      }
      session.lastSeen = Date.now();
      session.kcp.input(msg);
    });

    this.socket.bind(this.opts.listenPort);

    this.timer = setInterval(() => this.tick(), merged.updateIntervalMs ?? DEFAULT_KCP_CONFIG.updateIntervalMs);
    if (this.timer.unref) this.timer.unref();
    this.emit("listening", { port: this.opts.listenPort });
  }

  private tick(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastSeen > 30_000) {
        this.sessions.delete(key);
        this.emit("session:end", key);
        continue;
      }

      // lightweight keepalive
      session.kcp.send(Buffer.from([0]));
      session.kcp.update(now);
      for (;;) {
        const pkt = session.kcp.recv();
        if (!pkt) break;
        const data = pkt instanceof Buffer ? new Uint8Array(pkt) : new Uint8Array(pkt as ArrayBuffer);
        this.emit("data", { key, data });
        session.mux.receiveRaw(data);
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket.close();
    this.sessions.clear();
    this.emit("close");
  }
}
