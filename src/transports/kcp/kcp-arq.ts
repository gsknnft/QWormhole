// Full KCP ARQ and congestion control scaffold for SigilNet
// Implements segment headers, seq/ack/una, fast resend, window, RTT, loss, retransmit metrics

import { EventEmitter } from "events";

export interface KcpSegment {
  conv: number;
  seq: number;
  ack: number;
  una: number;
  wnd: number;
  ts: number;
  payload: Uint8Array;
}

export interface KcpArqMetrics {
  conv: number;
  seq: number;
  ack: number;
  una: number;
  wnd: number;
  rtt: number;
  lossRate: number;
  retransmits: number;
  fastResend: number;
  bytesWritten: number;
  bytesRead: number;
}

export class KcpArqSession extends EventEmitter {
  private conv: number;
  private seq: number = 0;
  private ack: number = 0;
  private una: number = 0;
  private wnd: number = 128;
  private rtt: number = 0;
  private lossRate: number = 0;
  private retransmits: number = 0;
  private fastResend: number = 0;
  private bytesWritten: number = 0;
  private bytesRead: number = 0;
  private sentSegments: Map<number, KcpSegment> = new Map();
  private receivedSegments: Map<number, KcpSegment> = new Map();
  lastSentTs: number = Date.now();
  lastAckTs: number = Date.now();
  private rto: number = 200; // retransmission timeout (placeholder)

  constructor(conv: number) {
    super();
    this.conv = conv;
  }

  send(payload: Uint8Array) {
    const ts = Date.now();
    const segment: KcpSegment = {
      conv: this.conv,
      seq: this.seq++,
      ack: this.ack,
      una: this.una,
      wnd: this.wnd,
      ts,
      payload,
    };
    this.sentSegments.set(segment.seq, segment);
    this.bytesWritten += payload.length;
    this.lastSentTs = ts;
    this.emit("segment:send", segment);
    this.emitMetrics();
  }

  

  receive(segment: KcpSegment) {
    this.bytesRead += segment.payload.length;
    this.receivedSegments.set(segment.seq, segment);
    // RTT estimation
    if (segment.ack === this.seq - 1) {
      this.rtt = Date.now() - segment.ts;
      this.lastAckTs = Date.now();
      this.rto = Math.max(50, Math.min(1000, this.rtt * 2)); // crude RTO
    }
    // Loss estimation
    this.lossRate = this.estimateLoss();
    // Fast resend detection
    if (segment.una < this.seq - 1) {
      this.fastResend++;
      this.retransmits++;
      this.emit("segment:fast-resend", segment);
    }
    this.emit("segment:recv", segment);
    this.emitMetrics();
  }
  

  private estimateLoss(): number {
    // Simple loss estimation: missing ACKs
    const expected = this.seq;
    const received = this.receivedSegments.size;
    if (expected === 0) return 0;
    return Math.max(0, (expected - received) / expected);
  }

  private emitMetrics() {
    const metrics: KcpArqMetrics = {
      conv: this.conv,
      seq: this.seq,
      ack: this.ack,
      una: this.una,
      wnd: this.wnd,
      rtt: this.rtt,
      lossRate: this.lossRate,
      retransmits: this.retransmits,
      fastResend: this.fastResend,
      bytesWritten: this.bytesWritten,
      bytesRead: this.bytesRead,
    };
    this.emit("kcp:metrics", metrics);
  }

  /**
   * Placeholder retransmission sweep; call from a timer/loop.
   */
  sweepRetransmit(now: number): void {
    for (const [_seq, seg] of this.sentSegments) {
      if (now - seg.ts >= this.rto) {
        this.retransmits++;
        seg.ts = now;
        this.emit("segment:send", seg);
      }
    }
  }
}
