import { describe, expect, it, vi, beforeEach } from "vitest";

const nativeServerMock = {
  getNativeServerBackend: vi.fn(),
  isNativeServerAvailable: vi.fn(),
  NativeQWormholeServer: vi.fn(),
};

vi.mock("../src/native-server", () => nativeServerMock);

describe("createQWormholeServer transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses native server when available and preferred", async () => {
    nativeServerMock.getNativeServerBackend.mockReturnValue("lws");
    nativeServerMock.isNativeServerAvailable.mockReturnValue(true);
    nativeServerMock.NativeQWormholeServer.mockImplementation(
      function FakeNativeServer(this: any) {
        this.listen = vi.fn();
        this.close = vi.fn();
      },
    );

    const { createQWormholeServer } = await import("../src/factory");

    const result = createQWormholeServer({
      host: "127.0.0.1",
      port: 0,
      preferNative: true,
    } as any);

    expect(result.mode).toBe("native-lws");
    expect(result.nativeAvailable).toBe(true);
    expect(result.nativeBackend).toBe("lws");
    expect(nativeServerMock.NativeQWormholeServer).toHaveBeenCalled();
  });

  it("falls back to TS when native server is unavailable", async () => {
    nativeServerMock.getNativeServerBackend.mockReturnValue(null);
    nativeServerMock.isNativeServerAvailable.mockReturnValue(false);

    const { createQWormholeServer } = await import("../src/factory");

    const result = createQWormholeServer({
      host: "127.0.0.1",
      port: 0,
      preferNative: true,
    } as any);

    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(false);
    expect(result.nativeBackend).toBe(null);
    expect(nativeServerMock.NativeQWormholeServer).not.toHaveBeenCalled();
  });
});
