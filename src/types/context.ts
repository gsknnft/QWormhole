// QWormhole/src/types/context.ts

import { BatchFramer } from "src/batch-framer";
import { QWormholeClient } from "src/client";
import { QWormholeServer } from "src/server";

export interface QWormholeContext {
  registerInstance(name: string, instance: {
    client?: QWormholeClient;
    server?: QWormholeServer;
    framer?: BatchFramer;
  }): void;

  onFlush?(name: string, info: { buffers: number; bytes: number; ts: number }): void;
  onBackpressure?(name: string, info: { queuedBytes: number; ts: number }): void;
  onFrame?(name: string, info: { direction: "in" | "out"; bytes: number; ts: number }): void;

  metrics(): {
    totals: {
      bytesIn: number;
      bytesOut: number;
      backpressureEvents: number;
      flushes: number;
    };
    byInstance: Record<string, {
      bytesIn: number;
      bytesOut: number;
      flushes: number;
      backpressure: number;
    }>;
  };
}
