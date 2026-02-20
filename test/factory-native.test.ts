import { describe, expect, it, vi, beforeEach } from "vitest";
import { createQWormholeClient } from "../src/core/factory";

// Robust Vitest partial mock for NativeTCPClient
vi.mock("../src/core/NativeTCPClient", () => {
  return {
    getNativeBackend: vi.fn(),
    isNativeAvailable: vi.fn(),
    NativeTcpClient: class MockNativeTcpClient {
      private impl: any;
      backend: string;
      constructor(preferred?: any) {
        this.backend = preferred ?? "lws";
        this.impl = {};
      }
      connect() {
        return true;
      }
      send() {
        return true;
      }
      recv() {
        return true;
      }
      close() {
        return true;
      }
      serializeTlsOptions() {
        return {};
      }
    },
  };
});

import {
  getNativeBackend,
  isNativeAvailable,
  NativeTcpClient,
} from "../src/core/NativeTCPClient";

describe("createQWormholeClient transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getNativeBackend as any).mockReturnValue("lws");
    (isNativeAvailable as any).mockReturnValue(true);
  });

  it("uses native transport when available and preferred", async () => {
    (getNativeBackend as any).mockReturnValue("lws");
    (isNativeAvailable as any).mockReturnValue(true);

    const result = createQWormholeClient({
      host: "127.0.0.1",
      port: 9,
      preferNative: true,
    });

    expect(result.mode).toBe("native-lws");
    expect(result.nativeAvailable).toBe(true);
    expect(result.nativeBackend).toBe("lws");
  });

  it("falls back to TS when backend cannot be detected", async () => {
    (getNativeBackend as any).mockReturnValue(null);
    (isNativeAvailable as any).mockReturnValue(true);

    const result = createQWormholeClient({
      host: "127.0.0.1",
      port: 9,
      preferNative: true,
    });

    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(true);
    expect(result.nativeBackend).toBe(null);
  });
});
