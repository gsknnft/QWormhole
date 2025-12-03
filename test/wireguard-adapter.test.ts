import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  exec: execMock,
}));

vi.mock("node:util", () => ({
  promisify: (fn: unknown) => fn,
}));

describe("wireGuardAdapter", () => {
  type Adapter =
    (typeof import("../src/wireguard-adapter"))["wireGuardAdapter"];
  let adapter: Adapter;

  beforeEach(async () => {
    execMock.mockReset();
    execMock.mockResolvedValue({ stdout: "", stderr: "" });
    vi.resetModules();
    ({ wireGuardAdapter: adapter } = await import("../src/wireguard-adapter"));
  });

  it("brings tunnel up and routes CIDR", async () => {
    await adapter.setupTunnel({
      name: "wg0",
      configFile: "/etc/wireguard/wg0.conf",
      cidr: "10.0.0.0/24",
    });

    expect(execMock).toHaveBeenNthCalledWith(
      1,
      "sudo wg-quick up /etc/wireguard/wg0.conf",
    );
    expect(execMock).toHaveBeenNthCalledWith(
      2,
      "sudo ip route add 10.0.0.0/24 dev wg0",
    );
  });

  it("rejects invalid config paths before executing", async () => {
    await expect(
      adapter.setupTunnel({ name: "wg0", configFile: "../../../bad;rm" }),
    ).rejects.toThrow(/Invalid path/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("routeTraffic swallows command failures", async () => {
    execMock.mockRejectedValueOnce(new Error("no route"));
    await expect(adapter.routeTraffic("10.1.0.0/16")).resolves.toBeUndefined();
  });

  it("parses wg stats output", async () => {
    execMock.mockResolvedValueOnce({
      stdout: "peerA 1.00KiB 2.00KiB\npeerB 0.50KiB 1.50KiB",
    });
    const stats = await adapter.getStats();
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({
      peer: "peerA",
      received: 1024,
      sent: 2048,
    });
  });

  it("returns empty stats when wg command fails", async () => {
    execMock.mockRejectedValueOnce(new Error("wg missing"));
    const stats = await adapter.getStats();
    expect(stats).toEqual([]);
  });

  it("tears down default interface when no name provided", async () => {
    await adapter.teardown();
    expect(execMock).toHaveBeenCalledWith("sudo wg-quick down wg0");
  });
});
