# QWormhole Roadmap

This document outlines near-term enhancements for @gsknnft/qwormhole. Items are ordered by expected impact and feasibility.

## Recently Completed ✅

- **Native server wrapper (LwsServerWrapper)**: The libwebsockets native server is now implemented in `c/qwormhole_lws.cpp`, supporting:
  - Server lifecycle: `listen()`, `close()`, `broadcast()`, `shutdown()`
  - Connection tracking: `getConnection()`, `getConnectionCount()`
  - Event emission via ThreadSafeFunction: `listening`, `connection`, `message`, `backpressure`, `drain`, `close`, `clientClosed`, `error`
  - TLS options (cert/key/CA, ALPN, mutual auth)
- **TLS documentation**: Added `docs/tls-examples.md` with copy-paste configs for mutual TLS, Let's Encrypt, client certs, fingerprint pinning
- **Mesh network tutorial**: Added `docs/mesh-network-tutorial.md` with WireGuard integration examples
- **Deployment patterns**: Added `docs/deployment-patterns.md` covering Docker, Kubernetes, Systemd, PM2
- **Security policy**: Added `SECURITY.md` for vulnerability reporting
- **Entropy-adaptive handshake (0.3.2 preview)**: Implemented entropy policy system with:
  - `EntropyPolicy` types for trust-zero, trust-light, immune, paranoia modes
  - `deriveEntropyPolicy()` function that maps N-index to transport policy
  - New handshake fields: `entropy`, `entropyVelocity`, `coherence`, `negIndex`
  - Policy-aware handshake attachment in server
  - `entropyMetrics` and `policy` fields in connection handshake result
- **BatchFramer for zero-copy framing (0.3.0 preview)**: Added high-performance batching:
  - Preallocated buffer ring for zero-copy framing
  - writev() batching support via cork/uncork
  - Configurable batch sizes per entropy policy
  - Automatic flush timers for partial batches

## Native & Transport

- **Converge on libwebsockets as the primary native backend**: keep libsocket as Linux/WSL fallback for one more cycle, then remove if parity is confirmed.
- ✅ ~~Native server wrapper~~ (implemented, now testing)
- **Native server parity**: extend test coverage to 80%+, ensure event semantics match TS server
- **Secure Streams exposure**: add a higher-level API that maps LWS Secure Streams (JSON policy + callbacks) to a simplified TS surface; ship a minimal example.
- **UART / custom transports**: document and optionally expose a UART transport path via LWS for embedded use cases.
- **Batching / backpressure**: optional batching/coalescing mode; backpressure counters surfaced via telemetry.

## Install & Tooling

- **Native build switches**: `QWORMHOLE_NATIVE=0` to skip native, `QWORMHOLE_NATIVE=1` to force it, and `QWORMHOLE_BUILD_LIBSOCKET=0` to skip libsocket on Linux/WSL when leaning into LWS-only (macOS now auto-skips libsocket entirely).
- **Better logging**: add `QWORMHOLE_DEBUG_NATIVE=1` to emit which backend loaded and why fallback happened.
- **Prebuilt binaries**: evaluate CI-built precompiled addons for common platforms (Linux x64, macOS arm64, Windows x64) to reduce local toolchain friction.

## Documentation

- ✅ ~~TLS examples~~ (`docs/tls-examples.md`)
- ✅ ~~Mesh network tutorial~~ (`docs/mesh-network-tutorial.md`)
- ✅ ~~Deployment patterns~~ (`docs/deployment-patterns.md`)
- **Troubleshooting guide**: common native build errors (OpenSSL on Windows, node-gyp toolchain, esbuild/rollup platform mismatches) with quick fixes.
- **Table of Contents**: improve README navigation as content grows.

## Testing & Coverage

- **Native server smoke tests**: TS client ↔ native server handshake loop under CI
- **Native LWS edge cases**: stress send/recv buffering, writable callbacks, and error handling in the addon.
- **TS client/server edge cases**: reconnect/backpressure/rate-limit paths; handshake failures.
- **Matrix CI**: run TS + native (LWS) on Windows and Linux; optional libsocket on Linux/WSL.
- **Bench coverage**: include TS vs native-lws vs native-libsocket runs in CI (where supported) to catch performance regressions.

## Performance

- **Benchmarks**: include native LWS vs TS comparisons across Windows and Linux; measure latency/throughput under backpressure and rate limiting.
- **Profiling hooks**: lightweight telemetry option for bytes/latency in native and TS modes.

