import { EventEmitter } from "events";

export interface QWormholeTransport extends EventEmitter {
  send(data: Uint8Array): void;
  close(): void;
  connect?(): Promise<void> | void;
  onData(cb: (data: Uint8Array) => void): void;
}
