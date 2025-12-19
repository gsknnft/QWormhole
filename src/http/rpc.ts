import { randomUUID } from "node:crypto";
import type { QWormholeClient } from "../client";
import type { QWormholeServer } from "../server";
import type { QWormholeServerConnection } from "src/types/types";
import type { QWEnvelope } from "./envelope";
import type { QWormholeRequest, QWormholeResponse } from "src/types/types";

export interface RpcResponse {
  status: QWormholeResponse;
  body?: Uint8Array;
  error?: string;
}

export interface RpcHandlerContext {
  client: QWormholeServerConnection;
}

export type RpcHandler = (
  req: QWormholeRequest,
  body: Uint8Array | undefined,
  ctx: RpcHandlerContext,
) => Promise<RpcResponse> | RpcResponse;

export interface RpcClient {
  request(
    req: QWormholeRequest,
    body?: Uint8Array,
    timeoutMs?: number,
  ): Promise<RpcResponse>;
  dispose(): void;
}

/**
 * Attach a lightweight RPC dispatcher to a QWormhole client that already uses QWEnvelope
 * serializers. Returns a helper for issuing request/response calls.
 */
export const attachRpcClient = (client: QWormholeClient<QWEnvelope>): RpcClient => {
  const pending = new Map<
    string,
    {
      resolve: (res: RpcResponse) => void;
      reject: (err: Error) => void;
      timer?: NodeJS.Timeout;
    }
  >();

  const onMessage = (msg: QWEnvelope) => {
    if (msg.v !== 1) {
      // ignore or reject incompatible protocol
      return;
    }
    if (msg.kind !== "response") return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(msg.id);
    if (msg.status.statusCode >= 400) {
      if (msg.status.statusCode === 402) {
        // payment required ( e.g. for sovereign tunnel usage  - x402 payment flow)
        entry.reject(new Error(`402 Payment Required error ${msg.status.statusCode}`));
        return;
      } else if (msg.status.statusCode === 431) {
        // 431 request header fields too large (e.g. for sovereign tunnel usage - x431 overuse flow)
        entry.reject(new Error(`431 Request Header Fields Too Large error ${msg.status.statusCode}`));
        return;
      } else if (msg.status.statusCode === 429) {
        // 429 too many requests (e.g. for sovereign tunnel usage - x429 rate limit flow)
        entry.reject(new Error(`429 Too Many Requests error ${msg.status.statusCode}`));
        return;
      }
      entry.reject(
        new Error(msg.error ?? `RPC error ${msg.status.statusCode}`)
      );
    } else {
      entry.resolve({
        status: msg.status,
        body: msg.body,
        error: msg.error,
      });
    }
  };

  client.on("message", onMessage as never);
const cleanup = (id: string) => {
  const entry = pending.get(id);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  pending.delete(id);
};

  return {
    request: (req: QWormholeRequest, body?: Uint8Array, timeoutMs = 5000) => {
      const id =
        typeof randomUUID === "function"
          ? randomUUID()
          : Math.random().toString(36).slice(2);
      const envelope: QWEnvelope = { v: 1, kind: "request", id, req, body };
      return new Promise<RpcResponse>((resolve, reject) => {
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                cleanup(id);
                reject(new Error("RPC request timed out"));
                }, timeoutMs)
            : undefined;
        pending.set(id, { resolve, reject, timer });
        void client.send(envelope);
      });
    },
    dispose: () => {
      client.off("message", onMessage as never);
      for (const [, entry] of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.clear();
    },
  };
};

/**
 * Attach a request handler to a QWormhole server that is operating on QWEnvelope
 * messages. Returns an unsubscribe function.
 */
export const attachRpcServer = (
  server: QWormholeServer<QWEnvelope>,
  handler: RpcHandler,
): (() => void) => {
  const onMessage = async ({
    client,
    data,
  }: {
    client: QWormholeServerConnection;
    data: QWEnvelope;
  }) => {
    
    if (data.kind !== "request") return;
    if (client.backpressured) {
  await client.send({
    v: 1,
    kind: "response",
    id: data.id,
    status: {
      statusCode: 503,
      statusMessage: "Backpressure",
      headers: {},
    },
    error: "Server under load",
  });
  return;
}

    try {
      const res = await handler(data.req, data.body, { client });
      const envelope: QWEnvelope = {
        v: 1,
        kind: "response",
        id: data.id,
        status: res.status,
        body: res.body,
        error: res.error,
      };
      await client.send(envelope);
    } catch (err) {
      const envelope: QWEnvelope = {
        v: 1,
        kind: "response",
        id: data.id,
        status: {
          statusCode: 500,
          statusMessage: "Internal Error",
          headers: {},
        },
        error: err instanceof Error ? err.message : String(err),
      };
      await client.send(envelope);
    }
  };

  server.on("message", onMessage as never);

  return () => {
    server.off("message", onMessage as never);
  };
};

