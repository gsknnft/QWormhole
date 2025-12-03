import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import {
  createNoopAdapter,
  createQwormTorchAdapter,
  createRpcAdapter,
  createSpawnAdapter,
  queryMLLayer,
  setMLAdapter,
} from "../src/utils/mlAdapter";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("mlAdapter", () => {
  beforeEach(() => {
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReset();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("noop adapter echoes metrics", async () => {
    const adapter = createNoopAdapter();
    const metrics = { foo: "bar" };
    await expect(adapter.run(metrics)).resolves.toEqual(metrics);
  });

  it("qworm_torch returns stats", async () => {
    const adapter = createQwormTorchAdapter({ sampleLimit: 10 });
    const metrics = { samples: [1, 2, 3, 4] };
    const result = (await adapter.run(metrics)) as any;
    expect(result.adapter).toBe("qworm_torch");
    expect(result.stats.count).toBeGreaterThan(0);
  });

  it("qworm_torch handles empty metric payloads", async () => {
    const adapter = createQwormTorchAdapter();
    const result = (await adapter.run({})) as any;
    expect(result.stats.count).toBe(0);
    expect(result.echo).toEqual({});
  });

  it("qworm_torch enforces sample limits and entropy edges", async () => {
    const adapter = createQwormTorchAdapter({ sampleLimit: 2 });
    const result = (await adapter.run({ nested: [5, 5, 5, 5, 5] })) as any;
    expect(result.stats.count).toBe(2);
    expect(result.stats.entropy).toBe(0);
  });

  it("spawn adapter shells out with provided command", async () => {
    const mockProc = {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: {
        on: vi.fn((_event, cb) => cb('{"ok":true}')),
      },
      once: vi.fn(),
      on: vi.fn((event, cb) => {
        if (event === "close") cb();
      }),
    };
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

    const adapter = createSpawnAdapter({ command: "echo" });
    const metrics = { hello: "world" };
    const result = await adapter.run(metrics);

    expect(spawn).toHaveBeenCalledWith(
      "echo",
      [],
      expect.objectContaining({ stdio: ["pipe", "pipe", "inherit"] }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("spawn adapter rejects when the process errors", async () => {
    const error = new Error("spawn failure");
    const mockProc = {
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn() },
      once: vi.fn((event, cb) => {
        if (event === "error") cb(error);
        return mockProc;
      }),
      on: vi.fn(),
    };
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

    const adapter = createSpawnAdapter({ command: "fail" });
    await expect(adapter.run({})).rejects.toThrow("spawn failure");
  });

  it("rpc adapter posts JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"ok":true}'),
    });
    (global as any).fetch = fetchMock;

    const adapter = createRpcAdapter({ url: "https://example.test" });
    const result = await adapter.run({ a: 1 });

    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("rpc adapter rejects on HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    });
    (global as any).fetch = fetchMock;

    const adapter = createRpcAdapter({ url: "https://example.test" });
    await expect(adapter.run({})).rejects.toThrow(/HTTP 500/);
  });

  it("rpc adapter enforces timeout aborts", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_url, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      });
      (global as any).fetch = fetchMock;

      const adapter = createRpcAdapter({
        url: "https://example.test",
        timeoutMs: 1,
      });
      const promise = adapter.run({ value: 1 });
      vi.advanceTimersByTime(5);
      await expect(promise).rejects.toThrow(/aborted/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("queryMLLayer uses configured adapter", async () => {
    const adapter = createNoopAdapter();
    setMLAdapter(adapter);
    const metrics = { value: 1 };
    const result = await queryMLLayer(metrics);
    expect(result).toEqual(metrics);
  });

  it("queryMLLayer respects explicit selection for RPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"status":"ok"}'),
    });
    (global as any).fetch = fetchMock;
    const metrics = { foo: "bar" };
    const result = await queryMLLayer(metrics, {
      name: "rpc",
      options: { url: "https://rpc.test", headers: { "x-test": "1" } },
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual({ status: "ok" });
  });

  it("prefers env-provided adapter on first query", async () => {
    vi.resetModules();
    process.env.QWORMHOLE_ML_ADAPTER = "rpc";
    process.env.QWORMHOLE_ML_RPC_URL = "https://env.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"env":true}'),
    });
    (global as any).fetch = fetchMock;

    const { queryMLLayer: freshQuery } = await import("../src/utils/mlAdapter");
    const result = await freshQuery({ value: 2 });
    expect(fetchMock).toHaveBeenCalled();
    expect(result).toEqual({ env: true });

    delete process.env.QWORMHOLE_ML_ADAPTER;
    delete process.env.QWORMHOLE_ML_RPC_URL;
  });

  it("logs a warning when env spawn config is incomplete", async () => {
    vi.resetModules();
    process.env.QWORMHOLE_ML_ADAPTER = "spawn";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { queryMLLayer: freshQuery } = await import("../src/utils/mlAdapter");
    const result = (await freshQuery({ value: 1 })) as any;
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to resolve ML adapter"),
    );
    expect(result.adapter).toBe("qworm_torch");
    warnSpy.mockRestore();
    delete process.env.QWORMHOLE_ML_ADAPTER;
  });
});
