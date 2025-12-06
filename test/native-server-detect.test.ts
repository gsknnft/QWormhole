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
    bindingFactory.mockImplementation(
      (arg: string | { module_root: string; bindings: string }) => {
        const bindingName = typeof arg === "string" ? arg : arg.bindings;
        if (bindingName === "qwormhole_lws") {
          return { QWormholeServerWrapper: vi.fn() };
        }
        const err = new Error("not found");
        // emulate bindings throwing to signal missing module
        throw err;
      },
    );

    const { isNativeServerAvailable, getNativeServerBackend } =
      await import("../src/native-server.js");

    expect(isNativeServerAvailable()).toBe(true);
    expect(getNativeServerBackend()).toBe("lws");
    expect(bindingFactory).toHaveBeenCalledWith(
      expect.objectContaining({ bindings: "qwormhole_lws" }),
    );
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

  it("respects preferred backend overrides", async () => {
    const original = process.env.QWORMHOLE_NATIVE_SERVER_PREFERRED;
    process.env.QWORMHOLE_NATIVE_SERVER_PREFERRED = "libsocket";

    bindingFactory.mockImplementation(
      (arg: string | { module_root: string; bindings: string }) => {
        const bindingName = typeof arg === "string" ? arg : arg.bindings;
        if (bindingName === "qwormhole") {
          return { QWormholeServerWrapper: vi.fn() };
        }
        const err = new Error("not found");
        throw err;
      },
    );

    const { isNativeServerAvailable, getNativeServerBackend } =
      await import("../src/native-server.js");

    expect(isNativeServerAvailable("libsocket")).toBe(true);
    expect(getNativeServerBackend("libsocket")).toBe("libsocket");

    if (typeof original === "string") {
      process.env.QWORMHOLE_NATIVE_SERVER_PREFERRED = original;
    } else {
      delete process.env.QWORMHOLE_NATIVE_SERVER_PREFERRED;
    }
  });
});