## Security

- **Session key rotation**: implement session-bound key rotation for long-lived connections
- **Replay protection**: add sequence numbers and replay guards
- **Forward secrecy toggle**: optional FS guarantees for meshes that need them

## Timeline (tentative)

- **v0.1.x (current)**: Native server wrapper implemented, TLS/mesh/deployment docs added
- **v0.2.0**: Native server to 80%+ coverage, publish prebuilt `.node` binaries
- **v0.2.1**: Native server parity (production-ready), session key rotation, replay protection

---


### QWormhole 0.3.x → 0.4.x Roadmap  
Goal: **< 100 ms for 10 000-message bursts across any mixed native/TS topology**  
Bonus: **entropy-aware handshake & framing** so SigilNet can literally throttle the transport based on its own negentropic index in real time.

**Latest baseline (2025-12-04, Windows 11, Node 24.10.0, 10k × 1 KiB, length-prefixed framing):**

| Scenario | Duration (ms) | Throughput (msg/s) | Notes |
| --- | ---:| ---:| --- |
| ts-server + ts-client | 696.96 | 14,348 | Pure TypeScript transport |
| ts-server + native-lws client | 235.64 | 42,438 | Native client, TS server |
| native-server(lws) + ts-client | 168.16 | 59,469 | Native server, TS client |
| native-server(lws) + native-lws client | 151.64 | 65,945 | Full native-lws path |
| native-libsocket permutations | — | — | Skipped on this host; backend unavailable on Windows |

These measurements replace the earlier pre-native figures and set the new "current" column in the projections below. Linux/WSL runs with libsocket/io_uring backends will be added once those builds are green to keep parity across platforms.

| Version | Target Latency (10k msgs) | Core Feature | Why it matters for the mesh | Implementation notes |
|---------|---------------------------|--------------|-------------------------------------|----------------------|
| **0.3.0** | ≤ 150 ms (mixed)          | **Zero-copy framing + writev() batching** | Eliminates per-message syscalls. Native-LWS already does this; bring TS path to parity. | • `socket.writev()` polyfill in TS mode (Node 20+ has it native) <br>• Pre-allocate ring of length-prefixed buffers <br>• Batch up to 64 frames per syscall |
| **0.3.1** | ≤ 130 ms                  | **Backpressure-aware batch flush** | Prevents head-of-line blocking when one slow peer drags the whole mesh. | • Token-bucket + drain events <br>• Adaptive batch size: high N → larger batches, low N → flush immediately |
| **0.3.2** | ≤ 115 ms                  | **Entropy-adaptive handshake** | SigilNet’s negentropic index becomes the transport’s policy engine. | • Handshake payload now carries `entropyVelocity`, `coherence`, `N` <br>• Server decides framing mode per session: <br> – N ≥ 0.8 → zero-copy + writev (trusted, coherent peer) <br> – N < 0.5 → strict length-prefix + ACKs (immune-mode paranoia) |
| **0.3.3** | ≤ 105 ms                  | **liburing / io_uring backend (Linux)** | True async zero-copy at the kernel level. Beats libsocket by another 2–3×. | • Optional `qwormhole-uring.node` compiled only on Linux <br>• Falls back to libsocket → LWS → TS automatically |
| **0.4.0** | **≤ 95 ms** (goal)        | **Adaptive codec selection from entropy** | High coherence → CBOR/FlatBuffers, low coherence → compressed JSON or even raw binary with checksums. | • Runtime swaps serializer/deserializer per session based on N velocity <br>• Built-in codecs: JSON, CBOR, MessagePack, FlatBuffers (pre-registered) |
| **0.4.1** | ≤ 90 ms                   | **Session multiplexing (SNTL preview)** | One TCP connection carries multiple logical channels (control, telemetry, gradient shards). | • Channel ID in first byte after length prefix <br>• Zero extra latency, just reuses the same writev pipeline |
| **0.4.2** | ≤ 85 ms                   | **UDP fallback for high-velocity bursts** | When N is spiking and latency matters more than reliability → fire-and-forget entropy packets over UDP, fall back to TCP for consensus. | • `QWormholeRuntime.udpBroadcast()` helper <br>• Same framing, same codecs |

### Projected numbers after full 0.4.x (conservative)

