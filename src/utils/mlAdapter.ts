import { spawn } from "node:child_process";
import { computeNegentropicIndex } from "./randomId";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface MLAdapter {
  name: string;
  run(metrics: JsonValue): Promise<JsonValue>;
}

export type MLAdapterName =
  | "noop"
  | "qworm_torch"
  | "rpc"
  | "spawn"
  | "composite"
  | "custom";

export interface QwormTorchAdapterOptions {
  sampleLimit?: number;
  anomalyZThreshold?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
}

export interface RpcAdapterOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface SpawnAdapterOptions {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface CompositeAdapterOptions {
  adapters: Array<
    | MLAdapter
    | {
        name: Exclude<MLAdapterName, "custom">;
        options?:
          | RpcAdapterOptions
          | SpawnAdapterOptions
          | QwormTorchAdapterOptions;
      }
  >;
}

export interface AdaptiveTelemetry {
  negIndex: number;
  coherenceBand: 'low' | 'medium' | 'high';
  eluIdle: number;
  gcPause: number;
  backpressureEvents: number;
}

export type AdapterSelection =
  | MLAdapter
  | MLAdapterName
  | {
      name: Extract<MLAdapterName, "rpc" | "spawn" | "qworm_torch" | "noop" | "composite">;
      options?:
        | RpcAdapterOptions
        | SpawnAdapterOptions
        | QwormTorchAdapterOptions
        | CompositeAdapterOptions;
    };

let resolvedFromEnv = false;
let activeAdapter: MLAdapter = createQwormTorchAdapter();

const adapterFactories: Record<
  MLAdapterName,
  (options?: unknown) => MLAdapter
> = {
  noop: () => createNoopAdapter(),
  qworm_torch: options =>
    createQwormTorchAdapter(options as QwormTorchAdapterOptions | undefined),
  rpc: options => createRpcAdapter(options as RpcAdapterOptions),
  spawn: options => createSpawnAdapter(options as SpawnAdapterOptions),
  composite: options => createCompositeAdapter(options as CompositeAdapterOptions),
  custom: adapter => adapter as MLAdapter,
};


export function setMLAdapter(selection: AdapterSelection) {
  activeAdapter = resolveAdapter(selection) ?? activeAdapter;
}

export function queryMLLayer(
  metrics: JsonValue,
  selection?: AdapterSelection,
): Promise<JsonValue> {
  if (!resolvedFromEnv) {
    const envAdapter = resolveAdapterFromEnv();
    if (envAdapter) activeAdapter = envAdapter;
    resolvedFromEnv = true;
  }

  if (selection) {
    const adapter = resolveAdapter(selection);
    if (adapter) return adapter.run(metrics);
  }
  return activeAdapter.run(metrics);
}

export function createQwormTorchAdapter(
  options: QwormTorchAdapterOptions = {},
): MLAdapter {
  const sampleLimit = options.sampleLimit ?? 4096;
  const anomalyZ = options.anomalyZThreshold ?? 3;
  const upper = options.upperThreshold ?? 0.9;
  const lower = options.lowerThreshold ?? 0.4;

  return {
    name: "qworm_torch",
    async run(metrics: JsonValue): Promise<JsonValue> {
      const series = collectNumericSamples(metrics, sampleLimit);
      if (!series.length) {
        return {
          adapter: "qworm_torch",
          stats: { count: 0 },
          echo: metrics,
        } as JsonValue;
      }

      const stats = summarizeSeries(series, anomalyZ);
      const mode =
        stats.nIndex >= upper
          ? "high"
          : stats.nIndex <= lower
            ? "low"
            : "medium";
      return {
        adapter: "qworm_torch",
        stats: { ...stats, mode },
        echo: metrics,
      } as JsonValue;
    },
  };
}

export function createRpcAdapter(options: RpcAdapterOptions): MLAdapter {
  if (!options?.url) {
    throw new Error("createRpcAdapter requires a url");
  }
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  const timeoutMs = options.timeoutMs ?? 5000;
  return {
    name: "rpc",
    async run(metrics: JsonValue): Promise<JsonValue> {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(options.url, {
          method: "POST",
          headers,
          body: JSON.stringify(metrics),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`rpc adapter HTTP ${res.status}`);
        }
        const text = await res.text();
        if (!text.trim()) return {} as JsonValue;
        return JSON.parse(text) as JsonValue;
      } finally {
        clearTimeout(to);
      }
    },
  };
}

export function createSpawnAdapter(options: SpawnAdapterOptions): MLAdapter {
  if (!options?.command) {
    throw new Error("createSpawnAdapter requires a command");
  }
  return {
    name: "spawn",
    async run(metrics: JsonValue): Promise<JsonValue> {
      const proc = spawn(options.command, options.args ?? [], {
        stdio: ["pipe", "pipe", "inherit"],
        env: { ...process.env, ...options.env },
      });
      proc.stdin.write(JSON.stringify(metrics));
      proc.stdin.end();
      const result = await new Promise<JsonValue>((resolve, reject) => {
        let data = "";
        proc.stdout.on("data", chunk => {
          data += chunk.toString();
        });
        proc.once("error", reject);
        proc.on("close", () => {
          try {
            resolve(data ? (JSON.parse(data) as JsonValue) : ({} as JsonValue));
          } catch (err) {
            reject(err);
          }
        });
      });
      return result;
    },
  };
}

export function createNoopAdapter(): MLAdapter {
  return {
    name: "noop",
    async run(metrics: JsonValue): Promise<JsonValue> {
      return metrics;
    },
  };
}

