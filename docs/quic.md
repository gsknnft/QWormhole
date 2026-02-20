# QUIC transport plan (QWormhole)

This is the thin-scaffold for adding native QUIC to QWormhole. It keeps the existing Transport → Mux → SovereignTunnel layering and mirrors the TS/native adapters already in the codebase.

## Target architecture
- Native QUIC engine (quiche preferred; MsQuic as alternative).
- N-API shim (`qwquic.node`) exposing:
  - `createEndpoint(opts)`, `poll(endpoint, nowMs)`, `shutdown(endpoint)`
  - `connect(endpoint, { host, port, alpn, sni })`, `accept(endpoint)`
  - `openStream(conn, { bidirectional })`, `writeStream`, `readStream`, `closeConnection`
  - `stats(conn) -> { rttMs, cwndBytes, loss, bytesSent/Recv, streamsActive, congestionState }`
- JS adapter (`QuicTransport`) implements `QWormholeTransport`, emitting telemetry compatible with the existing diagnostics/negentropic scheduler.
- Browser path: WebTransport adapter with the same surface, wired into the telemetry store (future step).

## Current scaffold
- `src/transports/quic/quic-transport.ts`: Experimental transport using the native binding. Throws on `connect()` if `qwquic.node` is missing.
- `src/transports/quic/quic-binding.ts`: Dynamic loader for `qwquic.node` from `build/Release` or `dist/native`; exposes `quicAvailable()`.
- `src/transports/quic/types.ts`: Minimal binding and stats shapes.
- Factory accepts `kind: "quic"` and returns `undefined` if bindings are missing (call `QuicTransport.isAvailable()` to preflight).

## Binding discovery
- Override path with `QW_QUIC_PATH` (or legacy alias `QWORMHOLE_QUIC_PATH`).
- Loader checks package `build/Release`, `dist/native`, and `native/qwquic/target/release` paths.
- `node-gyp-build` resolution is scoped to `native/qwquic` to avoid accidentally loading the TCP native bindings.

## Next steps
1. Implement the native QUIC binding (quiche or MsQuic) to match `QuicBinding` in `types.ts`.
2. Extend `QuicTransport` to:
   - Drive the binding poll/timer loop.
   - Surface telemetry events (RTT, loss, cwnd, streams) into the telemetry store.
   - Support multiple streams and flow control backpressure signals.
3. Add WebTransport adapter for browser parity.
4. Bench integration: add `--mode=quic` to `scripts/bench.ts` once the native binding is ready; ensure diagnostics map to the existing bench output.

## Build expectations
- Ship `qwquic.node` into `dist/native/` (and/or `build/Release/`) so the loader can find it.
- Use `napi-rs` or node-addon-api; keep the surface minimal and telemetry-rich.
