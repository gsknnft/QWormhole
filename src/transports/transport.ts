import { EventEmitter } from "events";

export type TransportType = "tcp" | "ws" | "kcp" | "quic" | "wg";

export interface QWormholeTransport extends EventEmitter {
  readonly type: TransportType;

  connect?(): Promise<void> | void;

  send(data: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;

  onData(cb: (data: Uint8Array) => void): void;
  onError?(cb: (err: Error) => void): void;

  getStats?(): any;

  // QUIC / WebTransport streams
  openStream?(
    opts?: { bidirectional?: boolean }
  ): Promise<{
    id: number;
    send(data: Uint8Array): void | Promise<void>;
    onData(cb: (data: Uint8Array) => void): void;
    close?(): void | Promise<void>;
  }>;

  // QUIC DATAGRAM extension
  sendDatagram?(data: Uint8Array): void | Promise<void>;
  onDatagram?(cb: (data: Uint8Array) => void): void;
}
