[![NPM Version](https://img.shields.io/npm/v/@gsknnft/qwormhole.svg?style=flat-square)](https://www.npmjs.com/package/@gsknnft/qwormhole)
[![Node Version](https://img.shields.io/node/v/@gsknnft/qwormhole.svg?style=flat-square)](https://nodejs.org)

<p align="center">
  <h1 style="font-size:2.5rem; font-family:Segoe UI, Arial, sans-serif; margin-bottom:0.2em;">
    @gsknnft/qwormhole
  </h1>
</p>

<p align="center">
  <img src="/main/assets/qw_logo2.png" alt="QWormhole Logo" width="180" />
</p>


### TypeScript-first TCP transport with native acceleration and framing, reconnect, and codec orchestration.


A TypeScript-first TCP transport kernel with native acceleration, framing, reconnect, and codec orchestration.

QWormhole is a modern transport layer for Node environments.
It wraps raw TCP sockets with:

✔ Length-prefixed framing

✔ Auto-reconnect

✔ Rate limiting

✔ Backpressure safety

✔ Typed events

✔ Optional native acceleration

✔ Interface binding (e.g. wg0)

✔ Pluggable codecs

The goal: no more hand-rolled socket logic.
Just a clean, portable, typed transport.

---

## ✨ Why QWormhole?

QWormhole turns raw sockets into a composable, typed, and orchestrated transport layer — with __zero__ boilerplate.

Node’s built-in net module is intentionally bare.
Real applications need:

Framing (length-prefix, safe messages)

Auto-reconnect

Typed, decoded message events

Rate limiting

Backpressure protection

Versioned handshakes

Interface binding

Optional native performance

QWormhole provides all of these in a small, modern, TS-native API with fallback behavior.

QWormhole isn’t just a socket wrapper — it’s a transport ritual.

---

## Features

- 🚀 **TypeScript-first design** with full type safety
- ⚡ **Optional native acceleration** (libwebsockets or libsocket)
- 📦 Zero runtime dependencies in TS mode
- 🔌 **Length-prefixed framing** (default) or raw stream mode
- 🔄 **Auto-reconnect** with exponential backoff
- 💧 **Backpressure protection** (server-side safety)
- 📉 **Rate limiting** with burst control
- 🌐 **Bind to interfaces** (`wg0`, `eth0`, WireGuard, VLANs, etc.)
- 🧩 **Pluggable codecs** (JSON, text, buffer, CBOR, custom binary)
- 🔐 **Protocol versioning + handshake tags**
- 🎛️ **TS/native factory with intelligent fallback**
- 🧪 **Full test suite** (TS + native smoke tests)
- 🛠 Works on **Windows / macOS / Linux / WSL**
- 🛰 Ideal for **agents, daemons, device networks, mesh networks**
    - Agents: drop telemetry or control frames over framed TCP
    - Daemons: expose typed socket APIs with reconnect and backpressure
    - Device networks: bind to interfaces (wg0, eth0) and tag connections
    - Mesh networks: use handshake tags to route and identify peers


## Minimal Example
```ts
const client = new QWormholeClient({ host: "127.0.0.1", port: 9000 });

await client.connect();
client.send("hello");
client.on("message", console.log);
```


## Table of Contents
- [Quick start](#quick-start)
- [Mode selection](#mode-selection-ts-vs-native-and-backend-selection)
- [Key options](#key-options)
- [Install](#install)
- [Handshake & security](#handshake--security)
- [Error handling & backpressure](#error-handling--backpressure)
- [Integration notes](#integration-notes-sigilnetdevice-registrywireguard)
- [Native backends](#native-backends-libwebsockets--libsocket)
- [Benchmarks](#benchmarks)
- [Troubleshooting](#troubleshooting-native-build)
- [Platform support](#platform-support)
- [Secure Streams (roadmap)](#secure-streams-roadmap)
- [Codec extensibility](#codec-helpers)
- [Tests](#tests)
- [Known issues / roadmap](#known-issues--roadmap)

  
## Installation

This package is part of the workspace; add it to a package with:

```bash
pnpm add @gsknnft/qwormhole
```



## Architecture


QWormhole abstracts the transport layer, selecting native or TS based on availability and preference. The runtime layer handles orchestration, framing, rate limiting, and handshake semantics.

**Architecture Overview**

  Client (TS/native)
    ↕ length-prefixed frames
  Server (TS/native)
    ↕ rate-limit, backpressure, handshake
  Application Layer

>     +----------------------------+
>     |        Your App           |
>     +----------------------------+
>                 |
>                 v
>     +----------------------------+
>     |    QWormhole Runtime      |   ← orchestrates handshake, framing, rate limits
>     +----------------------------+
>           |             |
>           v             v
>     +-----------+   +-----------+
>     |  Native   |   |    TS     |   ← auto-selected transport layer
>     |  (LWS)    |   | Transport |
>     +-----------+   +-----------+
>           |
>           v
>          TCP

---

<p align="center">
  <img src="/main/assets/rt_diag1.gif" alt="QWormhole Architecture" width="320" />
  <br />
  <em>QWormhole Architecture</em>
</p>


## Quick start

Client with automatic reconnect and length-prefixed frames:

```ts
import { QWormholeClient, textDeserializer } from '@gsknnft/qwormhole';

// Client: connects, auto-reconnects, sends framed messages
const client = new QWormholeClient({
  host: '127.0.0.1',
  port: 9000,
  deserializer: textDeserializer, // default is Buffer
});

await client.connect(); // establishes socket and starts framing
client.send("hello");
client.on("message", console.log); // receives framed messages

await client.connect();
client.send('ping');
```

Server that accepts connections and broadcasts messages:

```ts
import { QWormholeServer, textDeserializer } from '@gsknnft/qwormhole';

// Server: accepts connections, receives framed messages, echoes responses
const server = new QWormholeServer<string>({
  host: '0.0.0.0',
  port: 9000,
  deserializer: textDeserializer,
});

server.on('message', ({ client, data }) => {
  console.log(`recv from ${client.id}`, data);
  client.send(`echo:${data}`);
});

await server.listen();
```

Runtime helper (shared defaults, quick bootstrap):

```ts
import { QWormholeRuntime } from '@gsknnft/qwormhole';

// Runtime: orchestrates client/server with shared defaults and native preference
const rt = new QWormholeRuntime({
  protocolVersion: '1.0.0',
  handshakeTags: { service: 'sigilnet', device: 'alpha' },
  preferNative: true,
  interfaceName: 'wg0',
  rateLimitBytesPerSec: 1_000_000,
});

const server = rt.createServer({ host: '0.0.0.0', port: 9000 });
const client = rt.createClient({ host: '127.0.0.1', port: 9000 });
```

Mode selection (TS vs native) and backend selection:

```ts
import { createQWormholeClient } from '@gsknnft/qwormhole';

const { client, mode } = createQWormholeClient({
  host: '127.0.0.1',
  port: 9000,
  preferNative: true,
});

console.log('using mode', mode); // "native-lws" → "native-libsocket" → "ts"
// load order: libwebsockets -> libsocket -> TS
// set QWORMHOLE_DEBUG_NATIVE=1 to log backend selection during runtime.
```

Native modules are emitted to:

dist/native/
  qwormhole_lws.node
  qwormhole.node
  
#### **Platform behavior table**

| Symbol | Meaning |
|--------|---------|
| ✅     | Always available |
| ⚡     | Optional native acceleration |
| ❌     | Not supported |

## Platform behavior

| Platform | TS transport | native-lws | native-libsocket |
|---------|--------------|-------------|-------------------|
| Windows | ✅ | ⚡ optional | ❌ |
| macOS   | ✅ | ⚡ optional | ❌ |
| Linux   | ✅ | ⚡ optional | ⚡ optional |
| WSL2    | ✅ | ⚡ optional | ⚡ optional |

Transport selection order:

1. `qwormhole_lws.node` (libwebsockets)
2. `qwormhole.node` (libsocket)
3. TypeScript fallback

- __Native acceleration when you want it. TypeScript clarity when you need it.__

---

## Why QWormhole? - Every connection is framed, typed, and tagged — no more raw streams.


- Stop hand-rolling socket framing and reconnect logic
- Use typed events and pluggable codecs out of the box
- Drop native acceleration in when needed — no lock-in
- Bind to interfaces, enforce protocol versions, and tag connections
- Works everywhere: TS fallback is always available

---

Node's built-in `net` module is low-level and bare metal. Most real-world
applications need:
- message events are pre-deserialized — no need to parse manually.
- message framing (length-prefixed)
- reconnect logic
- backpressure protection
- rate limiting
- interface binding (wg0/tun0/etc)
- typed events
- versioned handshakes
- multiple codec formats (JSON, CBOR, binary)
- optional native performance

QWormhole provides all of this in a small, modern, TypeScript-native API.

---

## ⚙ Key Options

✔ framing
- `framing`: `"length-prefixed"` (default) or `"none"`.

✔ serializer/deserializer
- `serializer` / `deserializer`: JSON/text/buffer built-in; CBOR helpers; plug your own (FlatBuffers, etc.).

✔ reconnect
- `reconnect`: `{ enabled, initialDelayMs, maxDelayMs, multiplier, maxAttempts }` for clients.

✔ keepAlive
- `keepAlive`, `keepAliveDelayMs`, `idleTimeoutMs`: TCP tuning.

✔ backpressure guard
- `maxBackpressureBytes`: server-side guard (default 5 MiB) before writes will destroy a socket; emits `backpressure`/`drain` events.

✔ factory mode switches
- `preferNative`/`forceTs`: factory switches between native binding and TS transport.

✔ interface binding
- `interfaceName`/`localAddress`/`localPort`: bind client sockets to a specific interface/IP (e.g., `wg0` for WireGuard) and set a connect timeout.

✔ rate limiting
- `rateLimitBytesPerSec`/`rateLimitBurstBytes`: optional outbound rate limiting with priority queues on client and server.

✔ handshake
- `protocolVersion`/`handshakeTags`: optional handshake exchange to enforce versioning and pass tags (e.g., device/service/interface).

✔ typed server connections
- `getConnection(id)`/`getConnectionCount()` helpers for server-side orchestration.


#### **Codec helpers**
- Built-in: buffer/text/json
- Optional: CBOR via `createCborSerializer`/`createCborDeserializer`
- FlatBuffers/Protobuf: use the serializer/deserializer hooks with your generated encode/decode, e.g.:
  ```ts
  const client = new QWormholeClient({
    host: '127.0.0.1',
    port: 9000,
    serializer: buf => Buffer.from(MyProto.encode(buf).finish()),
    deserializer: data => MyProto.decode(data),
  });
  ```

| Codec       | Type     | Usage                     |
|-------------|----------|---------------------------|
| Buffer      | Built-in | Default                    |
| Text        | Built-in | `textDeserializer`         |
| JSON        | Built-in | `jsonDeserializer`         |
| CBOR        | Optional | `createCborDeserializer()` |
| FlatBuffers | Custom   | Use serializer hooks       |
| Protobuf    | Custom   | Use serializer hooks       |


Benchmarks:
- `pnpm --filter @gsknnft/qwormhole bench` runs a simple localhost throughput test comparing TS vs native (if available).
  - Or run `node scripts/bench.ts` to benchmark TS, native-lws, and native-libsocket (when present).
Tests:
- `pnpm --filter @gsknnft/qwormhole test` (TS), `pnpm --filter @gsknnft/qwormhole test:native` (gated by native availability).

---

## 🧪 Tests

```bash
pnpm test
pnpm test:native (only runs if native present)
```
---

## Install

Install attempts a native build automatically; if native fails, TS remains available.

- `pnpm install` (or workspace install) triggers the native build attempt via `scripts/install-native.js`.
- macOS runners automatically skip the libsocket backend (it relies on Linux-only APIs). Set `QWORMHOLE_NATIVE=1` if you really want to force a build attempt.
- If native build fails (missing toolchain/SSL), it logs a warning and falls back to TS without failing install.
- You can rebuild explicitly anytime: `pnpm --filter @gsknnft/qwormhole run build:native`.
- Set `QWORMHOLE_NATIVE=0` to skip native manually (e.g., CI); set `QWORMHOLE_BUILD_LIBSOCKET=0` on POSIX to skip libsocket when you only want LWS.

## Handshake & security
- Default handshake: `{ type: "handshake", version, tags? }` sent when `protocolVersion` is set.
- Custom signer: provide `handshakeSigner` to send signed/negantropic handshakes (see `createNegantropicHandshake`).
- Server verification: use `verifyHandshake` to accept/reject (version/tags/signatures/negHash). On reject the server closes the socket and emits `clientClosed` with `hadError: true`.

## Error handling & backpressure
- Backpressure protection: server drops connections when `maxBackpressureBytes` is exceeded; emits `backpressure` and `clientClosed`.
- Rate limiting: per-connection token bucket (bytes/sec + burst) and optional client-side rate limits.
- Errors bubble via the `error` event; telemetry snapshots are delivered via `onTelemetry` (bytesIn/out, connections, backpressure and drain counts).

## ML adapters (optional)
- Default: lightweight `qworm_torch` adapter computes coherence/entropy/anomaly scores from numeric metrics (no external services).
- RPC: `QWORMHOLE_ML_ADAPTER=rpc` with `QWORMHOLE_ML_RPC_URL=https://...` posts metrics to your endpoint.
- Spawn: `QWORMHOLE_ML_ADAPTER=spawn` with `QWORMHOLE_ML_SPAWN_CMD="python -m your_module"` streams metrics to any CLI.
- Programmatic: `setMLAdapter(createQwormTorchAdapter())` or swap in your own `MLAdapter`.

## Native backends (libwebsockets + libsocket)

Native is optional; the TS transport works everywhere. Two native addons are available:

- `qwormhole_lws.node` (libwebsockets raw socket backend, preferred, cross-platform: Windows/macOS/Linux)
- `qwormhole.node` (libsocket backend, Linux/WSL only)

Build on Windows (libwebsockets):
```bash
pnpm --filter @gsknnft/qwormhole run build:native
# outputs dist/native/qwormhole_lws.node
```

Build on Linux/WSL (libwebsockets + libsocket):
```bash
pnpm --filter @gsknnft/qwormhole run build:native
# outputs dist/native/qwormhole_lws.node and/or qwormhole.node
```

This runs `node-gyp` to build native addons, then drops any produced `.node` binaries under `dist/native/`. The loader prefers libwebsockets (`qwormhole_lws`), falls back to libsocket, otherwise uses the TS transport automatically.

Notes:
- Node >= 24.9 recommended (matches workspace engines).
- Windows build expects OpenSSL in the default OpenSSL-Win64 location; set `OPENSSL_LIB_DIR` if yours differs.
- The package builds to CJS + ESM with bundled `.d.ts` via `tsup`; native is always optional.



<p align="center">
  <img src="/main/assets/lilq_canon.jpg" alt="QWormhole Logo" width="180" />
</p>

## Troubleshooting (native build)
- **OpenSSL missing on Windows**: install OpenSSL-Win64 and/or set `OPENSSL_LIB_DIR` to its `lib` folder.
- **node-gyp/toolchain**: ensure VS Build Tools (win) or build-essential (linux) are present.
- **Platform mismatch (esbuild/rollup)**: reinstall `node_modules` on the target platform instead of reusing from another OS/WSL.
- **Skip native in CI**: set `QWORMHOLE_NATIVE=0` to avoid native build attempts.

## Platform support
- Windows: TS + native-lws
- Linux/WSL: TS + native-lws + native-libsocket (legacy)
- macOS: TS + native-lws
- Embedded/transports: TS today; Secure Streams/UART planned (see roadmap)

## Secure Streams (roadmap)
- Libwebsockets Secure Streams will be exposed via a TypeScript-friendly wrapper with JSON policy loading and minimal callbacks. See `ROADMAP.md` for status.

## 🔐 Security Notes

QWormhole is transport-only by design.  
It does **not** encrypt traffic (yet).  

Use WireGuard, SSH tunnels, or TLS termination if required.

Secure Streams will provide encrypted, multiplexed channels.

## Known issues / roadmap
- Server transport is TS-only; native server bindings (libwebsockets/libsocket) are planned.
- More telemetry/export hooks and Secure Streams are planned for a later release.

## 🗺 Roadmap

Secure Streams
TLS/TCP wrappers
Multiplexing
WebSocket transport
UDP transport
Browser transport (WebRTC)

