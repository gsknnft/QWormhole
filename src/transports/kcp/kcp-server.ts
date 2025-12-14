import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { KcpConfig, DEFAULT_KCP_CONFIG } from "./kcp-config";
import { MuxSession } from "../mux/mux-session";

export interface KcpServerOptions extends KcpConfig {
  listenPort: number;
}

type WireType = 0 | 1 | 2; // data, ack, ping
type WirePacket = {
  type: WireType;
  conv: number;
  seq: number;
  ack: number;
  payload: Uint8Array;
};

const HEADER_BYTES = 1 + 4 + 4 + 4 + 4;
const DEFAULT_INTERVAL_MS = 10;
const MIN_RTO_MS = 20;
const MAX_RTO_MS = 400;

interface SessionState {
  mux: MuxSession;
  lastSeen: number;
  context: { address: string; port: number };
  // ARQ state
  rcvNxt: number;
  recvBuf: Map<number, Uint8Array>;
  sndUna: number;
  sndNxt: number;
  cwnd: number;
  ssthresh: number;
  srtt: number;
  rttVar: number;
  rto: number;
  pending: Map<
    number,
    { payload: Uint8Array; ts: number; rto: number; retries: number; sent: boolean }
  >;
}

/**
 * KCP server that maintains one ARQ-aware session per remote endpoint.
 * Mirrors the client wire format for true KCP↔KCP reliability.
 */
export class KcpServer extends EventEmitter {
  private socket: dgram.Socket;
  private sessions = new Map<string, SessionState>();
  private timer?: NodeJS.Timeout;
  private boundPort: number | undefined;
  private started = false;
  private conv: number;
  private sndWnd: number;
  private rcvWnd: number;
  private mtu: number;
  private intervalMs: number;

  constructor(private opts: KcpServerOptions) {
    super();
    this.socket = dgram.createSocket("udp4");
    this.conv = opts.conv ?? 1;
    this.sndWnd = opts.sndWnd ?? DEFAULT_KCP_CONFIG.sndWnd;
    this.rcvWnd = opts.rcvWnd ?? DEFAULT_KCP_CONFIG.rcvWnd;
    this.mtu = opts.mtu ?? DEFAULT_KCP_CONFIG.mtu;
    this.intervalMs = opts.updateIntervalMs ?? DEFAULT_INTERVAL_MS;
  }

