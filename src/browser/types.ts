export interface BrowserTransportStats {
  state: "idle" | "connecting" | "open" | "closed" | "failed";
  bufferedAmount?: number;
  protocol?: string;
}

export interface BrowserTransportEvents {
  open: void;
  close: void;
  error: Error;
  data: Uint8Array;
}

export interface BrowserTransport {
  readonly kind: "ws" | "webtransport";
  connect(): Promise<void>;
  send(data: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;
  onData(cb: (data: Uint8Array) => void): void;
  onError(cb: (err: Error) => void): void;
  getStats(): BrowserTransportStats;
}
