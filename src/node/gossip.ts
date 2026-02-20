// QWormhole/src/node/gossip.ts

import { PeerTable } from "./peer-table";
import { EventEmitter } from "events";

export interface GossipMessage {
  type: string;
  from: string;
  ts: number;
  payload: any;
}

// Very minimal to start
export class GossipModule extends EventEmitter {
  constructor(
    private peers: PeerTable,
    private opts: { intervalMs?: number } = {}
  ) {
    super();
    this.opts.intervalMs = this.opts.intervalMs ?? 5_000;
  }

  start() {
    // In the future: periodically send peer-table digest, state, etc.
    // For now, just emit "tick" so you can hook in from SigilNet/NCF.
    setInterval(() => {
      this.emit("tick", { ts: Date.now(), peers: this.peers.all() });
    }, this.opts.intervalMs);
  }

  // placeholder for sending a gossip message via QWormhole streams
  broadcast(msg: GossipMessage) {
    this.emit("broadcast", msg);
  }
}
