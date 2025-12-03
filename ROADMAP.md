# QWormhole Roadmap

This document outlines near-term enhancements for @gsknnft/qwormhole. Items are ordered by expected impact and feasibility.

## Native & Transport
- **Converge on libwebsockets as the primary native backend**: keep libsocket as Linux/WSL fallback for one more cycle, then remove if parity is confirmed.
- **Secure Streams exposure**: add a higher-level API that maps LWS Secure Streams (JSON policy + callbacks) to a simplified TS surface; ship a minimal example.
- **UART / custom transports**: document and optionally expose a UART transport path via LWS for embedded use cases.
 - **Batching / backpressure**: optional batching/coalescing mode; backpressure counters surfaced via telemetry.

## Install & Tooling
- **Native build switches**: `QWORMHOLE_NATIVE=0` to skip native, `QWORMHOLE_NATIVE=1` to force it, and `QWORMHOLE_BUILD_LIBSOCKET=0` to skip libsocket on Linux/WSL when leaning into LWS-only (macOS now auto-skips libsocket entirely).
- **Better logging**: add `QWORMHOLE_DEBUG_NATIVE=1` to emit which backend loaded and why fallback happened.
- **Prebuilt binaries (exploratory)**: evaluate CI-built precompiled addons for common platforms to reduce local toolchain friction.

## Documentation
- **Troubleshooting guide**: common native build errors (OpenSSL on Windows, node-gyp toolchain, esbuild/rollup platform mismatches) with quick fixes.
- **Examples**: add minimal samples for Secure Streams and for native LWS client/server usage.
- **Table of Contents**: improve README navigation as content grows.

## Testing & Coverage
- **Native LWS edge cases**: stress send/recv buffering, writable callbacks, and error handling in the addon.
- **TS client/server edge cases**: reconnect/backpressure/rate-limit paths; handshake failures.
- **Matrix CI**: run TS + native (LWS) on Windows and Linux; optional libsocket on Linux/WSL.
 - **Bench coverage**: include TS vs native-lws vs native-libsocket runs in CI (where supported) to catch performance regressions.

## Performance
- **Benchmarks**: include native LWS vs TS comparisons across Windows and Linux; measure latency/throughput under backpressure and rate limiting.
- **Profiling hooks**: lightweight telemetry option for bytes/latency in native and TS modes.

## Timeline (tentative)
- **Next iteration**: doc improvements (ToC, troubleshooting), native logging toggle, optional skip-libsocket env, Secure Streams planning.
- **Following iteration**: native LWS edge-case tests, Secure Streams minimal example, decision on libsocket deprecation.
