import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { QWormholeClient } from "../src/client";
import { QWormholeServer } from "../src/server";
import {
  getNativeBackend,
  // NativeTcpClient,
  isNativeAvailable,
} from "../src/native";
import {
  createQWormholeClient,
  createQWormholeServer,
  CreateClientOptions,
} from "../src/factory";

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
  const defaultOptions: CreateClientOptions<Buffer> = {};

  const isNativeAvailableMock = isNativeAvailable as Mock;
  const getNativeBackendMock = getNativeBackend as Mock;

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
    expect(result.nativeBackend).toBe("lws");
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
    expect(result.nativeBackend).toBe("lws");
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
    expect(result.nativeBackend).toBeNull();
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
    expect(result.nativeBackend).toBe("lws");
  });
});

describe("createQWormholeServer", () => {
  it("always returns QWormholeServer and mode ts", () => {
    const options = {};
    const result = createQWormholeServer(options);
    expect(result.server).toBeInstanceOf(QWormholeServer);
    expect(result.mode).toBe("ts");
  });
});
