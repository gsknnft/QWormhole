import { describe, it, expect } from "vitest";
import { QWormholeRuntime } from "../src/runtime";
import { QWormholeClient, QWormholeServer } from "../src/index";

describe("QWormholeRuntime", () => {
  it("should construct with default options", () => {
    const runtime = new QWormholeRuntime();
    expect(runtime).toBeInstanceOf(QWormholeRuntime);
  });

  it("should create a client with merged options", () => {
    const runtime = new QWormholeRuntime({ protocolVersion: "1.0.0" });
    const client = runtime.createClient({ host: "127.0.0.1", port: 1234 });
    expect(client).toBeInstanceOf(QWormholeClient);
  });

  it("should create a server with merged options", () => {
    const runtime = new QWormholeRuntime({ protocolVersion: "1.0.0" });
    const server = runtime.createServer({ host: "127.0.0.1", port: 1234 });
    expect(server).toBeInstanceOf(QWormholeServer);
  });

  it("should use custom serializer/deserializer for client", () => {
    const serializer = (x: any) => Buffer.from("test");
    const deserializer = (x: Buffer) => x.toString();
    const runtime = new QWormholeRuntime({ serializer, deserializer });
    const client = runtime.createClient({ host: "127.0.0.1", port: 1234 });
    expect(client).toBeInstanceOf(QWormholeClient);
  });

  it("should use custom serializer/deserializer for server", () => {
    const serializer = (x: any) => Buffer.from("test");
    const deserializer = (x: Buffer) => x.toString();
    const runtime = new QWormholeRuntime({ serializer, deserializer });
    const server = runtime.createServer({ host: "127.0.0.1", port: 1234 });
    expect(server).toBeInstanceOf(QWormholeServer);
  });
});