import { vi, describe, beforeEach, expect, it } from "vitest";
import { CreateClientOptions, createQWormholeClient } from "../src/factory";
import { getNativeBackend, isNativeAvailable } from "../src/native";
import { QWormholeClient } from "../src/client";

vi.mock("../src/native", () => {
  const isNativeAvailableMock = vi.fn(() => true);
  const getNativeBackendMock = vi.fn(() => "lws");
  class NativeTcpClientMock {
    native = true;
    backend = "lws";
  }
  return {
    NativeTcpClient: NativeTcpClientMock,
    isNativeAvailable: isNativeAvailableMock,
    getNativeBackend: getNativeBackendMock,
  };
});

describe("createQWormholeClient", () => {
  const defaultOptions: CreateClientOptions<Buffer> = {
    host: "127.0.0.1",
    port: 9000,
  };
  const isNativeAvailableMock = isNativeAvailable as unknown as vi.Mock;
  const getNativeBackendMock = getNativeBackend as unknown as vi.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    isNativeAvailableMock.mockReturnValue(true);
    getNativeBackendMock.mockReturnValue("lws");
  });

  it("returns NativeTcpClient when preferNative is true and native is available", () => {
    const result = createQWormholeClient({
      ...defaultOptions,
      preferNative: true,
    });
    expect(result.client).toHaveProperty("native", true);
    expect(result.mode).toBe("native-lws");
    expect(result.nativeAvailable).toBe(true);
  });
  it("returns QWormholeClient when preferNative is false", () => {
    const result = createQWormholeClient({
      ...defaultOptions,
      preferNative: false,
    });
    expect(result.client).toBeInstanceOf(QWormholeClient);
    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(true);
  });
  it("returns QWormholeClient when native is not available", () => {
    isNativeAvailableMock.mockReturnValue(false);
    getNativeBackendMock.mockReturnValue(null);
    const result = createQWormholeClient({
      ...defaultOptions,
      preferNative: true,
    });
    expect(result.client).toBeInstanceOf(QWormholeClient);
    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(false);
  });

  it("returns QWormholeClient when forceTs is true, even if native is available", () => {
    const result = createQWormholeClient({
      ...defaultOptions,
      preferNative: true,
      forceTs: true,
    });
    expect(result.client).toBeInstanceOf(QWormholeClient);
    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(true);
  });

  it("returns QWormholeClient when forceTs is true and native is not available", () => {
    isNativeAvailableMock.mockReturnValue(false);
    getNativeBackendMock.mockReturnValue(null);
    const result = createQWormholeClient({
      ...defaultOptions,
      preferNative: true,
      forceTs: true,
    });
    expect(result.client).toBeInstanceOf(QWormholeClient);
    expect(result.mode).toBe("ts");
    expect(result.nativeAvailable).toBe(false);
  });
});
