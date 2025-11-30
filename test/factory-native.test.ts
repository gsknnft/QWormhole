import { describe, expect, it, vi, beforeEach } from "vitest";

const nativeMock = {
  getNativeBackend: vi.fn(),
  isNativeAvailable: vi.fn(),
};

vi.mock("../src/native", () => {
  class FakeNativeTcpClient {
    backend: "lws" | "libsocket";
    constructor(kind?: "lws" | "libsocket") {
      this.backend = kind ?? "lws";
    }
    connect() {}
    send() {}
    recv() {
      return Buffer.alloc(0);
    }
    close() {}
  }
  return {
    NativeTcpClient: FakeNativeTcpClient,
    getNativeBackend: nativeMock.getNativeBackend,
    isNativeAvailable: nativeMock.isNativeAvailable,
  };
});

describe("createQWormholeClient transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses native transport when available and preferred", async () => {
    nativeMock.getNativeBackend.mockReturnValue("lws");
    nativeMock.isNativeAvailable.mockReturnValue(true);
    const { createQWormholeClient } = await import("../src/factory");

    const result = createQWormholeClient({
      // host: "127.0.0.1",
      // port: 9,
      preferNative: true,
    });

    expect(result.mode).toBe("native-lws");
    expect(result.nativeAvailable).toBe(true);
    expect(result.nativeBackend).toBe("lws");
  });

  it("falls back to TS when native is unavailable", async () => {
    nativeMock.getNativeBackend.mockReturnValue(null);
    nativeMock.isNativeAvailable.mockReturnValue(false);
    const { createQWormholeClient } = await import("../src/factory");

    const result = createQWormholeClient({
      // host: "127.0.0.1",
      // port: 9,
      preferNative: true,
    });

    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(false);
    expect(result.nativeBackend).toBe(null);
  });
});
