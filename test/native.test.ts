import { beforeEach, describe, expect, it, vi } from "vitest";

const bindingStore = vi.hoisted(() => ({
  modules: new Map<
    string,
    { TcpClientWrapper: new () => NativeBindingClient }
  >(),
}));

type NativeBindingClient = {
  connect: (...args: any[]) => void;
  send: (data: string | Buffer) => void;
  recv: (length?: number) => Buffer;
  close: () => void;
};

vi.mock("bindings", () => {
  const loadBinding = (name: string) => {
    const mod = bindingStore.modules.get(name);
    if (!mod) {
      throw new Error(`binding ${name} missing`);
    }
    return mod;
  };
  return { default: loadBinding };
});

function registerBinding(name: string) {
  const client: NativeBindingClient = {
    connect: vi.fn(),
    send: vi.fn(),
    recv: vi.fn(() => Buffer.from("ok")),
    close: vi.fn(),
  };

  class TcpClientWrapper {
    connect = client.connect;
    send = client.send;
    recv = client.recv;
    close = client.close;
  }

  bindingStore.modules.set(name, { TcpClientWrapper });
  return client;
}

async function importNative() {
  return import("../src/native");
}

describe("native binding loader", () => {
  beforeEach(() => {
    bindingStore.modules.clear();
    vi.resetModules();
    delete process.env.QWORMHOLE_DEBUG_NATIVE;
  });

  it("reports unavailable when no bindings exist", async () => {
    const native = await importNative();
    expect(native.isNativeAvailable()).toBe(false);
    expect(native.getNativeBackend()).toBeNull();
    expect(() => new native.NativeTcpClient()).toThrow(/not available/i);
  });

  it("prefers libwebsockets backend when present", async () => {
    const client = registerBinding("qwormhole_lws");
    const native = await importNative();
    const tcp = new native.NativeTcpClient();
    tcp.connect({ host: "localhost", port: 1234, useTls: true });
    expect(native.getNativeBackend()).toBe("lws");
    expect(tcp.backend).toBe("lws");
    expect(client.connect).toHaveBeenCalledWith({
      host: "localhost",
      port: 1234,
      useTls: true,
    });
  });

  it("falls back to libsocket when lws missing and normalizes options", async () => {
    const client = registerBinding("qwormhole");
    const native = await importNative();
    const tcp = new native.NativeTcpClient();
    tcp.connect({ host: "mesh.sigil", port: 7000 });
    expect(native.getNativeBackend()).toBe("libsocket");
    expect(client.connect).toHaveBeenCalledWith("mesh.sigil", 7000);
    tcp.connect("mesh.sigil", 8000);
    expect(client.connect).toHaveBeenCalledWith("mesh.sigil", 8000);
  });

  it("respects preferred backend when both bindings exist", async () => {
    registerBinding("qwormhole_lws");
    const libsocketClient = registerBinding("qwormhole");
    const native = await importNative();
    const tcp = new native.NativeTcpClient("libsocket");
    tcp.connect("peer", 9000);
    expect(tcp.backend).toBe("libsocket");
    expect(libsocketClient.connect).toHaveBeenCalledWith("peer", 9000);
  });
});
