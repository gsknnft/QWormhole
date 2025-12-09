// QWormhole/src/node/node-runtime.ts
//
// Hybrid mesh node:
// - Runs a QWormhole server (listens)
// - Joins LAN discovery (UDP/mDNS)
// - Maintains a peer table
// - Exposes gossip hooks for SigilNet/NCF layers

import { EventEmitter } from "events";
import { PeerInfo, PeerId } from "./peer-types";
import { PeerTable } from "./peer-table";
import { GossipModule } from "./gossip";
import { DiscoveryModule } from "./discovery";
import { QWormholeServer } from "../server";
import { QWormholeClient } from "../client";
import { MuxSession } from "../core/mux/mux-session";
import { PeerRegistry } from "../registry";
import { SovereignTunnel, createSovereignTunnel } from "../tunnel";
import type { QWormholeTransport } from "../transports/transport";
import { WSTransport } from "../transports/ws/ws-transport";
import { KcpSession } from "../transports/kcp/kcp-session";
// import { MuxSession } from "src/core/mux/mux-session";

// const transport = await TransportFactory.create(cfg.transport);

// const mux = new MuxSession(transport.send);

// transport.on("data", buf => mux.receiveRaw(buf));

// mux.on("stream", stream => {
//   // integrate with SigilNet protocol
// });


export interface NodeConfig {
  id: PeerId;
  host: string; // local listening host
  port: number; // local listening port for QWormhole server
  discoveryPort?: number; // UDP port for discovery
  transport?: "tcp" | "ws" | "kcp";
  url?: string; // for ws
  seeds?: string[]; // ["host:port", ...]
  negentropicIndex?: number;
  meta?: Record<string, any>;
  peerRegistry?: PeerRegistry;
  enableTunnel?: boolean;
  // Optional identity hints (can be filled from higher layers)
  origin?: string;
  sigil?: string;
  ed25519PublicKey?: string;
  x25519PublicKey?: string;
  trustLevel?: number;
}

export class QWormholeNode extends EventEmitter {
  readonly peers = new PeerTable();
  readonly gossip: GossipModule;
  readonly discovery: DiscoveryModule;
  readonly registry: PeerRegistry;
  readonly tunnel?: SovereignTunnel;

  private server: QWormholeServer | null = null;
  private running = false;
  private muxSessions = new Set<MuxSession>();
  mux?: MuxSession;
  transport?: QWormholeTransport;

  constructor(public cfg: NodeConfig) {
    super();
    this.peers.upsert(this.getSelfPeer());

    this.registry = cfg.peerRegistry ?? new PeerRegistry();
    if (cfg.enableTunnel) {
      this.tunnel = createSovereignTunnel(this.registry);
    }

    this.gossip = new GossipModule(this.peers);
    this.discovery = new DiscoveryModule(this, {
      port: cfg.discoveryPort ?? 43_221,
    });

    this.discovery.on("peer:discovered", (peer: PeerInfo) => {
      this.handleDiscoveredPeer(peer);
      this.emit("discovery:peer", peer);
    });

    this.gossip.on("tick", info => this.emit("gossip:tick", info));
    this.gossip.on("broadcast", msg => {
      this.emit("gossip:broadcast", msg);
      // later: forward via QWormhole connections
    });
  }

  private async initServer(): Promise<void> {
    this.server = new QWormholeServer({
      host: this.cfg.host,
      port: this.cfg.port,
    });
    await this.server.listen();
    this.emit("server:ready", { host: this.cfg.host, port: this.cfg.port });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.initServer();
    const transport = await this.createTransport();
    if (transport) {
      this.mux = this.attachMuxTransport(transport);
      this.transport = transport;
    }
    this.discovery.start();
    this.gossip.start();

    if (this.cfg.seeds && this.cfg.seeds.length) {
      for (const seed of this.cfg.seeds) {
        this.dialSeed(seed).catch(err => this.emit("seed:error", { seed, err }));
      }
    }

    this.emit("node:started", { id: this.cfg.id });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.discovery.stop();
    if (this.server) {
      await this.server.close().catch(err =>
        this.emit("server:error", { err }),
      );
      this.server = null;
    }
    this.emit("node:stopped", { id: this.cfg.id });
  }

