import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { KcpConfig, DEFAULT_KCP_CONFIG } from "./kcp-config";
import { MuxSession } from "../../core/mux/mux-session";
import type { QWormholeTransport } from "../transport";

type KcpModule = any;

function loadKcp(): KcpModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node-kcp");
}

export interface KcpEndpoint {
  address: string;
  port: number;
}

export interface KcpSessionOptions extends KcpConfig {
  localPort?: number;
}

/**
 * Single-connection KCP session over UDP.
 * Binds a UDP socket locally and targets a remote endpoint.
 */
export class KcpSession extends EventEmitter implements QWormholeTransport {
  private socket: dgram.Socket;
  private kcp: any;
  private timer?: NodeJS.Timeout;
  public readonly mux: MuxSession;
  
  constructor(
    remote: KcpEndpoint,
    cfg: KcpSessionOptions,
  ) {
    super();
    const kcpModule = loadKcp();
    const merged: KcpConfig = {
      ...DEFAULT_KCP_CONFIG,
      ...cfg,
      nodelay: { ...DEFAULT_KCP_CONFIG.nodelay, ...(cfg.nodelay ?? {}) },
    };
    this.socket = dgram.createSocket("udp4");
    if (cfg.localPort) {
      this.socket.bind(cfg.localPort);
    }

    this.kcp = new kcpModule.KCP(merged.conv, {
      address: remote.address,
      port: remote.port,
    });
    this.kcp.nodelay(
      merged.nodelay!.nodelay,
      merged.nodelay!.interval,
      merged.nodelay!.resend,
      merged.nodelay!.nc,
    );
    this.kcp.wndsize(merged.sndWnd ?? DEFAULT_KCP_CONFIG.sndWnd, merged.rcvWnd ?? DEFAULT_KCP_CONFIG.rcvWnd);
    this.kcp.setmtu(merged.mtu ?? DEFAULT_KCP_CONFIG.mtu);
    this.kcp.stream(merged.stream ?? DEFAULT_KCP_CONFIG.stream);
    if (merged.ackNodelay) this.kcp.acknodelay(1);

    this.kcp.output((data: Buffer, size: number, context: KcpEndpoint) => {
      this.socket.send(data, 0, size, context.port, context.address);
    });

    this.mux = new MuxSession(buf => this.send(buf));

    this.socket.on("message", msg => {
      this.kcp.input(msg);
    });

    this.startLoop(merged.updateIntervalMs ?? DEFAULT_KCP_CONFIG.updateIntervalMs);
  }

  private startLoop(intervalMs: number): void {
    const step = () => {
      this.kcp.update(Date.now());
      for (;;) {
        const pkt = this.kcp.recv();
        if (!pkt) break;
        const data = pkt instanceof Buffer ? new Uint8Array(pkt) : new Uint8Array(pkt as ArrayBuffer);
        this.emit("data", data);
        this.mux.receiveRaw(data);
      }
    };
    this.timer = setInterval(step, intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  connect(): Promise<void> {
    // KCP over UDP is connectionless; nothing to do beyond socket bind.
    return Promise.resolve();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  send(data: Uint8Array): void {
    this.kcp.send(data);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket.close();
    this.emit("close");
  }
}
