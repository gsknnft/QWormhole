import { describe, expect, it, vi } from "vitest";
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
    (spawn as unknown as vi.Mock).mockReturnValue(mockProc);

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

  it("queryMLLayer uses configured adapter", async () => {
    const adapter = createNoopAdapter();
    setMLAdapter(adapter);
    const metrics = { value: 1 };
    const result = await queryMLLayer(metrics);
    expect(result).toEqual(metrics);
  });
});
