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
- 📈 **Adaptive slicing** (auto tunes TS/native batch sizes via ELU/GC telemetry; override with `QWORMHOLE_ADAPTIVE_SLICES`)
- 🧩 **Pluggable codecs** (JSON, text, buffer, CBOR, custom binary)
- 🔐 **Protocol versioning + handshake tags**
- 🛡️ **TLS wrapping + fingerprint pinning (TS + native-lws)**
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
- [ML adapters](#ml-adapters)
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

> **SCP vs QWormhole**
>
> The Sovereign Compute Protocol (SCP) spec in `spec/` defines the semantic layer: negentropic identity, intent graphs, shard topology, and sovereign registries. QWormhole is the transport ritual that carries those semantics safely across TCP/TLS. Today we ship the transport (handshake tags, negentropy vectors, TLS binding) and expose hooks so the SCP layer can evolve independently. Think of QWormhole as the substrate; SCP rides on top.

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
  handshakeTags: { service: 'telemetry-core', node: 'alpha' },
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

- _macOS automatically skips the libsocket build because Darwin lacks the Linux-only APIs libsocket depends on. Use `QWORMHOLE_NATIVE=1` only if you intentionally want to attempt the unsupported build._

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
- **Latest snapshot (2025-12-03, Windows 11, Node 24.10.0):**

  | Scenario | Old throughput (msg/s) <br />*(pre-native-fix: 276–8.8k msgs landed)* | New duration (ms) | New throughput (msg/s) | Approx Δ |
  | --- | --- | --- | --- | --- |
  | `ts-server + ts` | 46 msg/s | 815 | 12,300 msg/s | **+265×** |
  | `ts-server + native-lws` | 1,580 msg/s | 291 | 34,000 msg/s | **+21×** |
  | `native-server + ts` | 1,690 msg/s | 219 | 45,700 msg/s | **+27×** |
  | `native-server + native-lws` | 940 msg/s | 209 | 47,900 msg/s | **+51×** |

  The earlier runs never reached the configured 10,000 messages because handshake stalls dropped the socket; the native routing fix now delivers the full payload before the 1-second mark, so per-socket throughput jumped by one to two orders of magnitude. `native-libsocket` rows remain skipped on Windows until that backend is built.
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
- **Default handshake** – `{ type: "handshake", version, tags? }` automatically queues when `protocolVersion` is set.
- **Native parity** – the libwebsockets server binding now enforces the same handshake pipeline as the TS server, surfaces TLS fingerprints/negentropic metadata on `connection.handshake`, and only emits `connection` after your optional `verifyHandshake` hook approves the snapshot.
- **Negentropic signer** – pass `handshakeSigner` or use `createNegentropicHandshake` to emit signed payloads with `negHash` + coherence metadata for downstream policy engines.
- **TLS-aware metadata** – when `tls` options are provided, the client captures peer fingerprints, ALPN, and exported keying material, then merges them into `handshake.tags`. The server pins those fingerprints via `verifyTlsFingerprint`, derives a session-bound key, and attaches the TLS snapshot to `connection.handshake.tls` for your app.
- **Policy hooks** – `verifyHandshake` and `createHandshakeVerifier` make it easy to reject unwanted versions, tags, or signatures; failures immediately drop the socket and emit `clientClosed(hadError: true)`.

### Negentropic handshake tests
- Property-based fuzzing (fast-check) now hammers `computeNIndex` with balanced entropy, repeated bytes, malformed Base64, and multi-kilobyte payloads. Every run asserts the metric is finite, non-NaN, and clamped to `[0,1]`.
- Regression tests cover empties (`""`, `"===="`) plus pathological long strings (`"A".repeat(10_000)`) to guarantee graceful fallbacks instead of entropy collapse.
- These invariants backstop roadmap targets: native server parity/reconnect logic keep using the same bounded negentropy values, TLS playbooks can bind fingerprints without skew, session-key rotation/replay guards inherit deterministic coherence math, SCP semantics get stable identity vectors, and QUIC/WebTransport research can rely on identical entropy contracts.

## TLS (optional)
- **TS transport** – enabling `tls.enabled=true` on the client/server wraps the socket in Node's `tls` module with cert/key/CA, ALPN, passphrase, and mutual-auth toggles. `exportKeyingMaterial` lets you mix TLS secrets into negentropic hashes for additional binding.
- **Native transport** – the libwebsockets backend now accepts the same `tls` object (PEM strings or buffers) and configures client certs, private keys, CA bundles, passphrases, and ALPN directly inside the native context. The legacy `libsocket` backend remains plaintext-only and will throw if TLS is requested.
- **Tight binding** – TLS fingerprints automatically land in handshake tags (`tlsFingerprint256`, `tlsFingerprint`, `tlsAlpn`). Servers can require them, enforce SNI expectations, or correlate TLS session keys with negentropic fingerprints for defense in depth.

### Security story at a glance
- **Transport confidentiality** – enable `tls` (TS or native-lws) for on-the-wire encryption, mutual auth, ALPN pinning, and exportable keying material.
- **Identity & attestation** – use negentropic handshakes or custom `handshakeSigner` payloads so every socket announces a signed identity with coherence metadata.
- **Policy enforcement** – `verifyHandshake`, TLS fingerprint pinning, rate limits, and backpressure guards let the server enforce both crypto posture and resource usage before promoting a socket to application traffic.
- **Layered defense** – TLS metadata is merged into handshake tags, so downstream routers or registries can insist on matching TLS fingerprints *and* negentropic hashes; external tunnels (WireGuard, SSH) remain optional but compose cleanly via `localAddress` / `interfaceName`.
- **Forward-secrecy roadmap** – sovereign tunnel sessions use long-lived X25519-derived keys today; rotation + replay protection are on the shortlist so meshes that need FS guarantees can opt in without bolting on a second transport.

## Error handling & backpressure
- Backpressure protection: server drops connections when `maxBackpressureBytes` is exceeded; emits `backpressure` and `clientClosed`.
- Rate limiting: per-connection token bucket (bytes/sec + burst) and optional client-side rate limits.
- Errors bubble via the `error` event; telemetry snapshots are delivered via `onTelemetry` (bytesIn/out, connections, backpressure and drain counts).

## Adaptive flow control
- The flow controller now defaults to an adaptive mode (`guarded` for TS, `aggressive` for native) that automatically expands/contract slice sizes based on event-loop idle time, GC pauses, and backpressure.
- Override with `QWORMHOLE_ADAPTIVE_SLICES=off|guarded|aggressive|auto` if you need deterministic behavior (e.g., for perf triage).
- Forced knobs (`QWORMHOLE_FORCE_SLICE`, `QWORMHOLE_FORCE_RATE_BYTES`) still take precedence for reproducing historical regressions.

## ML adapters

QWormhole now ships with a real ML hook so telemetry can be scored without pulling in an external stack.

> Sovereign/mesh deployments often need to close the loop between transport telemetry (drops, latency skew, entropy collapse) and routing or throttling decisions. The ML adapter API is a portable way to derive those signals (in-process, RPC, or spawned CLI) without forcing any specific analytics stack. If you prefer raw metrics, leave the default adapter alone or swap in `createNoopAdapter`.

- **Default (`qworm_torch`)** – derives entropy/coherence/anomaly scores from any numeric metrics using the same negentropic math the transport uses elsewhere. Installs get useful signals immediately, no RPC required.
- **RPC adapter** – forward metrics to an HTTP endpoint. Configure with `QWORMHOLE_ML_ADAPTER=rpc` and `QWORMHOLE_ML_RPC_URL=https://...`. Optional `QWORMHOLE_ML_RPC_HEADERS` (JSON or `key:value,key:value`) and `QWORMHOLE_ML_RPC_TIMEOUT`.
- **Spawn adapter** – shell out to any CLI (legacy Python, Rust CLI, etc.). Set `QWORMHOLE_ML_ADAPTER=spawn`, `QWORMHOLE_ML_SPAWN_CMD="python"`, and `QWORMHOLE_ML_SPAWN_ARGS="-m my.module"`.
- **Composite adapter** – set `{ name: "composite", options: { adapters: [...] } }` to fan metrics into multiple adapters (e.g., run `qworm_torch` locally *and* RPC to a remote scorer) and aggregate their outputs.
- **Custom adapters** – call `setMLAdapter(createNoopAdapter())` or pass any object matching `{ name, run() }`.

Programmatic usage:

```ts
import {
  queryMLLayer,
  setMLAdapter,
  createRpcAdapter,
  createQwormTorchAdapter,
} from "@gsknnft/qwormhole";

// Keep qworm_torch but tweak thresholds
setMLAdapter(createQwormTorchAdapter({ sampleLimit: 2048 }));

// Or switch to RPC dynamically
setMLAdapter(createRpcAdapter({ url: "https://torch.example/ml" }));

// Or run multiple adapters at once
setMLAdapter({
  name: "composite",
  options: {
    adapters: [{ name: "qworm_torch" }, { name: "rpc", options: { url: "https://torch.example/ml" } }],
  },
});

const insight = await queryMLLayer({
  latencyMs: [12, 11, 40, 200, 9],
  drops: 2,
});
console.log(insight);
```

Adapters can also be selected at runtime via `QWORMHOLE_ML_ADAPTER` (`noop`, `qworm_torch`, `rpc`, `spawn`). When no adapter is configured explicitly, QWormhole defaults to `qworm_torch`.

## Native backends (libwebsockets + libsocket)

Native is optional; the TS transport works everywhere. Two native addons are available:

- `qwormhole_lws.node` (libwebsockets raw socket backend, preferred, cross-platform: Windows/macOS/Linux)
- `qwormhole.node` (libsocket backend, Linux/WSL only)

TLS support for native mode mirrors the TypeScript transport when the libwebsockets backend is loaded. Provide the same `tls` object and the native client will load your PEM/DER blobs, enforce ALPN, and surface the TLS metadata in handshake tags. The legacy libsocket backend is plaintext-only; requesting TLS while it is active throws so you never unknowingly downgrade security.

> **Server bindings:** the libwebsockets native server wrapper is now implemented and available for testing (`QWormholeServerWrapper` in `qwormhole_lws.node`). It supports the core server lifecycle (`listen`, `close`, `broadcast`, `shutdown`), connection tracking, TLS options, and event emission. Coverage is improving but the TypeScript server remains the recommended default for production until the native server reaches full parity. Set `preferNative: true` on `createQWormholeServer()` to opt in to the experimental native server.

macOS runners always bypass the libsocket target; they will build the libwebsockets backend when toolchains are present and fall back to TS otherwise. On Linux/WSL you can still disable libsocket explicitly via `QWORMHOLE_BUILD_LIBSOCKET=0` if you only need libwebsockets.

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

To build the libwebsockets static archive inside WSL (required because `qwormhole_lws` links it as a shared object), run:

```bash
wsl -e bash -lc '
set -e
cd /mnt/c/Users/G/Desktop/Builds/sigilnet/packages/QWormhole/libwebsockets
rm -rf build-linux
mkdir build-linux && cd build-linux
cmake .. -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
         -DLWS_WITH_STATIC=ON \
         -DLWS_WITH_SHARED=OFF \
         -DLWS_WITH_SSL=ON \
         -DLWS_WITH_ZLIB=ON
cmake --build . --config Release --parallel
mkdir -p ../build/lib
cp ./lib/libwebsockets.a ../build/lib/libwebsockets.a
'
```

This keeps the Windows `libwebsockets/build` directory intact while producing a PIC-enabled archive for WSL/Linux builds.

**Backend selection**

- `QWORMHOLE_NATIVE_PREFERRED` &mdash; default backend for both client and server loaders (`lws` or `libsocket`).
- `QWORMHOLE_NATIVE_SERVER_PREFERRED` / `QWORMHOLE_NATIVE_CLIENT_PREFERRED` &mdash; override detection per side without touching the other.
- `preferNative: true` on `createQWormholeServer()` now accepts `preferredNativeBackend` to force a backend per instance (used by the bench harness to run both `native-lws` and `native-libsocket`).
- `QWORMHOLE_BUILD_LIBSOCKET=0` still skips libsocket entirely when you only need libwebsockets.

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
- **macOS libsocket errors**: Darwin lacks `accept4`, `SIOCGIFINDEX`, and related flags required by libsocket. The installer now skips that backend automatically; force a build only if you are experimenting with a custom libsocket patchset.

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
- Native server wrapper is now implemented but still experimental; the TypeScript server is recommended for production.
- More telemetry/export hooks and Secure Streams are planned for a later release.

### Focus items (v1.x)
1. Native server parity + automated coverage (wrapper implemented, testing in progress)
2. TLS playbooks (mTLS, Let's Encrypt, WireGuard interop) — see [docs/tls-examples.md](docs/tls-examples.md)
3. Sovereign tunnel upgrades: session key rotation, replay guards, forward secrecy toggle
4. SCP semantic layer reference implementation + clearer boundary docs
5. QUIC/WebTransport exploration for high-latency meshes

## 📚 Documentation

- [TLS Examples](docs/tls-examples.md) — Mutual TLS, Let's Encrypt, client certs, fingerprint pinning
- [Mesh Network Tutorial](docs/mesh-network-tutorial.md) — Building mesh networks with WireGuard
- [Deployment Patterns](docs/deployment-patterns.md) — Docker, Kubernetes, Systemd, PM2
- [Security Policy](SECURITY.md) — Vulnerability reporting and security considerations

## 🗺 Roadmap

- Secure Streams
- TLS/TCP wrappers
- Multiplexing
- WebSocket transport
- UDP transport
- Browser transport (WebRTC)