| Topology                         | Current (2025-12-04) | Target 0.4.x | Gain |
|----------------------------------|----------------------|--------------|------|
| native-server + native-lws       | 152 ms               | ≤ 60 ms      | ~2.5× |
| native-server + ts-client        | 168 ms               | ≤ 70 ms      | ~2.4× |
| ts-server + ts-client            | 697 ms               | ≤ 95 ms      | ~7.3× |
| mixed 50-node mesh (real SigilNet load) | ~4–8 s       | **< 100 ms** | planetary-scale real-time |

### Entropy → Transport Policy Table (this is the killer feature)

| Negentropic Index (N) | Coherence | Velocity | Handshake Mode | Framing | Batch Size | Codec |
|-----------------------|-----------|----------|----------------|---------|------------|-------|
| ≥ 0.85                | High      | Low      | Trust-zero     | zero-copy writev | 64 | FlatBuffers |
| 0.65 – 0.84           | Medium    | Stable   | Trust-light    | length-prefix   | 32 | CBOR |
| 0.40 – 0.64           | Low       | Rising   | Immune         | length+ACK      | 8  | MessagePack |
| < 0.40                | Chaos     | Spiking  | Paranoia       | length+ACK+checksum | 1 | compressed JSON |

This turns QWormhole from “fast pipe” into **the first transport that literally listens to SigilNet’s own physics engine** and rewires itself in real time.

### Implementation Status (as of 2025-12-04)

✅ **Completed:**
1. Entropy-adaptive handshake payload with `entropy`, `entropyVelocity`, `coherence`, `negIndex` fields
2. Policy table implementation in `deriveEntropyPolicy()` - maps N-index to transport configuration
3. Server-side policy derivation - connections now have `handshake.policy` and `handshake.entropyMetrics`
4. BatchFramer class with writev() batching and preallocated buffer rings

🔄 **In Progress:**
1. Integration of BatchFramer into client/server write paths
2. Benchmark suite updates for entropy-aware scenarios

📋 **Next:**
1. Backpressure-aware batch flush (0.3.1)
2. io_uring backend (0.3.3)

### Immediate next actions (next 2–3 weeks)

1. ~~Merge zero-copy + writev batching → 0.3.0~~ ✅ BatchFramer implemented
2. ~~Add entropy fields to handshake payload~~ ✅ Implemented in schema and server
3. ~~Implement the policy table above in `Runtime.handshakeHandler`~~ ✅ deriveEntropyPolicy() implemented
4. Ship 0.3.0 with a new benchmark suite that includes mixed topologies + entropy injection

Do that and 0.3.0 alone will be the biggest single leap in Node-to-node performance anyone has published in years.

Then 0.4.x becomes the “SigilNet-native” transport without ever coupling the packages.

I am not building a library anymore.  
I am building the substrate the next era of decentralized systems will run on.

Let’s ship 0.3.0 and watch the numbers break the internet.  
The field is ready.

---

# 🚀 **QWormhole 0.3.x → 0.4.x Roadmap (Founder Edition)**

### *"From optimized transport… to adaptive substrate for distributed intelligence."*

---

# ⭐ **Mission Statement**

QWormhole is evolving from a fast TCP framing library into a **self-optimizing transport layer** designed for:

* distributed AI agents
* real-time mesh networks
* coherence-sensitive systems (SigilNet, QVera, agent swarms)
* multi-channel gradient, telemetry, and control streams

0.3.x and 0.4.x represent the transition from *protocol* to *substrate.*

Latency target:
⚡ **< 100 ms for 10,000 messages across any topology**
(Plain TS, native, mixed, 50-node mesh — doesn’t matter.)

---

# 🟣 **QWormhole 0.3.x — The Throughput Epoch**

*"Make it fast enough to disappear."*

## **0.3.0 — Zero-Copy Framing + writev() Pipeline**

**Target:** ≤ 150 ms (TS ↔ TS)
**Goal:** Remove per-message syscall cost and memory churn.

### What ships:

* Zero-copy outbound frame buffers
* **writev() batching** (Node 20+ native)
* Preallocated buffer rings
* Configurable batch size (adaptive in 0.3.1)

### Why it matters:

This is the jump that makes TS mode competitive with native, and gives you deterministic frame time regardless of payload velocity.

---

## **0.3.1 — Adaptive Backpressure Engine**

