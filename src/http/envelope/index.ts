import { QWormholeRequest, QWormholeResponse } from "../../types/types";

export type QWEnvelope =
  | { v: 1; kind: "request"; id: string; req: QWormholeRequest; body?: Uint8Array }
  | {
      v: 1;
      kind: "response";
      id: string;
      status: QWormholeResponse;
      body?: Uint8Array;
      error?: string;
    };
