import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { KcpConfig, DEFAULT_KCP_CONFIG } from "./kcp-config";
import { MuxSession } from "../mux/mux-session";
import type { QWormholeTransport } from "../transport";

export interface KcpEndpoint {
  address: string;
  port: number;
}

export interface KcpSessionOptions extends KcpConfig {
  localPort?: number;
}

type WireType = 0 | 1 | 2; // data, ack, ping
type WirePacket = {
  type: WireType;
  conv: number;
  seq: number;
  ack: number;
  payload: Uint8Array;
};

const HEADER_BYTES = 1 + 4 + 4 + 4 + 4; // type + conv + seq + ack + len
const MAX_RTO_MS = 400;
const MIN_RTO_MS = 20;
const DEFAULT_INTERVAL_MS = 10;

/**
 * KCP-like ARQ session over UDP. Sends mux frames reliably to a remote endpoint.
 * Pragmatic subset: cumulative ACKs, retransmit with backoff, basic RTT estimate.
 */
export class KcpSession extends EventEmitter implements QWormholeTransport {
  readonly type = "kcp" as const;
  private socket: dgram.Socket;
  private keepalive?: NodeJS.Timeout;
  private retransmit?: NodeJS.Timeout;
  private lastActivity = Date.now();
  public readonly mux: MuxSession;
  private readonly cfg: Required<KcpConfig>;
  private readonly remote: KcpEndpoint;
  private metrics = {
    writes: 0,
    bytesWritten: 0,
    bytesRead: 0,
    backpressure: 0,
    rttMs: 0,
    lossRate: 0,
  };

  // ARQ state
  private nextSeq = 1;
  private sndUna = 1; // lowest unacknowledged
  private rcvNxt = 1; // next expected incoming
  private readonly sndWnd: number;
  private readonly rcvWnd: number;
  private readonly mtu: number;
  private readonly pending = new Map<
    number,
    {
      payload: Uint8Array;
      ts: number;
      rto: number;
      retries: number;
      sent: boolean;
    }
  >();
  private readonly recvBuf = new Map<number, Uint8Array>();
  // congestion / timers
  private cwnd = 32;
  private ssthresh = 256;
  private srtt = 0;
  private rttVar = 0;
  private rto = 100;

  constructor(remote: KcpEndpoint, cfg: KcpSessionOptions) {
    super();
    this.remote = remote;
    this.cfg = {
      ...DEFAULT_KCP_CONFIG,
      ...cfg,
      nodelay: { ...DEFAULT_KCP_CONFIG.nodelay, ...(cfg.nodelay ?? {}) },
    };
    this.sndWnd = this.cfg.sndWnd;
    this.rcvWnd = this.cfg.rcvWnd;
    this.mtu = this.cfg.mtu;
    this.socket = dgram.createSocket("udp4");
    if (cfg.localPort) {
      this.socket.bind(cfg.localPort);
    }
    this.mux = new MuxSession(buf => this.send(buf));
    this.socket.on("message", msg => this.handleIncoming(new Uint8Array(msg)));
  }

private handleIncoming(msg: Uint8Array): void {
  this.lastActivity = Date.now();
  const packet = decodePacket(msg);
  if (!packet) return;
  if (packet.conv !== this.cfg.conv) return;

  if (packet.type === 0) {
    // DATA
    if (packet.seq >= this.rcvNxt && packet.seq < this.rcvNxt + this.rcvWnd) {
      this.recvBuf.set(packet.seq, packet.payload);
      // Advance rcvNxt while contiguous
      while (this.recvBuf.has(this.rcvNxt)) {
        const payload = this.recvBuf.get(this.rcvNxt)!;
        this.recvBuf.delete(this.rcvNxt);
        this.metrics.bytesRead += payload.byteLength;
        this.emit("data", payload);
        this.mux.receiveRaw(payload);
        this.rcvNxt += 1;
      }
    }
    // Always send cumulative ACK for highest contiguous
    this.sendWire({
      type: 1,
      conv: this.cfg.conv,
      seq: packet.seq,
      ack: this.rcvNxt - 1, // cumulative ACK
      payload: new Uint8Array(),
    });
  } else if (packet.type === 1) {
    // ACK
    const ack = packet.ack;
    let newlyAcked = 0;
    const now = Date.now();
    for (const seq of Array.from(this.pending.keys())) {
      if (seq <= ack) {
        const entry = this.pending.get(seq);
        if (entry) {
          const sample = now - entry.ts; // RTT sample
          this.updateRtt(sample);
          this.pending.delete(seq);
          newlyAcked += 1;
        }
      }
    }
    this.sndUna = Math.max(this.sndUna, ack + 1);
    if (newlyAcked > 0) {
      // AIMD: slow start / avoidance
      if (this.cwnd < this.ssthresh) {
        this.cwnd += newlyAcked;
      } else {
        const inc = Math.max(1, Math.floor(newlyAcked / Math.max(1, this.cwnd)));
        this.cwnd += inc;
      }
    }
  } else {
    // Ping: respond with ACK of last received
    this.sendWire({
      type: 1,
      conv: this.cfg.conv,
      seq: packet.seq,
      ack: this.rcvNxt - 1,
      payload: new Uint8Array(),
    });
  }
  this.emitMetrics();
}

