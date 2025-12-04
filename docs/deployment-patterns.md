# Deployment Patterns

This guide covers production deployment patterns for QWormhole servers and mesh networks.

## Table of Contents

- [Docker](#docker)
- [Kubernetes](#kubernetes)
- [Systemd Service](#systemd-service)
- [PM2 Cluster](#pm2-cluster)
- [Environment Configuration](#environment-configuration)
- [Health Checks](#health-checks)
- [Logging and Monitoring](#logging-and-monitoring)

---

## Docker

### Basic Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install native build dependencies (optional, for native acceleration)
RUN apk add --no-cache python3 make g++ openssl-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the QWormhole port
EXPOSE 9000

# Run the server
CMD ["node", "dist/server.js"]
```

### Docker Compose

```yaml
version: "3.8"

services:
  qwormhole:
    build: .
    ports:
      - "9000:9000"
    environment:
      - NODE_ENV=production
      - QWORMHOLE_HOST=0.0.0.0
      - QWORMHOLE_PORT=9000
      - QWORMHOLE_DEBUG_NATIVE=0
    volumes:
      - ./certs:/app/certs:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "scripts/health-check.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  # Optional: Multiple server instances
  qwormhole-worker:
    build: .
    deploy:
      replicas: 3
    environment:
      - NODE_ENV=production
      - QWORMHOLE_ROLE=worker
    depends_on:
      - qwormhole
    restart: unless-stopped
```

### Multi-Stage Build (Smaller Image)

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 9000

USER node

CMD ["node", "dist/server.js"]
```

---

## Kubernetes

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qwormhole
  labels:
    app: qwormhole
spec:
  replicas: 3
  selector:
    matchLabels:
      app: qwormhole
  template:
    metadata:
      labels:
        app: qwormhole
    spec:
      containers:
        - name: qwormhole
          image: your-registry/qwormhole:latest
          ports:
            - containerPort: 9000
              name: tcp
          env:
            - name: NODE_ENV
              value: "production"
            - name: QWORMHOLE_HOST
              value: "0.0.0.0"
            - name: QWORMHOLE_PORT
              value: "9000"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            tcpSocket:
              port: 9000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: 9000
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: tls-certs
              mountPath: /app/certs
              readOnly: true
      volumes:
        - name: tls-certs
          secret:
            secretName: qwormhole-tls
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: qwormhole
spec:
  selector:
    app: qwormhole
  ports:
    - port: 9000
      targetPort: 9000
      name: tcp
  type: ClusterIP
---
# For external access
apiVersion: v1
kind: Service
metadata:
  name: qwormhole-external
spec:
  selector:
    app: qwormhole
  ports:
    - port: 9000
      targetPort: 9000
      nodePort: 30900
  type: NodePort
```

### TLS Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: qwormhole-tls
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-cert>
  tls.key: <base64-encoded-key>
  ca.crt: <base64-encoded-ca>
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: qwormhole-config
data:
  config.json: |
    {
      "host": "0.0.0.0",
      "port": 9000,
      "protocolVersion": "1.0.0",
      "maxClients": 1000,
      "rateLimitBytesPerSec": 1000000
    }
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: qwormhole
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: qwormhole
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Systemd Service

### Service File

Create `/etc/systemd/system/qwormhole.service`:

```ini
[Unit]
Description=QWormhole Server
Documentation=https://github.com/gsknnft/QWormhole
After=network.target

[Service]
Type=simple
User=qwormhole
Group=qwormhole
WorkingDirectory=/opt/qwormhole
ExecStart=/usr/bin/node /opt/qwormhole/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment=NODE_ENV=production
Environment=QWORMHOLE_HOST=0.0.0.0
Environment=QWORMHOLE_PORT=9000
EnvironmentFile=-/etc/qwormhole/env

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/log/qwormhole
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

# Resource limits
LimitNOFILE=65535
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

### Installation

```bash
# Create user
sudo useradd -r -s /bin/false qwormhole

# Create directories
sudo mkdir -p /opt/qwormhole /etc/qwormhole /var/log/qwormhole
sudo chown qwormhole:qwormhole /opt/qwormhole /var/log/qwormhole

# Deploy application
sudo cp -r dist node_modules package.json /opt/qwormhole/

# Create environment file
sudo tee /etc/qwormhole/env << EOF
NODE_ENV=production
QWORMHOLE_HOST=0.0.0.0
QWORMHOLE_PORT=9000
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable qwormhole
sudo systemctl start qwormhole

# Check status
sudo systemctl status qwormhole
journalctl -u qwormhole -f
```

### Socket Activation (Optional)

For on-demand startup, create `/etc/systemd/system/qwormhole.socket`:

```ini
[Unit]
Description=QWormhole Socket

[Socket]
ListenStream=9000
Accept=no

[Install]
WantedBy=sockets.target
```

---

## PM2 Cluster

### Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "qwormhole",
      script: "./dist/server.js",
      instances: "max", // Or specific number
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        QWORMHOLE_HOST: "0.0.0.0",
        QWORMHOLE_PORT: "9000",
      },
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/qwormhole/error.log",
      out_file: "/var/log/qwormhole/out.log",
      merge_logs: true,
      // Restart policy
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};
```

### PM2 Commands

```bash
# Start in production mode
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# Logs
pm2 logs qwormhole

# Reload without downtime
pm2 reload qwormhole

# Save process list for startup
pm2 save
pm2 startup
```

### Graceful Shutdown in Application

```typescript
import { QWormholeServer } from "@gsknnft/qwormhole";

const server = new QWormholeServer({
  host: process.env.QWORMHOLE_HOST ?? "0.0.0.0",
  port: parseInt(process.env.QWORMHOLE_PORT ?? "9000"),
});

// Signal PM2 that we're ready
process.send?.("ready");

// Handle graceful shutdown
async function shutdown() {
  console.log("Shutting down gracefully...");
  await server.shutdown(5000);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await server.listen();
console.log("QWormhole server started");
```

---

## Environment Configuration

### Environment Variables

```bash
# Core settings
QWORMHOLE_HOST=0.0.0.0
QWORMHOLE_PORT=9000

# Native acceleration
QWORMHOLE_NATIVE=1           # Enable native build
QWORMHOLE_DEBUG_NATIVE=1     # Debug logging for native selection

# TLS
QWORMHOLE_TLS_CERT=/path/to/cert.pem
QWORMHOLE_TLS_KEY=/path/to/key.pem
QWORMHOLE_TLS_CA=/path/to/ca.pem

# Limits
QWORMHOLE_MAX_CLIENTS=1000
QWORMHOLE_RATE_LIMIT=1000000
QWORMHOLE_MAX_BACKPRESSURE=5242880

# Protocol
QWORMHOLE_PROTOCOL_VERSION=1.0.0
```

### Configuration Loader

```typescript
import fs from "node:fs";
import { QWormholeServer, QWormholeServerOptions } from "@gsknnft/qwormhole";

function loadConfig(): QWormholeServerOptions {
  const config: QWormholeServerOptions = {
    host: process.env.QWORMHOLE_HOST ?? "0.0.0.0",
    port: parseInt(process.env.QWORMHOLE_PORT ?? "9000"),
    protocolVersion: process.env.QWORMHOLE_PROTOCOL_VERSION,
    maxClients: process.env.QWORMHOLE_MAX_CLIENTS
      ? parseInt(process.env.QWORMHOLE_MAX_CLIENTS)
      : undefined,
    rateLimitBytesPerSec: process.env.QWORMHOLE_RATE_LIMIT
      ? parseInt(process.env.QWORMHOLE_RATE_LIMIT)
      : undefined,
    maxBackpressureBytes: process.env.QWORMHOLE_MAX_BACKPRESSURE
      ? parseInt(process.env.QWORMHOLE_MAX_BACKPRESSURE)
      : undefined,
  };

  // TLS configuration
  if (process.env.QWORMHOLE_TLS_CERT && process.env.QWORMHOLE_TLS_KEY) {
    config.tls = {
      enabled: true,
      cert: fs.readFileSync(process.env.QWORMHOLE_TLS_CERT),
      key: fs.readFileSync(process.env.QWORMHOLE_TLS_KEY),
      ca: process.env.QWORMHOLE_TLS_CA
        ? fs.readFileSync(process.env.QWORMHOLE_TLS_CA)
        : undefined,
    };
  }

  return config;
}

const server = new QWormholeServer(loadConfig());
```

---

## Health Checks

### Health Check Script

Create `scripts/health-check.js`:

```javascript
const net = require("node:net");

const host = process.env.QWORMHOLE_HOST || "127.0.0.1";
const port = parseInt(process.env.QWORMHOLE_PORT || "9000");

const client = net.createConnection({ host, port }, () => {
  console.log("Health check passed");
  client.end();
  process.exit(0);
});

client.on("error", (err) => {
  console.error("Health check failed:", err.message);
  process.exit(1);
});

client.setTimeout(5000, () => {
  console.error("Health check timeout");
  client.destroy();
  process.exit(1);
});
```

### HTTP Health Endpoint (Optional)

Add an HTTP health endpoint alongside the TCP server:

```typescript
import http from "node:http";
import { QWormholeServer } from "@gsknnft/qwormhole";

const server = new QWormholeServer({ host: "0.0.0.0", port: 9000 });

// Health check HTTP server
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "healthy",
      connections: server.getConnectionCount(),
      uptime: process.uptime(),
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(9001);
await server.listen();
```

---

## Logging and Monitoring

### Structured Logging

```typescript
import { QWormholeServer } from "@gsknnft/qwormhole";

function log(level: string, message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  onTelemetry: (metrics) => {
    log("info", "telemetry", metrics);
  },
});

server.on("connection", (client) => {
  log("info", "client connected", {
    clientId: client.id,
    remoteAddress: client.remoteAddress,
  });
});

server.on("clientClosed", ({ client, hadError }) => {
  log("info", "client disconnected", {
    clientId: client.id,
    hadError,
  });
});

server.on("error", (err) => {
  log("error", "server error", { error: err.message });
});
```

### Prometheus Metrics

```typescript
import { QWormholeServer, QWormholeTelemetry } from "@gsknnft/qwormhole";

// Metrics storage
let latestTelemetry: QWormholeTelemetry = {
  bytesIn: 0,
  bytesOut: 0,
  connections: 0,
  backpressureEvents: 0,
  drainEvents: 0,
};

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  onTelemetry: (metrics) => {
    latestTelemetry = metrics;
  },
});

// Expose metrics in Prometheus format
function getPrometheusMetrics(): string {
  return `
# HELP qwormhole_bytes_in_total Total bytes received
# TYPE qwormhole_bytes_in_total counter
qwormhole_bytes_in_total ${latestTelemetry.bytesIn}

# HELP qwormhole_bytes_out_total Total bytes sent
# TYPE qwormhole_bytes_out_total counter
qwormhole_bytes_out_total ${latestTelemetry.bytesOut}

# HELP qwormhole_connections_current Current number of connections
# TYPE qwormhole_connections_current gauge
qwormhole_connections_current ${latestTelemetry.connections}

# HELP qwormhole_backpressure_events_total Total backpressure events
# TYPE qwormhole_backpressure_events_total counter
qwormhole_backpressure_events_total ${latestTelemetry.backpressureEvents}

# HELP qwormhole_drain_events_total Total drain events
# TYPE qwormhole_drain_events_total counter
qwormhole_drain_events_total ${latestTelemetry.drainEvents}
`.trim();
}
```

---

## See Also

- [TLS Examples](./tls-examples.md) - TLS configuration
- [Mesh Network Tutorial](./mesh-network-tutorial.md) - Multi-node deployments
