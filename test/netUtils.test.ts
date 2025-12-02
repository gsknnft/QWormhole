import { describe, expect, it, vi, afterEach } from "vitest";
import os from "node:os";
import { resolveInterfaceAddress } from "../src/utils/netUtils.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveInterfaceAddress", () => {
  it("returns undefined when interface is missing", () => {
    const address = resolveInterfaceAddress("does-not-exist");
    expect(address).toBeUndefined();
  });

  it("returns first non-internal IPv4 address for interface", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      wg0: [
        {
          address: "10.0.0.2",
          family: "IPv4",
          internal: false,
          cidr: "10.0.0.2/24",
          mac: "00:00:00:00:00:00",
          netmask: "255.255.255.0",
        } as any,
      ],
    });
    const address = resolveInterfaceAddress("wg0");
    expect(address).toBe("10.0.0.2");
  });
});