  private startKeepalive(): void {
    const interval = this.cfg.updateIntervalMs ?? 10_000;
    if (this.keepalive) return;
    this.keepalive = setInterval(() => {
      const now = Date.now();
      if (now - this.lastActivity > interval * 2) {
        this.sendWire({
          type: 2,
          conv: this.cfg.conv,
          seq: 0,
          ack: this.rcvNxt - 1,
          payload: new Uint8Array(),
        });
      }
    }, interval);
    if ((this.keepalive as any).unref) (this.keepalive as any).unref();
  }

  connect(): Promise<void> {
    this.startKeepalive();
    this.startRetransmitSweep();
    return Promise.resolve();
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.on("data", cb);
  }

  send(data: Uint8Array): void {
    // fragment to MTU
    const maxPayload = Math.max(1, this.mtu - HEADER_BYTES);
    for (let offset = 0; offset < data.length; offset += maxPayload) {
      const slice = data.subarray(offset, Math.min(offset + maxPayload, data.length));
      this.queueSegment(slice);
    }
    this.drainSendWindow();
  }

  close(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.retransmit) clearInterval(this.retransmit);
    this.socket.close();
    this.emit("close");
  }

  private queueSegment(payload: Uint8Array): void {
    const seq = this.nextSeq++;
    const now = Date.now();
    this.pending.set(seq, {
      payload,
      ts: now,
      rto: this.cfg.updateIntervalMs ?? DEFAULT_INTERVAL_MS,
      retries: 0,
      sent: false,
    });
  }

  private drainSendWindow(): void {
    const inFlight = [...this.pending.entries()].filter(
      ([seq, entry]) => seq >= this.sndUna && entry.sent,
    ).length;
    const budget = Math.max(0, Math.min(this.sndWnd, this.cwnd) - inFlight);
    if (budget <= 0) return;

    let sent = 0;
    for (const [seq, entry] of this.pending) {
      if (seq < this.sndUna) continue;
      // send only if first time or retry flagged
      if (entry.retries === 0) {
        this.transmit(seq, entry);
        sent += 1;
        if (sent >= budget) break;
      }
    }
  }

  private transmit(
    seq: number,
    entry: { payload: Uint8Array; ts: number; rto: number; retries: number; sent: boolean },
  ): void {
    const now = Date.now();
    entry.ts = now;
    entry.rto = this.rto || entry.rto;
    if (entry.retries === 0) entry.retries = 1;
    entry.sent = true;
    const packet: WirePacket = {
      type: 0,
      conv: this.cfg.conv,
      seq,
      ack: this.rcvNxt - 1,
      payload: entry.payload,
    };
    this.sendWire(packet);
    this.metrics.writes += 1;
    this.metrics.bytesWritten += entry.payload.byteLength;
  }

  private sendWire(packet: WirePacket): void {
    const encoded = encodePacket(packet);
    this.socket.send(
      encoded,
      0,
      encoded.length,
      this.remote.port,
      this.remote.address,
    );
  }

  private emitMetrics(): void {
    const sent = this.nextSeq - 1;
    const acked = sent - this.pending.size;
    this.metrics.lossRate =
      sent > 0 ? Math.max(0, (sent - acked) / sent) : 0;
    this.emit("kcp:metrics", {
      conv: this.cfg.conv,
      bytesRead: this.metrics.bytesRead,
      bytesWritten: this.metrics.bytesWritten,
      writes: this.metrics.writes,
      backpressure: this.metrics.backpressure,
      pending: this.pending.size,
      rttMs: this.metrics.rttMs,
      lossRate: this.metrics.lossRate,
      sndUna: this.sndUna,
      sndNxt: this.nextSeq,
      rcvNxt: this.rcvNxt,
      cwnd: this.cwnd,
      ssthresh: this.ssthresh,
      rtoMs: this.rto,
    });
  }

  private startRetransmitSweep(): void {
    if (this.retransmit) return;
    const interval = this.cfg.updateIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.retransmit = setInterval(() => {
      this.drainSendWindow(); // try fresh sends before considering retransmits
      const now = Date.now();
      for (const [seq, entry] of this.pending) {
        if (seq < this.sndUna) continue;
        if (!entry.sent) continue;
        if (now - entry.ts >= entry.rto) {
          entry.retries += 1;
          entry.rto = Math.min(
            MAX_RTO_MS,
            Math.max(MIN_RTO_MS, entry.rto * 2),
          );
          // congestion response
          this.ssthresh = Math.max(2, Math.floor(this.cwnd / 2));
          this.cwnd = Math.max(2, this.ssthresh);
          this.transmit(seq, entry);
        }
      }
      this.emitMetrics();
    }, interval);
    if ((this.retransmit as any).unref) (this.retransmit as any).unref();
  }

  private updateRtt(sample: number): void {
    if (sample <= 0) return;
    if (this.srtt === 0) {
      this.srtt = sample;
      this.rttVar = sample / 2;
    } else {
      const delta = Math.abs(sample - this.srtt);
      this.rttVar = 0.75 * this.rttVar + 0.25 * delta;
      this.srtt = 0.875 * this.srtt + 0.125 * sample;
    }
    this.rto = Math.min(
      MAX_RTO_MS,
      Math.max(MIN_RTO_MS, this.srtt + Math.max(1, 4 * this.rttVar)),
    );
    this.metrics.rttMs = this.srtt;
  }
}