**Target:** ≤ 130 ms
**Goal:** Prevent slow peers from collapsing fast peers.

### What ships:

* Token bucket per-connection
* Dynamic batch scaling
* Intelligent flush thresholds
* Soft pressure signals forwarded up to the runtime

### Why it matters:

This is what makes QWormhole viable for **multi-node meshes**, not just single pipes.

---

## **0.3.2 — Entropy-Adaptive Handshake**

**Target:** ≤ 115 ms
**Goal:** Make transport sensitive to the information-theoretic state of the mesh.

### New handshake fields:

* `entropy`
* `entropyVelocity`
* `coherence`
* `negIndex`

### Policy modes:

| N (NegIndex) | Mode            | Behavior                              |
| ------------ | --------------- | ------------------------------------- |
| ≥ 0.85       | **Trust-zero**  | Zero-copy + big batches + FlatBuffers |
| 0.65–0.84    | **Trust-light** | Zero-copy + mid batches + CBOR        |
| 0.40–0.64    | **Immune**      | Length-prefix + ACK                   |
| < 0.40       | **Paranoia**    | Checksum + ACK + tiny batches         |

### Why it matters:

You now have the first transport layer that **changes behavior based on coherence** of the system riding on top of it.

SigilNet doesn't just *use* QWormhole — it **drives** it.

---

## **0.3.3 — Native io_uring Backend (Linux)**

**Target:** ≤ 105 ms
**Goal:** Introduce kernel-level async zero-copy.

### What ships:

* Optional `qwormhole-uring.node`
* Transparent fallback hierarchy:

  1. io_uring
  2. libsocket
  3. LWS
  4. pure TS

### Why it matters:

This is where you pass 50k msg/s → 80–120k msg/s territory on commodity hardware.

---

# 🔥 **0.4.x — The SigilNet Era**

*"Transport becomes adaptive intelligence."*

## **0.4.0 — Runtime Codec Negotiation**

**Target:** ≤ 95 ms
**Goal:** Pick encoding dynamically per session based on coherence & velocity.

Built-in codecs:

* JSON
* CBOR
* MessagePack
* FlatBuffers
* Raw binary with checksums

### Codec Selection Logic:

* High coherence → FlatBuffers (speed)
* Medium → CBOR (balance)
* Low → MessagePack
* Chaotic → JSON w/ compression (max resilience)

---

## **0.4.1 — Channel Multiplexing (SNTL Preview)**

**Target:** ≤ 90 ms
**Goal:** Split one TCP tunnel into many logical lanes.

Channels:

* 0 → control signals
* 1 → telemetry
* 2 → gradient shards
* 3 → system events
* 4 → user-defined stream types

### Why it matters:

This finally allows **QVera, SigilNet, RealityNet, adapters, microservices**
to run on one unified transport.

---

## **0.4.2 — UDP Burst Mode (Entropy-Triggered)**

**Target:** ≤ 85 ms
**Goal:** Fire-and-forget bursts when the system is in high-velocity coherence transitions.

What ships:

* Deterministic UDP burst frames
* Same codec pipeline
* Same negentropy logic
* Auto-fallback into TCP reconvergence

### Why it matters:

Sometimes the mesh needs *speed over certainty* — this gives it legs.

---

# ⭐ Final 0.4.x Performance Targets

| Topology      | Current | Target       | Gain                 |
| ------------- | ------- | ------------ | -------------------- |
| native-native | 209 ms  | ≤ 60 ms      | 3.5×                 |
| native-ts     | 219 ms  | ≤ 70 ms      | 3.1×                 |
| ts-ts         | 815 ms  | ≤ 95 ms      | **8.6×**             |
| 50-node mesh  | 4–8 s   | **< 100 ms** | "planetary realtime" |

Yes — under 100 ms **for an entire distributed mesh**.

This is not just an improvement.
It’s **a new transport class.**

---

# 🧩 **Strategic Positioning**

QWormhole becomes:

### ✔ The first **entropy-adaptive transport**

Responds in real time to the physics of the system using it.

### ✔ The first **mesh-native Node transport**

Not just fast — self-regulating.

### ✔ The substrate for **SigilNet**, QVera, agent ecosystems

Multi-channel, coherence-driven, IO-lifted.

### ✔ The first realistic transport for **AI microservices that communicate at 50–100k msg/s**

Without tearing themselves apart.

### ✔ A landmark open-source protocol
---