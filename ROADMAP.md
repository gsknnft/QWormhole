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
- **v1.0.0**: Native server parity (production-ready), session key rotation, replay protection