  async start(): Promise<number> {
    if (this.started) return this.boundPort ?? this.opts.listenPort;
    const merged: KcpConfig = {
      ...DEFAULT_KCP_CONFIG,
      ...this.opts,
      nodelay: { ...DEFAULT_KCP_CONFIG.nodelay, ...(this.opts.nodelay ?? {}) },
    };
    this.socket.on("message", (msg, rinfo) => {
      const key = `${rinfo.address}:${rinfo.port}`;
      let session = this.sessions.get(key);
      if (!session) {
        const mux = new MuxSession(buf => {
          this.socket.send(buf, 0, buf.length, rinfo.port, rinfo.address);
        });
        session = {
          mux,
          lastSeen: Date.now(),
          context: { address: rinfo.address, port: rinfo.port },
          rcvNxt: 1,
          recvBuf: new Map<number, Uint8Array>(),
          sndUna: 1,
          sndNxt: 1,
          cwnd: 32,
          ssthresh: 256,
          srtt: 0,
          rttVar: 0,
          rto: merged.updateIntervalMs ?? DEFAULT_INTERVAL_MS,
          pending: new Map(),
        };
        this.sessions.set(key, session);
        this.emit("session", { key, mux });
      }
      session.lastSeen = Date.now();
      this.handlePacket(session, new Uint8Array(msg), rinfo.port, rinfo.address);
    });

    const bound = await new Promise<number>((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket.off("listening", onListening as never);
        reject(err);
      };
      const onListening = () => {
        const addr = this.socket.address();
        if (typeof addr === "object" && addr && "port" in addr) {
          this.boundPort = addr.port;
          this.emit("listening", { port: addr.port });
          resolve(addr.port);
        } else {
          this.boundPort = this.opts.listenPort;
          this.emit("listening", { port: this.opts.listenPort });
          resolve(this.opts.listenPort);
        }
      };
      this.socket.once("error", onError);
      this.socket.once("listening", onListening as never);
      this.socket.bind(this.opts.listenPort);
    });

    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    this.started = true;
    return bound;
  }

  private tick(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastSeen > 30_000) {
        this.sessions.delete(key);
        this.emit("session:end", key);
        continue;
      }
      this.drain(session);

      // retransmit overdue
      for (const [seq, entry] of session.pending) {
        if (seq < session.sndUna) continue;
        if (!entry.sent) continue;
        if (now - entry.ts >= entry.rto) {
          entry.retries += 1;
          entry.rto = Math.min(
            MAX_RTO_MS,
            Math.max(MIN_RTO_MS, entry.rto * 2),
          );
          session.ssthresh = Math.max(2, Math.floor(session.cwnd / 2));
          session.cwnd = Math.max(2, session.ssthresh);
          this.transmit(session, seq, entry);
        }
      }
    }
  }

  private handlePacket(
    session: SessionState,
    data: Uint8Array,
    port: number,
    host: string,
  ): void {
    const packet = decodePacket(data);
    if (!packet) return;
    if (packet.conv !== this.conv) return;

    if (packet.type === 0) {
      // data in (buffer and deliver in-order)
      if (packet.seq >= session.rcvNxt && packet.seq < session.rcvNxt + this.rcvWnd) {
        session.recvBuf.set(packet.seq, packet.payload);
        while (session.recvBuf.has(session.rcvNxt)) {
          const payload = session.recvBuf.get(session.rcvNxt)!;
          session.recvBuf.delete(session.rcvNxt);
          session.mux.receiveRaw(payload);
          session.rcvNxt += 1;
        }
      }
      // ack back immediately
      this.sendAck(session, port, host);
      // echo back as data (bench echo)
      this.queueData(session, packet.payload);
      this.drain(session);
    } else if (packet.type === 1) {
      // ack
      const ack = packet.ack;
      const now = Date.now();
      for (const seq of Array.from(session.pending.keys())) {
        if (seq <= ack) {
          const entry = session.pending.get(seq);
          if (entry) {
            const sample = now - entry.ts;
            this.updateRtt(session, sample);
          }
          session.pending.delete(seq);
        }
      }
      
      session.sndUna = Math.max(session.sndUna, ack + 1);
      // congestion window growth
      if (session.cwnd < session.ssthresh) {
        session.cwnd += 1;
      } else {
        session.cwnd += Math.max(1, Math.floor(1 / Math.max(1, session.cwnd)));
      }
    } else {
      // ping -> ack latest
      this.sendAck(session, port, host);
    }
  }

  private sendAck(session: SessionState, port: number, host: string): void {
    const ackPacket: WirePacket = {
      type: 1,
      conv: this.conv,
      seq: 0,
      ack: session.rcvNxt - 1,
      payload: new Uint8Array(),
    };
    const encoded = encodePacket(ackPacket);
    this.socket.send(encoded, 0, encoded.length, port, host);
  }

  private queueData(session: SessionState, payload: Uint8Array): void {
    const maxPayload = Math.max(1, this.mtu - HEADER_BYTES);
    for (let offset = 0; offset < payload.length; offset += maxPayload) {
      const slice = payload.subarray(offset, Math.min(offset + maxPayload, payload.length));
      const seq = session.sndNxt++;
      session.pending.set(seq, {
        payload: slice,
        ts: 0,
        rto: this.intervalMs,
        retries: 0,
        sent: false,
      });
    }
  }

  private drain(session: SessionState): void {
    const inFlight = [...session.pending.entries()].filter(
      ([seq, entry]) => seq >= session.sndUna && entry.sent
    ).length;
    const budget = Math.max(0, Math.min(this.sndWnd, session.cwnd) - inFlight);
    if (budget <= 0) return;
    let sent = 0;
    for (const [seq, entry] of session.pending) {
      if (seq < session.sndUna) continue;
      if (entry.retries === 0) {
        this.transmit(session, seq, entry);
        sent += 1;
        if (sent >= budget) break;
      }
    }
  }

  private transmit(
    session: SessionState,
    seq: number,
    entry: {
      payload: Uint8Array;
      ts: number;
      rto: number;
      retries: number;
      sent: boolean;
    },
  ): void {
    const now = Date.now();
    entry.ts = now;
    if (entry.retries === 0) entry.retries = 1;
    entry.sent = true;
    entry.rto = Math.max(MIN_RTO_MS, entry.rto);
    const packet: WirePacket = {
      type: 0,
      conv: this.conv,
      seq,
      ack: session.rcvNxt - 1,
      payload: entry.payload,
    };
    const encoded = encodePacket(packet);
    this.socket.send(
      encoded,
      0,
      encoded.length,
      session.context.port,
      session.context.address,
    );
  }

  updateRtt(session: SessionState, sample: number): void {
    if (sample <= 0) return;
    if (session.srtt === 0) {
      session.srtt = sample;
      session.rttVar = sample / 2;
    } else {
      const delta = Math.abs(sample - session.srtt);
      session.rttVar = 0.75 * session.rttVar + 0.25 * delta;
      session.srtt = 0.875 * session.srtt + 0.125 * sample;
    }
    session.rto = Math.min(
      MAX_RTO_MS,
      Math.max(MIN_RTO_MS, session.srtt + Math.max(1, 4 * session.rttVar)),
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket.close();
    this.sessions.clear();
    this.emit("close");
    this.started = false;
  }

  getPort(): number | undefined {
    return this.boundPort;
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
