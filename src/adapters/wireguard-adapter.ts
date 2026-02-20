/**
 * WireGuardAdapter
 * ----------------
 * Optional L3 underlay for SigilNet's Sovereign Tunnel.
 * Provides system-level IP tunnelling using WireGuard,
 * giving defence-in-depth when combined with the L7 semantic VPN.
 *
 * This module is safe to import even if WireGuard binaries
 * are not present; all functions reject gracefully.
 */

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(_exec);

export interface PeerConfig {
  name: string;
  configFile: string; // Path to wg-quick configuration
  cidr?: string;      // Optional route to add
}

export interface WireGuardStats {
  peer: string;
  received: number;
  sent: number;
}

export interface WireGuardAdapter {
  setupTunnel(peer: PeerConfig): Promise<void>;
  routeTraffic(cidr: string): Promise<void>;
  getStats(): Promise<WireGuardStats[]>;
  teardown(name?: string): Promise<void>;
}

function parseStats(output: string): WireGuardStats[] {
  // Example wg show wg0 transfer: "peerA 1.23KiB 4.56KiB\npeerB ..."
  const lines = output.trim().split("\n");
  return lines.map(line => {
    const [peer, recv, sent] = line.split(/\s+/);
    const parse = (v: string) => parseFloat(v.replace(/[A-Za-z]/g, "")) * 1024;
    return { peer, received: parse(recv), sent: parse(sent) };
  });
}

/**
 * Validate and sanitize input to prevent shell injection
 */
function validatePath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid path: must be a non-empty string');
  }
  // Prevent shell injection by checking for dangerous characters
  if (/[;&|`$(){}[\]<>]/.test(path)) {
    throw new Error('Invalid path: contains shell metacharacters');
  }
}

function validateCIDR(cidr: string): void {
  if (!cidr || typeof cidr !== 'string') {
    throw new Error('Invalid CIDR: must be a non-empty string');
  }
  // Basic CIDR validation (IP/mask)
  if (!/^[\d./]+$/.test(cidr)) {
    throw new Error('Invalid CIDR format');
  }
}

function validateInterfaceName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid interface name: must be a non-empty string');
  }
  // Allow only alphanumeric and underscore/dash
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Invalid interface name: must be alphanumeric with _ or -');
  }
}

/**
 * Default Node implementation (Linux/macOS).
 * Requires wg-quick in PATH and root privileges for up/down.
 */
export const wireGuardAdapter: WireGuardAdapter = {
  async setupTunnel(peer) {
    validatePath(peer.configFile);
    validateInterfaceName(peer.name);
    await exec(`sudo wg-quick up ${peer.configFile}`);
    if (peer.cidr) await this.routeTraffic(peer.cidr);
    console.log(`[wireguard] tunnel up for ${peer.name}`);
  },

  async routeTraffic(cidr) {
    validateCIDR(cidr);
    await exec(`sudo ip route add ${cidr} dev wg0`).catch(() => {});
  },

  async getStats() {
    try {
      const { stdout } = await exec(`sudo wg show all transfer`);
      return parseStats(stdout);
    } catch {
      return [];
    }
  },

  async teardown(name = "wg0") {
    validateInterfaceName(name);
    await exec(`sudo wg-quick down ${name}`).catch(() => {});
    console.log(`[wireguard] tunnel down for ${name}`);
  },
};
