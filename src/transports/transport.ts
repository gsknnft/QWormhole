import { EventEmitter } from "events";

export type TransportType = "tcp" | "ws" | "kcp" | "quic" | "wg";

export interface QWormholeTransport extends EventEmitter {
  readonly type: TransportType;
  send(data: Uint8Array): void;
  close(): void;
  connect?(): Promise<void> | void;
  onData(cb: (data: Uint8Array) => void): void;
}
