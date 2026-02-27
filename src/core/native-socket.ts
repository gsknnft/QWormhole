import { EventEmitter } from "node:events";
import type { NativeBackend, NativeSocketOptions } from "../types/types";
import { NativeTcpClient } from "./NativeTCPClient";

type NativeSocketAdapterOptions = NativeSocketOptions & {
  pollIntervalMs?: number;
  preferredBackend?: NativeBackend;
};

export class NativeSocketAdapter extends EventEmitter {
  public destroyed = false;
  public writableLength = 0;
  public alpnProtocol?: string;
  public authorized?: boolean;

  private readonly opts: NativeSocketAdapterOptions;
  private readonly client: NativeTcpClient;
  private pollTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private connectTimer?: NodeJS.Timeout;
  private connected = false;
  private lastActivity = Date.now();
  private idleTimeoutMs?: number;
  private usingEvents = false;
  private tlsInfo?: {
    alpnProtocol?: string;
    protocol?: string;
    cipher?: string;
    authorized?: boolean;
    peerFingerprint?: string;
    peerFingerprint256?: string;
  };

  constructor(opts: NativeSocketAdapterOptions) {
    super();
    this.opts = opts;
    this.client = new NativeTcpClient(opts.preferredBackend);
    if (this.client.supportsEventStream()) {
      this.enableEventStream();
    }
  }

  connect(): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new Error("Native socket destroyed"));
    }
    return new Promise((resolve, reject) => {
      try {
        this.client.connect({
          host: this.opts.host,
          port: this.opts.port,
          useTls: this.opts.tls?.enabled,
          tls: this.opts.tls,
          alpn: this.opts.tls?.alpnProtocols,
          connectTimeoutMs: this.opts.connectTimeoutMs,
          idleTimeoutMs: this.opts.idleTimeoutMs,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.idleTimeoutMs = this.opts.idleTimeoutMs;
      const timeoutMs = this.opts.connectTimeoutMs ?? 5_000;
      if (timeoutMs && timeoutMs > 0) {
        this.connectTimer = setTimeout(() => {
          if (this.connected) return;
          this.emit("error", new Error("Native connect timeout"));
          this.destroy();
          reject(new Error("Native connect timeout"));
        }, timeoutMs);
      }

      if (!this.usingEvents) {
        this.startPolling();
      }

      const settle = () => {
        if (this.connected) {
          if (this.connectTimer) clearTimeout(this.connectTimer);
          resolve();
        }
      };

      // If the native binding exposes connection state, wait for it.
      if (!this.usingEvents) {
        const check = () => {
          if (this.connected) return;
          if (this.client.isConnected()) {
            this.connected = true;
            this.emit("connect");
            settle();
          }
        };
        const interval = setInterval(check, this.opts.pollIntervalMs ?? 5);
        setTimeout(() => {
          clearInterval(interval);
          check();
          if (!this.connected && !this.destroyed) {
            const err = new Error("Native connect timeout");
            this.emit("error", err);
            this.destroy();
            reject(err);
          }
        }, timeoutMs);
      }
    });
  }

  write(data: Buffer | string): boolean {
    if (this.destroyed) return false;
    try {
      this.client.send(data);
      this.touch();
      return true;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  writev(buffers: Array<{ chunk: Buffer }>): boolean {
    if (this.destroyed) return false;
    try {
      const payloads = buffers.map(entry => entry.chunk);
      const result = this.client.sendMany?.(payloads);
      this.touch();
      if (typeof result === "number") {
        return result >= payloads.length;
      }
      return true;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  cork(): void {
    // no-op: native binding batches internally
  }

  uncork(): void {
    // no-op
  }

  end(): void {
    this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopPolling();
    try {
      this.client.close();
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
    this.emit("close", false);
  }

  setKeepAlive(_enable?: boolean, _delay?: number): void {
    // not supported by native binding yet
  }

  setTimeout(timeoutMs: number): void {
    this.idleTimeoutMs = timeoutMs;
    this.armIdleTimeout();
  }

  private touch(): void {
    this.lastActivity = Date.now();
    this.armIdleTimeout();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    const interval = this.usingEvents
      ? Math.max(50, this.opts.pollIntervalMs ?? 50)
      : this.opts.pollIntervalMs ?? 5;
    this.pollTimer = setInterval(() => {
      if (this.destroyed) return;

      try {
        if (!this.connected && this.client.isConnected()) {
          this.connected = true;
          this.refreshTlsInfo();
          this.emit("connect");
        } else if (this.connected && !this.client.isConnected()) {
          this.connected = false;
          this.emit("close", false);
          return;
        }

        if (!this.usingEvents) {
          const data = this.client.recv();
          if (data && data.length > 0) {
            this.touch();
            this.emit("data", data);
          }
        }

      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }, interval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  enableEventStream(): void {
    if (this.usingEvents) return;
    this.usingEvents = true;
    this.client.setEventHandler?.(evt => {
      switch (evt.type) {
        case "connect":
          this.connected = true;
          this.touch();
          this.refreshTlsInfo();
          this.emit("connect");
          break;
        case "data":
          if (evt.data) {
            this.touch();
            this.emit("data", evt.data);
          }
          break;
        case "close":
          this.connected = false;
          this.stopPolling();
          this.emit("close", Boolean(evt.hadError));
          break;
        case "error":
          this.emit("error", new Error(evt.error ?? "Native client error"));
          break;
        default:
          break;
      }
    });
    this.armIdleTimeout();
  }

  getPeerCertificate(_detailed?: boolean): {
    fingerprint?: string;
    fingerprint256?: string;
  } | null {
    this.refreshTlsInfo();
    if (!this.tlsInfo) return null;
    return {
      fingerprint: this.tlsInfo.peerFingerprint,
      fingerprint256: this.tlsInfo.peerFingerprint256,
    };
  }

  getTlsInfo():
    | {
        alpnProtocol?: string;
        protocol?: string;
        cipher?: string;
        authorized?: boolean;
        peerFingerprint?: string;
        peerFingerprint256?: string;
      }
    | undefined {
    this.refreshTlsInfo();
    return this.tlsInfo;
  }

  exportKeyingMaterial(
    length: number,
    label: string,
    context?: Buffer,
  ): Buffer | undefined {
    return this.client.exportKeyingMaterial?.(length, label, context);
  }

  private refreshTlsInfo(): void {
    const info = this.client.getTlsInfo?.();
    if (info) {
      this.tlsInfo = info;
      this.alpnProtocol = info.alpnProtocol;
      this.authorized = info.authorized;
    }
  }

  private armIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0 || this.destroyed) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (Date.now() - this.lastActivity >= this.idleTimeoutMs!) {
        this.emit("timeout");
        this.destroy();
        return;
      }
      this.armIdleTimeout();
    }, this.idleTimeoutMs);
  }
}
