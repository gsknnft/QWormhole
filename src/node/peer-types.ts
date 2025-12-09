import { Peer } from "types/sigilnet.types";

// QWormhole/src/node/peer-types.ts
export type PeerId = string;

export interface PeerInfo extends Peer {
  id: PeerId;
  address: string;        // "host:port"
  host: string;
  port: number;
  negentropicIndex?: number; // from NCF later
  lastSeen: number;
  meta?: Record<string, any>;
}
