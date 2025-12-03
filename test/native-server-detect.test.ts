import { describe, it, expect, vi, beforeEach } from "vitest";

const bindingFactory = vi.fn();

vi.mock("bindings", () => ({
  default: bindingFactory,
}));

describe("native server detection", () => {
  beforeEach(() => {
    vi.resetModules();
    bindingFactory.mockReset();
  });

  it("loads native binding when checking availability", async () => {
    bindingFactory.mockImplementation((name: string) => {
      if (name === "qwormhole_lws") {
        return { QWormholeServerWrapper: vi.fn() };
      }
      const err = new Error("not found");
      // emulate bindings throwing to signal missing module
      throw err;
    });

    const { isNativeServerAvailable, getNativeServerBackend } =
      await import("../src/native-server.js");

    expect(isNativeServerAvailable()).toBe(true);
    expect(getNativeServerBackend()).toBe("lws");
    expect(bindingFactory).toHaveBeenCalledTimes(1);
    expect(bindingFactory).toHaveBeenCalledWith("qwormhole_lws");
  });

  it("returns false when bindings are missing", async () => {
    bindingFactory.mockImplementation(() => {
      const err = new Error("missing");
      throw err;
    });

    const { isNativeServerAvailable } = await import("../src/native-server.js");

    expect(isNativeServerAvailable()).toBe(false);
    expect(bindingFactory).toHaveBeenCalled();
  });
});
