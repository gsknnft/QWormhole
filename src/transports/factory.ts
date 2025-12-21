import type { QWormholeTransport } from "./transport";
import { WSTransport } from "./ws/ws-transport";
import { KcpSession } from "./kcp/kcp-session";
import { QuicTransport } from "./quic";

export type TransportKind = "tcp" | "ws" | "kcp" | "quic";

export interface TransportFactoryConfig {
  kind: TransportKind;
  host: string;
  port: number;
  url?: string; // ws only
}

/**
 * Create a transport by kind. TCP returns undefined so existing QWormhole TCP path stays intact.
 */
export async function createTransport(
  cfg: TransportFactoryConfig,
): Promise<QWormholeTransport | undefined> {
  if (cfg.kind === "ws") {
    const url = cfg.url ?? `ws://${cfg.host}:${cfg.port}/qwormhole`;
    const ws = new WSTransport(url);
    await ws.connect();
    return ws;
  }
  if (cfg.kind === "kcp") {
    const kcp = new KcpSession(
      { address: cfg.host, port: cfg.port },
      { conv: 1 },
    );
    await kcp.connect();
    return kcp;
  }
  if (cfg.kind === "quic") {
    if (!QuicTransport.isAvailable()) {
      return undefined;
    }
    const quic = new QuicTransport({ host: cfg.host, port: cfg.port });
    await quic.connect();
    return quic;
  }
  return undefined;
}
