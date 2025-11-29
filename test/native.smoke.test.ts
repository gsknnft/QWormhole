import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("NativeTcpClient coverage", () => {
  const mockImpl = {
    connect: vi.fn(),
    send: vi.fn(),
    recv: vi.fn(() => Buffer.from("mocked")),
    close: vi.fn(),
  };

  const MockTcpClientWrapper = vi.fn(function MockTcpClientWrapperCtor() {
    return mockImpl;
  });

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockImpl.connect.mockClear();
    mockImpl.send.mockClear();
    mockImpl.recv.mockClear();
    mockImpl.close.mockClear();
    MockTcpClientWrapper.mockClear();
  });

  afterEach(() => {
    // Clear global binding overrides between tests
    delete (globalThis as { bindings?: unknown }).bindings;
  });

  it("throws error if native bindings missing", async () => {
    vi.stubGlobal("bindings", () => {
      throw new Error("not found");
    });
    const { NativeTcpClient } = await import("../src/native");
    expect(() => new NativeTcpClient()).toThrow(
      /Native qwormhole binding not available/,
    );
  });

  it("prefers libwebsockets binding when available", async () => {
    const bindingsMock = vi.fn((name: string) => {
      if (name === "qwormhole_lws") {
        return { TcpClientWrapper: MockTcpClientWrapper };
      }
      throw new Error("not found");
    });
    vi.stubGlobal("bindings", bindingsMock);
    const { NativeTcpClient, getNativeBackend } = await import("../src/native");
    const client = new NativeTcpClient();
    expect(client).toBeDefined();
    expect(client.backend).toBe("lws");
    expect(getNativeBackend()).toBe("lws");
    client.connect("host", 123);
    client.send("data");
    expect(client.recv()).toEqual(Buffer.from("mocked"));
    client.close();
    expect(mockImpl.connect).toHaveBeenCalledWith("host", 123);
    expect(mockImpl.send).toHaveBeenCalledWith("data");
    expect(mockImpl.recv).toHaveBeenCalled();
    expect(mockImpl.close).toHaveBeenCalled();
  });

  it("falls back to libsocket binding if LWS is unavailable", async () => {
    const bindingsMock = vi.fn((name: string) => {
      if (name === "qwormhole") {
        return { TcpClientWrapper: MockTcpClientWrapper };
      }
      throw new Error("not found");
    });
    vi.stubGlobal("bindings", bindingsMock);
    const { NativeTcpClient, getNativeBackend } = await import("../src/native");
    const client = new NativeTcpClient();
    expect(client.backend).toBe("libsocket");
    expect(getNativeBackend()).toBe("libsocket");
  });

  it("connect accepts options object for LWS backend", async () => {
    const bindingsMock = vi.fn((name: string) => {
      if (name === "qwormhole_lws") {
        return { TcpClientWrapper: MockTcpClientWrapper };
      }
      throw new Error("not found");
    });
    vi.stubGlobal("bindings", bindingsMock);
    const { NativeTcpClient } = await import("../src/native");
    const client = new NativeTcpClient();
    client.connect({ host: "example.com", port: 8080, useTls: true });
    expect(mockImpl.connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: "example.com", port: 8080, useTls: true }),
    );
    client.close();
  });
});
