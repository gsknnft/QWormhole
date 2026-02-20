import { QWormholeRuntime } from "../core/runtime";
import type { CoherenceState } from "../coherence/types";

export interface TransportEnvelope<
  TPayload = unknown,
  TCoherence = CoherenceState,
> {
  channel: string;
  payload: TPayload;
  coherence?: TCoherence;
  ts: number;
}

export interface TransportAdapter<
  TPayload = unknown,
  TCoherence = CoherenceState,
> {
  connect(endpoint: string): Promise<void>;
  publish(channel: string, payload: TPayload, coherence?: TCoherence): void;
  subscribe(
    channel: string,
    handler: (
      payload: TPayload,
      coherence?: TCoherence,
      envelope?: TransportEnvelope<TPayload, TCoherence>,
    ) => void,
  ): () => void;
  messages(
    channel?: string,
  ): AsyncGenerator<TransportEnvelope<TPayload, TCoherence>>;
  close(): Promise<void>;
}

export function createQWormholeAdapter<
  TPayload = unknown,
  TCoherence = CoherenceState,
>(
  runtime: QWormholeRuntime<TransportEnvelope<TPayload, TCoherence>>,
): TransportAdapter<TPayload, TCoherence> {
  const publish = (
    channel: string,
    payload: TPayload,
    coherence?: TCoherence,
  ) => {
    const envelope: TransportEnvelope<TPayload, TCoherence> = {
      channel,
      payload,
      coherence,
      ts: Date.now(),
    };
    void runtime.send(envelope);
  };

  const subscribe = (
    channel: string,
    handler: (
      payload: TPayload,
      coherence?: TCoherence,
      envelope?: TransportEnvelope<TPayload, TCoherence>,
    ) => void,
  ) => {
    const onMessage = (msg: unknown) => {
      const envelope = decodeEnvelope<TPayload, TCoherence>(msg);
      if (!envelope || envelope.channel !== channel) return;
      handler(envelope.payload, envelope.coherence, envelope);
    };
    runtime.on("message", onMessage);
    return () => runtime.off("message", onMessage);
  };

  const messages = async function* (
    channel?: string,
  ): AsyncGenerator<TransportEnvelope<TPayload, TCoherence>> {
    const queue: Array<TransportEnvelope<TPayload, TCoherence>> = [];
    const onMessage = (msg: unknown) => {
      const envelope = decodeEnvelope<TPayload, TCoherence>(msg);
      if (!envelope) return;
      if (channel && envelope.channel !== channel) return;
      queue.push(envelope);
    };

    runtime.on("message", onMessage);
    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } finally {
      runtime.off("message", onMessage);
    }
  };

  return {
    async connect(endpoint) {
      await runtime.connect(endpoint);
    },
    publish,
    subscribe,
    messages,
    async close() {
      await runtime.close();
    },
  };
}

const decodeEnvelope = <TPayload, TCoherence>(
  msg: unknown,
): TransportEnvelope<TPayload, TCoherence> | null => {
  if (!msg) return null;
  if (typeof msg === "object") {
    const candidate = msg as TransportEnvelope<TPayload, TCoherence>;
    if (typeof candidate.channel === "string" && "payload" in candidate) {
      return candidate;
    }
  }
  if (typeof msg === "string" || Buffer.isBuffer(msg)) {
    const text = Buffer.isBuffer(msg) ? msg.toString("utf8") : msg;
    try {
      const parsed = JSON.parse(text) as TransportEnvelope<
        TPayload,
        TCoherence
      >;
      if (parsed && typeof parsed.channel === "string" && "payload" in parsed) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
};
