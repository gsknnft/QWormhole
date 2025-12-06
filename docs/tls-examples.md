# TLS Examples

This document provides copy-paste configurations for common TLS scenarios with QWormhole.

## Table of Contents

- [Mutual TLS with Let's Encrypt](#mutual-tls-with-lets-encrypt)
- [Client Certificate Authentication](#client-certificate-authentication)
- [Self-Signed Certificates (Development)](#self-signed-certificates-development)
- [TLS with ALPN Protocol Negotiation](#tls-with-alpn-protocol-negotiation)
- [Fingerprint Pinning](#fingerprint-pinning)
- [Exported Keying Material](#exported-keying-material)

---

## Mutual TLS with Let's Encrypt

Server configuration using Let's Encrypt certificates with mutual TLS:

```typescript
import fs from "node:fs";
import { QWormholeServer } from "@gsknnft/qwormhole";

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("/etc/letsencrypt/live/mesh.example/fullchain.pem"),
    key: fs.readFileSync("/etc/letsencrypt/live/mesh.example/privkey.pem"),
    requestCert: true,
    rejectUnauthorized: true,
  },
});

server.on("connection", (client) => {
  console.log(`TLS client connected: ${client.remoteAddress}`);
  if (client.handshake?.tls) {
    console.log(`  ALPN: ${client.handshake.tls.alpnProtocol}`);
    console.log(`  Authorized: ${client.handshake.tls.authorized}`);
    console.log(`  Peer fingerprint: ${client.handshake.tls.peerFingerprint256}`);
  }
});

await server.listen();
console.log("Secure server listening on port 9000");
```

---

## Client Certificate Authentication

Client connecting with certificate authentication:

```typescript
import fs from "node:fs";
import { QWormholeClient } from "@gsknnft/qwormhole";

const client = new QWormholeClient({
  host: "mesh.example.com",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./client-cert.pem"),
    key: fs.readFileSync("./client-key.pem"),
    ca: fs.readFileSync("./ca-cert.pem"),
    alpnProtocols: ["qwormhole/1.0"],
  },
});

client.on("connect", () => {
  console.log("Secure connection established");
});

await client.connect();
client.send({ type: "hello", timestamp: Date.now() });
```

---

## Self-Signed Certificates (Development)

For development and testing, you can generate self-signed certificates:

```bash
# Generate CA key and certificate
openssl genrsa -out ca-key.pem 4096
openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem \
  -subj "/CN=QWormhole Dev CA"

# Generate server key and CSR
openssl genrsa -out server-key.pem 4096
openssl req -new -key server-key.pem -out server.csr \
  -subj "/CN=localhost"

# Sign server certificate with CA
openssl x509 -req -days 365 -in server.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem

# Generate client key and CSR
openssl genrsa -out client-key.pem 4096
openssl req -new -key client-key.pem -out client.csr \
  -subj "/CN=client"

# Sign client certificate with CA
openssl x509 -req -days 365 -in client.csr -CA ca-cert.pem -CAkey ca-key.pem \
  -CAcreateserial -out client-cert.pem
```

Use in development:

```typescript
import fs from "node:fs";
import { QWormholeServer, QWormholeClient } from "@gsknnft/qwormhole";

// Server with self-signed cert
const server = new QWormholeServer({
  host: "127.0.0.1",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./server-cert.pem"),
    key: fs.readFileSync("./server-key.pem"),
    ca: fs.readFileSync("./ca-cert.pem"),
    requestCert: true,
    rejectUnauthorized: true,
  },
});

// Client with client cert
const client = new QWormholeClient({
  host: "127.0.0.1",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./client-cert.pem"),
    key: fs.readFileSync("./client-key.pem"),
    ca: fs.readFileSync("./ca-cert.pem"),
  },
});
```

---

## TLS with ALPN Protocol Negotiation

Use ALPN to negotiate application protocols:

```typescript
import fs from "node:fs";
import { QWormholeServer, QWormholeClient } from "@gsknnft/qwormhole";

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./server-cert.pem"),
    key: fs.readFileSync("./server-key.pem"),
    alpnProtocols: ["qwormhole/1.0", "qwormhole/0.9"],
  },
});

server.on("connection", (client) => {
  const negotiated = client.handshake?.tls?.alpnProtocol;
  console.log(`Negotiated protocol: ${negotiated}`);
});

const client = new QWormholeClient({
  host: "127.0.0.1",
  port: 9000,
  tls: {
    enabled: true,
    ca: fs.readFileSync("./ca-cert.pem"),
    alpnProtocols: ["qwormhole/1.0"],
  },
});
```

---

## Fingerprint Pinning

Pin TLS certificates by fingerprint for defense in depth:

```typescript
import { QWormholeServer, createHandshakeVerifier } from "@gsknnft/qwormhole";

const ALLOWED_FINGERPRINTS = new Set([
  "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90",
  // Add more allowed client fingerprints
]);

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./server-cert.pem"),
    key: fs.readFileSync("./server-key.pem"),
    requestCert: true,
    rejectUnauthorized: true,
  },
  verifyHandshake: (payload) => {
    const tags = payload?.tags as Record<string, string> | undefined;
    const fingerprint = tags?.tlsFingerprint256;
    
    if (!fingerprint) {
      console.warn("Client did not provide TLS fingerprint");
      return false;
    }
    
    if (!ALLOWED_FINGERPRINTS.has(fingerprint)) {
      console.warn(`Unknown fingerprint: ${fingerprint}`);
      return false;
    }
    
    return true;
  },
});
```

Client sends its fingerprint in handshake tags automatically when TLS is enabled.

---

## Exported Keying Material

Derive session keys from TLS for additional binding with negentropic handshakes:

```typescript
import fs from "node:fs";
import { QWormholeServer } from "@gsknnft/qwormhole";

const server = new QWormholeServer({
  host: "0.0.0.0",
  port: 9000,
  protocolVersion: "1.0.0",
  tls: {
    enabled: true,
    cert: fs.readFileSync("./server-cert.pem"),
    key: fs.readFileSync("./server-key.pem"),
    exportKeyingMaterial: {
      label: "qwormhole-session",
      length: 32,
      context: Buffer.from("app-specific-context"),
    },
  },
});

server.on("connection", (client) => {
  if (client.handshake?.tls?.tlsSessionKey) {
    console.log(`Session key derived: ${client.handshake.tls.tlsSessionKey}`);
    // Use for additional authentication or encryption layers
  }
});
```

---

## Native Transport TLS

The libwebsockets native backend supports the same TLS options:

```typescript
import fs from "node:fs";
import { createQWormholeClient } from "@gsknnft/qwormhole";

const { client, mode } = createQWormholeClient({
  host: "secure.example.com",
  port: 9000,
  preferNative: true,
  tls: {
    enabled: true,
    cert: fs.readFileSync("./client-cert.pem"),
    key: fs.readFileSync("./client-key.pem"),
    ca: fs.readFileSync("./ca-cert.pem"),
    alpnProtocols: ["qwormhole/1.0"],
  },
});

console.log(`Transport mode: ${mode}`); // "native-lws" or "ts"
```

> **Note**: The native libwebsockets backend fully supports TLS. The legacy libsocket backend is plaintext-only and will throw if TLS is requested.

---

## Security Checklist

- [ ] Use TLS in production (never plaintext over public networks)
- [ ] Enable mutual TLS (`requestCert: true`) for sensitive services
- [ ] Rotate certificates before expiration
- [ ] Pin known client fingerprints when possible
- [ ] Use ALPN to enforce protocol versions
- [ ] Consider exporting keying material for defense in depth
- [ ] Store private keys securely (avoid committing to source control)
- [ ] Use Let's Encrypt or a trusted CA for production certificates
