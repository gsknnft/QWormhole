# Mesh Network Tutorial

This guide demonstrates how to build mesh networks using QWormhole with WireGuard integration.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Basic Mesh Setup](#basic-mesh-setup)
- [WireGuard Interface Binding](#wireguard-interface-binding)
- [Node Discovery with Handshake Tags](#node-discovery-with-handshake-tags)
- [Multi-Region Mesh](#multi-region-mesh)
- [Failover and Reconnection](#failover-and-reconnection)
- [Full Mesh Example](#full-mesh-example)

---

## Overview

QWormhole's interface binding and handshake tags make it ideal for building mesh networks over encrypted tunnels like WireGuard. Each node can:

- Bind to specific network interfaces (e.g., `wg0`)
- Announce identity and metadata via handshake tags
- Auto-reconnect with exponential backoff
- Route messages based on peer information

---

## Prerequisites

1. WireGuard configured on all nodes
2. QWormhole installed: `npm install @gsknnft/qwormhole`
3. Network connectivity between nodes (WireGuard peers configured)

Example WireGuard config (`/etc/wireguard/wg0.conf`):

```ini
[Interface]
Address = 10.0.0.1/24
PrivateKey = <node-private-key>
ListenPort = 51820

[Peer]
PublicKey = <peer-public-key>
AllowedIPs = 10.0.0.2/32
Endpoint = peer.example.com:51820
```

---

## Basic Mesh Setup

### Node A (Server)

```typescript
import { QWormholeRuntime } from "@gsknnft/qwormhole";

const rt = new QWormholeRuntime({
  protocolVersion: "mesh-1.0",
  handshakeTags: { 
    nodeId: "alpha", 
    region: "us-west",
    role: "coordinator"
  },
});

const server = rt.createServer({
  host: "10.0.0.1", // WireGuard interface IP
  port: 9000,
});

server.on("connection", (peer) => {
  console.log(`Peer connected: ${peer.handshake?.tags?.nodeId}`);
  console.log(`  Region: ${peer.handshake?.tags?.region}`);
});

server.on("message", ({ client, data }) => {
  console.log(`Message from ${client.handshake?.tags?.nodeId}:`, data);
});

await server.listen();
console.log("Node Alpha listening on 10.0.0.1:9000");
```

### Node B (Client)

```typescript
import { QWormholeRuntime } from "@gsknnft/qwormhole";

const rt = new QWormholeRuntime({
  protocolVersion: "mesh-1.0",
  handshakeTags: { 
    nodeId: "beta", 
    region: "eu-central",
    role: "worker"
  },
});

const client = rt.createClient({
  host: "10.0.0.1",
  port: 9000,
});

client.on("connect", () => {
  console.log("Connected to coordinator");
  client.send({ type: "register", capabilities: ["compute", "storage"] });
});

await client.connect();
```

---

## WireGuard Interface Binding

Bind sockets directly to WireGuard interfaces:

```typescript
import { QWormholeClient } from "@gsknnft/qwormhole";

const client = new QWormholeClient({
  host: "10.0.0.1",
  port: 9000,
  interfaceName: "wg0", // Bind to WireGuard interface
  protocolVersion: "mesh-1.0",
  handshakeTags: {
    nodeId: "gamma",
    region: "ap-south",
  },
});

await client.connect();
```

Or specify the local address explicitly:

```typescript
const client = new QWormholeClient({
  host: "10.0.0.1",
  port: 9000,
  localAddress: "10.0.0.3", // This node's WireGuard IP
  protocolVersion: "mesh-1.0",
});
```

---

## Node Discovery with Handshake Tags

Use handshake tags to build a peer registry:

```typescript
import { QWormholeServer } from "@gsknnft/qwormhole";

interface PeerInfo {
  nodeId: string;
  region: string;
  capabilities: string[];
  connectedAt: number;
}

const peers = new Map<string, PeerInfo>();

const server = new QWormholeServer({
  host: "10.0.0.1",
  port: 9000,
  protocolVersion: "mesh-1.0",
});

server.on("connection", (client) => {
  const tags = client.handshake?.tags as Record<string, unknown> | undefined;
  
  if (tags?.nodeId) {
    peers.set(client.id, {
      nodeId: String(tags.nodeId),
      region: String(tags.region ?? "unknown"),
      capabilities: Array.isArray(tags.capabilities) 
        ? tags.capabilities.map(String) 
        : [],
      connectedAt: Date.now(),
    });
    
    // Broadcast peer list to all nodes
    server.broadcast({
      type: "peer-update",
      peers: Array.from(peers.values()),
    });
  }
});

server.on("clientClosed", ({ client }) => {
  peers.delete(client.id);
  server.broadcast({
    type: "peer-update",
    peers: Array.from(peers.values()),
  });
});

await server.listen();
```

---

## Multi-Region Mesh

Build a multi-region mesh with region-aware routing:

### Coordinator Node

```typescript
import { QWormholeServer, jsonDeserializer } from "@gsknnft/qwormhole";

interface MeshMessage {
  type: string;
  targetRegion?: string;
  payload: unknown;
}

const server = new QWormholeServer<MeshMessage>({
  host: "10.0.0.1",
  port: 9000,
  protocolVersion: "mesh-1.0",
  deserializer: jsonDeserializer,
  handshakeTags: { nodeId: "coordinator", region: "us-west" },
});

// Track peers by region
const regionPeers = new Map<string, Set<string>>();

server.on("connection", (client) => {
  const region = String(client.handshake?.tags?.region ?? "unknown");
  
  if (!regionPeers.has(region)) {
    regionPeers.set(region, new Set());
  }
  regionPeers.get(region)!.add(client.id);
});

server.on("message", ({ client, data }) => {
  if (data.type === "broadcast" && data.targetRegion) {
    // Route to specific region
    const targets = regionPeers.get(data.targetRegion);
    if (targets) {
      for (const peerId of targets) {
        const peer = server.getConnection(peerId);
        peer?.send(data.payload);
      }
    }
  }
});

await server.listen();
```

### Regional Worker

```typescript
import { QWormholeClient, jsonDeserializer } from "@gsknnft/qwormhole";

const client = new QWormholeClient({
  host: "10.0.0.1",
  port: 9000,
  interfaceName: "wg0",
  protocolVersion: "mesh-1.0",
  deserializer: jsonDeserializer,
  handshakeTags: { 
    nodeId: "worker-eu-1",
    region: "eu-central",
    capabilities: ["gpu", "storage"],
  },
  reconnect: {
    enabled: true,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    maxAttempts: 10,
  },
});

client.on("message", (msg) => {
  console.log("Received from mesh:", msg);
});

client.on("reconnecting", ({ attempt, delayMs }) => {
  console.log(`Reconnecting to mesh (attempt ${attempt}, delay ${delayMs}ms)`);
});

await client.connect();
```

---

## Failover and Reconnection

Configure automatic failover with multiple coordinators:

```typescript
import { QWormholeClient } from "@gsknnft/qwormhole";

const COORDINATORS = [
  { host: "10.0.0.1", port: 9000 },
  { host: "10.0.0.2", port: 9000 },
  { host: "10.0.0.3", port: 9000 },
];

let currentIndex = 0;

async function connectToMesh() {
  const coord = COORDINATORS[currentIndex];
  
  const client = new QWormholeClient({
    host: coord.host,
    port: coord.port,
    interfaceName: "wg0",
    protocolVersion: "mesh-1.0",
    handshakeTags: { nodeId: "worker-failover" },
    reconnect: {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2,
      maxAttempts: 5,
    },
  });

  client.on("close", async ({ hadError }) => {
    if (hadError) {
      // Try next coordinator
      currentIndex = (currentIndex + 1) % COORDINATORS.length;
      console.log(`Failing over to coordinator ${currentIndex}`);
      await connectToMesh();
    }
  });

  await client.connect();
  return client;
}

const client = await connectToMesh();
```

---

## Full Mesh Example

Complete mesh with peer discovery, heartbeats, and message routing:

```typescript
// mesh-node.ts
import { QWormholeRuntime, QWormholeServer, QWormholeClient } from "@gsknnft/qwormhole";

interface MeshConfig {
  nodeId: string;
  region: string;
  listenPort: number;
  peers: Array<{ host: string; port: number }>;
}

export class MeshNode {
  private rt: QWormholeRuntime;
  private server: QWormholeServer;
  private clients = new Map<string, QWormholeClient>();
  private peerInfo = new Map<string, { nodeId: string; region: string }>();

  constructor(private config: MeshConfig) {
    this.rt = new QWormholeRuntime({
      protocolVersion: "mesh-1.0",
      interfaceName: "wg0",
      handshakeTags: {
        nodeId: config.nodeId,
        region: config.region,
      },
    });

    this.server = this.rt.createServer({
      host: "0.0.0.0",
      port: config.listenPort,
    });

    this.setupServerHandlers();
  }

  private setupServerHandlers() {
    this.server.on("connection", (peer) => {
      const tags = peer.handshake?.tags as Record<string, string> | undefined;
      if (tags?.nodeId) {
        this.peerInfo.set(peer.id, {
          nodeId: tags.nodeId,
          region: tags.region,
        });
        console.log(`[${this.config.nodeId}] Peer joined: ${tags.nodeId}`);
      }
    });

    this.server.on("clientClosed", ({ client }) => {
      const info = this.peerInfo.get(client.id);
      if (info) {
        console.log(`[${this.config.nodeId}] Peer left: ${info.nodeId}`);
        this.peerInfo.delete(client.id);
      }
    });

    this.server.on("message", ({ client, data }) => {
      const info = this.peerInfo.get(client.id);
      console.log(`[${this.config.nodeId}] Message from ${info?.nodeId}:`, data);
    });
  }

  async start() {
    // Start server
    await this.server.listen();
    console.log(`[${this.config.nodeId}] Listening on port ${this.config.listenPort}`);

    // Connect to known peers
    for (const peer of this.config.peers) {
      const client = this.rt.createClient({
        host: peer.host,
        port: peer.port,
        reconnect: {
          enabled: true,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          multiplier: 2,
          maxAttempts: 0, // Infinite
        },
      });

      client.on("connect", () => {
        console.log(`[${this.config.nodeId}] Connected to ${peer.host}:${peer.port}`);
      });

      await client.connect();
      this.clients.set(`${peer.host}:${peer.port}`, client);
    }
  }

  broadcast(message: unknown) {
    this.server.broadcast(message);
    for (const client of this.clients.values()) {
      client.send(message);
    }
  }

  async stop() {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    await this.server.close();
  }
}

// Usage:
// const node = new MeshNode({
//   nodeId: "alpha",
//   region: "us-west",
//   listenPort: 9000,
//   peers: [
//     { host: "10.0.0.2", port: 9000 },
//     { host: "10.0.0.3", port: 9000 },
//   ],
// });
// await node.start();
```

---

## Best Practices

1. **Use WireGuard for transport security** - QWormhole handles framing; WireGuard handles encryption at the network layer.

2. **Include node metadata in handshake tags** - Region, role, capabilities help with routing decisions.

3. **Enable auto-reconnect** - Mesh networks experience churn; configure appropriate backoff.

4. **Use protocol versioning** - Ensures all nodes speak the same protocol.

5. **Monitor telemetry** - Use `onTelemetry` to track mesh health.

```typescript
const server = new QWormholeServer({
  // ...options
  onTelemetry: (metrics) => {
    console.log(`Connections: ${metrics.connections}`);
    console.log(`Bytes in/out: ${metrics.bytesIn}/${metrics.bytesOut}`);
  },
});
```

---

## See Also

- [TLS Examples](./tls-examples.md) - For encrypted mesh without WireGuard
- [Deployment Patterns](./deployment-patterns.md) - Production deployment guides