  getSelfPeer(): PeerInfo {
    return {
      id: this.cfg.id,
      address: `${this.cfg.host}:${this.cfg.port}`,
      host: this.cfg.host,
      port: this.cfg.port,
      negentropicIndex: this.cfg.negentropicIndex,
      lastSeen: Date.now(),
      meta: this.cfg.meta,
      origin: this.cfg.origin ?? "self",
      sigil: this.cfg.sigil ?? "",
      ed25519PublicKey: this.cfg.ed25519PublicKey ?? "",
      x25519PublicKey: this.cfg.x25519PublicKey ?? "",
      trustLevel: this.cfg.trustLevel ?? 0,
      latency: 0,
    };
  }

  private async dialSeed(seed: string): Promise<void> {
    const [host, portStr] = seed.split(":");
    const port = Number(portStr);
    if (!host || Number.isNaN(port)) {
      this.emit("seed:error", { seed, err: new Error("Invalid seed format") });
      return;
    }
    const client = new QWormholeClient({
      host,
      port,
      framing: "length-prefixed",
      entropyMetrics: { negIndex: this.cfg.negentropicIndex ?? 0.5 },
    });
    try {
      await client.connect();
      this.emit("seed:connected", { seed, host, port });
      // Future: track the connection keyed by PeerId after handshake.
    } catch (err) {
      this.emit("seed:error", { seed, err });
      client.disconnect().catch(() => void 0);
    }
  }

  private handleDiscoveredPeer(peer: PeerInfo): void {
    if (peer.id === this.cfg.id) return;
    this.peers.upsert(peer);
    void this.registry.registerPeer({
      origin: peer.id,
      sigil: peer.sigil ?? "",
      ed25519PublicKey: peer.ed25519PublicKey ?? "",
      x25519PublicKey: peer.x25519PublicKey ?? "",
      host: peer.host,
      port: peer.port,
      lastSeen: peer.lastSeen,
      trustLevel: peer.trustLevel ?? 0,
      latency: peer.latency ?? 0,
      id: peer.id,
    });
    this.emit("peer:discovered", peer);
  }

  // /**
  //  * Attach a transport (e.g., WS) and wrap it in a mux session.
  //  */
  // attachMuxTransport(transport: {
  //   on(event: "data" | "close" | "error", cb: (arg: any) => void): void;
  //   send(data: Uint8Array): void;
  // }): MuxSession {
  //   const mux = new MuxSession(buf => transport.send(buf));
  //   this.muxSessions.add(mux);
  //   transport.on("data", (buf: Uint8Array) => mux.receiveRaw(buf));
  //   transport.on("close", () => this.muxSessions.delete(mux));
  //   transport.on("error", () => this.muxSessions.delete(mux));
  //   mux.on("stream", stream => this.emit("mux:stream", { stream, mux }));
  //   return mux;
  // }

  /**
   * Attach a transport (WS/KCP/TCP) and wrap it in a mux session.
   */
  attachMuxTransport(transport: QWormholeTransport): MuxSession {
    const mux = new MuxSession(buf => transport.send(buf));
    this.muxSessions.add(mux);
    transport.onData((buf: Uint8Array) => mux.receiveRaw(buf));
    if (transport.on) {
      transport.on("close", () => this.muxSessions.delete(mux));
      transport.on("error", () => this.muxSessions.delete(mux));
    }
    mux.on("stream", stream => this.emit("mux:stream", { stream, mux }));
    return mux;
  }

  private async createTransport(): Promise<QWormholeTransport | undefined> {
    const mode = this.cfg.transport ?? "tcp";
    if (mode === "ws") {
      const url =
        this.cfg.url ?? `ws://${this.cfg.host}:${this.cfg.port}/qwormhole`;
      const ws = new WSTransport(url);
      await ws.connect();
      return ws;
    }
    if (mode === "kcp") {
      const kcp = new KcpSession(
        { address: this.cfg.host, port: this.cfg.port },
        { conv: 1 },
      );
      await kcp.connect();
      return kcp;
    }
    // default: TCP handled by existing QWormholeClient elsewhere
    return undefined;
  }
}