function encodePacket(packet: WirePacket): Uint8Array {
  const buf = Buffer.allocUnsafe(HEADER_BYTES + packet.payload.length);
  buf.writeUInt8(packet.type, 0);
  buf.writeUInt32BE(packet.conv >>> 0, 1);
  buf.writeUInt32BE(packet.seq >>> 0, 5);
  buf.writeUInt32BE(packet.ack >>> 0, 9);
  buf.writeUInt32BE(packet.payload.length >>> 0, 13);
  Buffer.from(packet.payload).copy(buf, 17);
  return new Uint8Array(buf);
}

function decodePacket(buf: Uint8Array): WirePacket | null {
  if (buf.length < HEADER_BYTES) return null;
  const type = buf[0];
  if (type !== 0 && type !== 1 && type !== 2) return null;
  const conv = readU32(buf, 1);
  const seq = readU32(buf, 5);
  const ack = readU32(buf, 9);
  const len = readU32(buf, 13);
  if (17 + len > buf.length) return null;
  const payload = buf.subarray(17, 17 + len);
  return { type: type as WireType, conv, seq, ack, payload };
}

function readU32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24 >>> 0) +
    (buf[offset + 1] << 16) +
    (buf[offset + 2] << 8) +
    buf[offset + 3]
  ) >>> 0;
}