function resolveAdapter(selection: AdapterSelection): MLAdapter | null {
  if (typeof selection === "string") {
    const factory = adapterFactories[selection as MLAdapterName];
    return factory ? factory() : null;
  }
  if (typeof selection === "object" && "run" in selection) {
    return selection as MLAdapter;
  }
  if (typeof selection === "object" && "name" in selection) {
    const factory = adapterFactories[selection.name];
    return factory ? factory(selection.options) : null;
  }
  return null;
}

function createCompositeAdapter(options: CompositeAdapterOptions): MLAdapter {
  if (!options || !Array.isArray(options.adapters) || options.adapters.length === 0) {
    throw new Error("composite adapter requires at least one child adapter");
  }

  const children: MLAdapter[] = options.adapters.map(entry => {
    if (typeof entry === "object" && "run" in entry) {
      return entry as MLAdapter;
    }
    if (typeof entry === "object" && "name" in entry) {
      const adapter = resolveAdapter(entry as AdapterSelection);
      if (!adapter) {
        throw new Error(`Failed to resolve composite adapter child ${entry.name}`);
      }
      return adapter;
    }
    if (typeof entry === "string") {
      const adapter = resolveAdapter(entry);
      if (!adapter) {
        throw new Error(`Failed to resolve composite adapter child ${entry}`);
      }
      return adapter;
    }
    throw new Error("Invalid composite adapter child entry");
  });

  return {
    name: "composite",
    async run(metrics: JsonValue): Promise<JsonValue> {
      const aggregate: JsonValue[] = [];
      for (const adapter of children) {
        try {
          const result = await adapter.run(metrics);
          aggregate.push({
            name: adapter.name,
            result,
          });
        } catch (err) {
          aggregate.push({
            name: adapter.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return {
        adapter: "composite",
        results: aggregate,
      };
    },
  };
}

function resolveAdapterFromEnv(): MLAdapter | null {
  const name = process.env.QWORMHOLE_ML_ADAPTER;
  if (!name) return null;
  const normalized = name.toLowerCase() as MLAdapterName;
  try {
    switch (normalized) {
      case "noop":
        return createNoopAdapter();
      case "qworm_torch":
        return createQwormTorchAdapter();
      case "rpc": {
        const url = process.env.QWORMHOLE_ML_RPC_URL;
        if (!url) throw new Error("QWORMHOLE_ML_RPC_URL required for rpc");
        return createRpcAdapter({
          url,
          headers: parseHeadersEnv(process.env.QWORMHOLE_ML_RPC_HEADERS),
        });
      }
      case "spawn": {
        const cmd = process.env.QWORMHOLE_ML_SPAWN_CMD;
        if (!cmd) throw new Error("QWORMHOLE_ML_SPAWN_CMD required for spawn");
        const args =
          process.env.QWORMHOLE_ML_SPAWN_ARGS?.split(" ").filter(Boolean) ?? [];
        return createSpawnAdapter({ command: cmd, args });
      }
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[qwormhole] failed to resolve ML adapter from env: ${err}`);
    return null;
  }
}

function parseHeadersEnv(value?: string): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    const out: Record<string, string> = {};
    for (const pair of value.split(",")) {
      const [k, v] = pair.split(":").map(s => s.trim());
      if (k && v) out[k] = v;
    }
    return out;
  }
}

function collectNumericSamples(
  metrics: JsonValue,
  limit: number,
  acc: number[] = [],
): number[] {
  if (acc.length >= limit) return acc;
  if (typeof metrics === "number" && isFinite(metrics)) {
    acc.push(metrics);
    return acc;
  }
  if (Array.isArray(metrics)) {
    for (const item of metrics) {
      if (acc.length >= limit) break;
      collectNumericSamples(item, limit, acc);
    }
    return acc;
  }
  if (metrics && typeof metrics === "object") {
    for (const value of Object.values(metrics)) {
      if (acc.length >= limit) break;
      collectNumericSamples(value as JsonValue, limit, acc);
    }
  }
  return acc;
}

function summarizeSeries(series: number[], anomalyZ: number) {
  const count = series.length;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const mean = series.reduce((a, b) => a + b, 0) / count;
  const variance =
    series.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / count;
  const std = Math.sqrt(variance);
  const normalized = series.map(v => (std ? (v - mean) / std : 0));
  const maxZ = normalized.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  const entropy = estimateEntropy(series);
  const nIndex = computeNegentropicIndex(series);
  const anomalyScore = Math.min(1, maxZ / anomalyZ);
  const health =
    anomalyScore > 0.8 ? "degraded" : nIndex > 1 ? "coherent" : "steady";

  return {
    count,
    min,
    max,
    mean,
    std,
    entropy,
    nIndex,
    anomalyScore,
    health,
  };
}

function estimateEntropy(series: number[]): number {
  const count = series.length;
  if (count === 0) return 0;
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (min === max) return 0;
  const bins = Math.min(64, Math.max(8, Math.ceil(Math.sqrt(count))));
  const bucketSize = (max - min) / bins;
  const hist = new Array(bins).fill(0);
  for (const v of series) {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((v - min) / bucketSize)),
    );
    hist[idx] += 1;
  }
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const probs = hist.map(h => h / total);
  const entropy =
    -probs.reduce((sum, p) => (p > 0 ? sum + p * Math.log2(p) : sum), 0) /
    Math.log2(bins);
  return entropy;
}
