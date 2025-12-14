// Implement a merge function for SCPState, verify function for SCPHandshake and SCPIntent, and analyze function for NegentropyVector. 
// // SCP Handshake module
// export interface SCPHandshake {
//   version: string;
//   sid: string;
//   caps: any;
//   nv: any;
//   ts: number;
//   sig: string;
// }
// export function verifyHandshake(handshake: SCPHandshake): boolean {

//implement a KCP client that uses MuxSession for multiplexing streams over a KCP transport
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { KcpConfig, DEFAULT_KCP_CONFIG } from "./kcp-config";
import { MuxSession } from "../mux/mux-session";
import type { QWormholeTransport } from "../transport";
export interface KcpClientOptions extends KcpConfig {
  localPort?: number;
}
/**
 * KCP client that connects to a remote KCP server over UDP.
 * Binds a UDP socket locally and connects to the specified remote endpoint.
 * Establishes a multiplexed session over KCP.
 */
export class KcpClient extends EventEmitter implements QWormholeTransport {
  readonly type: "kcp" = "kcp";
  private socket: dgram.Socket;
  private keepalive?: NodeJS.Timeout
  private lastActivity = Date.now();
  public readonly mux: MuxSession;
  private readonly cfg: Required<KcpConfig>
  private readonly remote: { address: string; port: number };

  constructor(remote: { address: string; port: number }, cfg: KcpClientOptions) {
    super();
    this.remote = remote;
    this.cfg = {
      ...DEFAULT_KCP_CONFIG,
      ...cfg,
      nodelay: { ...DEFAULT_KCP_CONFIG.nodelay, ...(cfg.nodelay ?? {}) },
    };
    this.socket = dgram.createSocket("udp4");
    if (cfg.localPort) {
      this.socket.bind(cfg.localPort);
    }
    this.mux = new MuxSession(buf => this.send(buf));
    this.socket.on("message", msg => {
      this.lastActivity = Date.now();
      const data = new Uint8Array(msg);
      this.emit("data", data);
      this.mux.receiveRaw(data);
    }
    );
  } 

  private startKeepalive(): void {
    const interval = this.cfg.updateIntervalMs ?? 10_000;
    if (this.keepalive) return;
    this.keepalive = setInterval(() => {
      const now = Date.now();
      if (now - this.lastActivity > interval * 2) {
        // Send a framed ping through mux so the peer can decode it safely.
        this.mux.sendFrame({
          streamId: 0,
          type: "data",
          payload: new Uint8Array([0x50, 0x49, 0x4e, 0x47]), // "PING"
        });
      }
    }, interval);
    if ((this.keepalive as any).unref) (this.keepalive as any).unref();
  }

  send(buf: Uint8Array): void {
    this.socket.send(buf, 0, buf.length, this.remote.port, this.remote.address);
  }

  close(): void {
    if (this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = undefined;
    }

    this.socket.close();
  }

  connect(): Promise<void> {
    this.startKeepalive();
    return Promise.resolve();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }
}


