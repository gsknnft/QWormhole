// QWormhole/src/node/discovery.ts

import dgram from "dgram";
import { EventEmitter } from "events";
import { Peer} from "../types";
import type { QWormholeNode } from "./node-runtime";
import mdns from 'multicast-dns';

export interface DiscoveryConfig {
  port: number;           // UDP port
  intervalMs?: number;    // broadcast interval
  magic?: string;         // to avoid cross-talk with other systems
}

export class DiscoveryModule extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    private node: QWormholeNode,
    private cfg: DiscoveryConfig
  ) {
    super();
    this.cfg.intervalMs = this.cfg.intervalMs ?? 5_000;
    this.cfg.magic = this.cfg.magic ?? "SIGILNET_DISCOVERY_v1";
  }

  start() {
    if (this.socket) return;

    this.socket = dgram.createSocket("udp4");
    const mdnsInstance = mdns();

    mdnsInstance.on('query', q => {
      // respond to _sigilnet._udp.local
      const questions = q.questions.filter(quest => quest.name === '_sigilnet._udp.local' && quest.type === 'SRV');
      if (questions.length > 0) {
        const self = this.node.getSelfPeer();
        mdnsInstance.respond({
          answers: [{
            name: '_sigilnet._udp.local',
            type: 'SRV',
            data: {
              port: self.port,
              target: self.host,
              priority: 10,
              weight: 10,
            },
            ttl: 300,
          }]
        });
      }
    });

    mdnsInstance.on('response', r => {
      const srvRecords = r.answers.filter(ans => ans.name === '_sigilnet._udp.local' && ans.type === 'SRV');
      srvRecords.forEach(srv => {
        // Type guard for SRV record
        if (
          srv.type === 'SRV' &&
          typeof srv.data === 'object' &&
          srv.data !== null &&
          'target' in srv.data &&
          'port' in srv.data
        ) {
          const peer: Peer = {
            id: "", // ID would need to be obtained via additional means
            host: srv.data.target,
            port: srv.data.port,
            address: `${srv.data.target}:${srv.data.port}`,
            lastSeen: Date.now(),
            origin: "",
            sigil: "",
            ed25519PublicKey: "",
            x25519PublicKey: "",
            trustLevel: 0,
            latency: 0,
          };
          this.emit("peer:discovered", peer);
        }
      });
    });

    this.socket.on("message", (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.magic !== this.cfg.magic) return;
        if (!parsed.id || !parsed.host || !parsed.port) return;

        const peer: Peer = {
          id: parsed.id,
          host: parsed.host,
          port: parsed.port,
          address: `${parsed.host}:${parsed.port}`,
          negentropicIndex: parsed.negentropicIndex,
          lastSeen: Date.now(),
          meta: parsed.meta,
          origin: parsed.origin ?? "",
          sigil: parsed.sigil ?? "",
          ed25519PublicKey: parsed.ed25519PublicKey ?? "",
          x25519PublicKey: parsed.x25519PublicKey ?? "",
          trustLevel: parsed.trustLevel ?? 0,
          latency: parsed.latency ?? 0,
        };


        // notify node
        this.emit("peer:discovered", peer);
        this.node.emit("discovery:message", { peer, rinfo });

      } catch (err) {
        this.node.emit("discovery:error", { err });
      }
    });

    this.socket.bind(this.cfg.port, () => {
      this.socket!.setBroadcast(true);
      this.node.emit("discovery:ready", { port: this.cfg.port });
      this.startBroadcastLoop();
    });
  }

  private startBroadcastLoop() {
    if (!this.socket) return;
    this.broadcastSelf(); // immediate
    this.timer = setInterval(() => this.broadcastSelf(), this.cfg.intervalMs);
  }

  private broadcastSelf() {
    if (!this.socket) return;
    const self = this.node.getSelfPeer();
    const packet = Buffer.from(JSON.stringify({
      magic: this.cfg.magic,
      id: self.id,
      host: self.host,
      port: self.port,
      negentropicIndex: self.negentropicIndex,
      meta: self.meta,
      ts: Date.now(),
    }));

    // LAN broadcast – can later add multicast or directed sends
    this.socket.send(packet, 0, packet.length, this.cfg.port, "255.255.255.255");
    this.node.emit("discovery:broadcast", { to: "255.255.255.255", port: this.cfg.port });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
