import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { querySovereignML, querySigilEventML } from "../../vera-torch/ts/runtime";
import type { SigilEvent } from "../../vera-torch/ts/sigilEvent";
import { spawn } from "child_process";

vi.mock("child_process", () => {
  return {
    spawn: vi.fn(),
  };
});

function mockProcess(output: string) {
  const stdout = {
    on: vi.fn((event, cb) => {
      if (event === "data") cb(output);
    }),
  };
  return {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    stdout,
    on: vi.fn((event, cb) => {
      if (event === "close") cb();
    }),
  };
}

describe("runtime.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("querySovereignML", () => {
    it("should send metrics and resolve with output", async () => {
      const output = '{"result":42}';
      (spawn as any).mockImplementation(() => mockProcess(output));

      const metrics = { foo: "bar" };
      const result = await querySovereignML(metrics);

      expect(spawn).toHaveBeenCalledWith(
        "python",
        ["-m", "vera_torch.rpc_server"],
        { stdio: ["pipe", "pipe", "inherit"] }
      );
      expect(result).toBe(output);
    });

    it("should handle empty output", async () => {
      (spawn as any).mockImplementation(() => mockProcess(""));

      const result = await querySovereignML({});
      expect(result).toBe("");
    });
  });

  describe("querySigilEventML", () => {
    it("should send metrics and resolve with parsed SigilEvent", async () => {
      const event: SigilEvent = { type: "test", payload: { a: 1 } } as any;
      (spawn as any).mockImplementation(() => mockProcess(JSON.stringify(event)));

      const metrics = { foo: "bar" };
      const result = await querySigilEventML(metrics);

      expect(spawn).toHaveBeenCalledWith(
        "python",
        ["-m", "vera_torch.rpc_server"],
        { stdio: ["pipe", "pipe", "inherit"] }
      );
      expect(result).toEqual(event);
    });

    it("should throw on invalid JSON output", async () => {
      (spawn as any).mockImplementation(() => mockProcess("not-json"));
      await expect(querySigilEventML({})).rejects.toThrow();
    });

    it("should handle empty output as error", async () => {
      (spawn as any).mockImplementation(() => mockProcess(""));
      await expect(querySigilEventML({})).rejects.toThrow();
    });
  });
});