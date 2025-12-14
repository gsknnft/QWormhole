import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { QWormholeClient } from "../src/client";
import { QWormholeServer } from "../src/server";
import {
  createQWormholeClient,
  createQWormholeServer,
  CreateClientOptions,
} from "../src/core/factory";
import {
  NativeTcpClient,
  getNativeBackend,
  isNativeAvailable,
} from "../src/core/NativeTCPClient";

vi.mock("../src/core/NativeTCPClient", () => {
  const isNativeAvailableMock = vi.fn(() => true);
  const getNativeBackendMock = vi.fn(() => "lws");
  class NativeTcpClientMock {
    backend: "lws" | "libsocket";
    constructor(kind?: "lws" | "libsocket") {
      this.backend = kind ?? "lws";
    }
  }
  return {
    NativeTcpClient: NativeTcpClientMock,
    isNativeAvailable: isNativeAvailableMock,
    getNativeBackend: getNativeBackendMock,
  };
});

const isNativeAvailableMock = isNativeAvailable as Mock;
const getNativeBackendMock = getNativeBackend as Mock;
const NativeTcpClientMock = NativeTcpClient as unknown as {
  new (kind?: "lws" | "libsocket"): { backend: "lws" | "libsocket" };
};

describe("createQWormholeClient", () => {
  const defaultOptions: CreateClientOptions<Buffer> = {
    host: "127.0.0.1",
    port: 9,
  };

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
    expect(result.client).toBeInstanceOf(NativeTcpClientMock);
    expect(result.mode).toBe("native-lws");
    expect(result.nativeAvailable).toBe(true);
    expect(result.nativeBackend).toBe("lws");
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
    const options = {
      host: "127.0.0.1",
      port: 0,
    };
    const result = createQWormholeServer(options);
    expect(result.server).toBeInstanceOf(QWormholeServer);
    expect(result.mode).toBe("ts");
  });
});
