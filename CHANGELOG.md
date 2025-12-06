# Changelog

## 0.2.0 — Native server, adaptive slicing, diagnostics
- Flow controller now auto-enables adaptive slicing (guarded for TS peers, aggressive for native) with more responsive defaults (smaller sample windows, larger drift, lower idle target) so high-trust TS paths recover top-line throughput without manual `QWORMHOLE_FORCE_SLICE` tweaks. Use `QWORMHOLE_ADAPTIVE_SLICES=off|guarded|aggressive|auto` to override or disable.
- Bench diagnostics emit event-loop delay percentiles and per-block send latency, making GC/EL regression hunts easier directly from `scripts/bench.ts`.

## 0.1.0 — Initial public kernel
- TypeScript transport layer (length-prefixed TCP with reconnect)
- Optional native bindings (libwebsockets, libsocket)
- Pluggable serializers/deserializers (Buffer/Text/JSON/CBOR helpers)
- Runtime factory for TS/native selection with interface binding
- Rate limiting and backpressure guard
- Protocol handshake (version + tags) with optional negentropic signer
- Full test suite (TS + native smoke)
- Multi-platform support (Windows/macOS/Linux/WSL)
