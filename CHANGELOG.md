# Changelog

## 0.2.1 - Packaging and publish hardening

- Publish path hardened for npm consumers:
  - `install` now runs only optional native setup (`scripts/install-native.js`).
  - Removed consumer install-time `pnpm` commands.
- `publishConfig.access` set to `public`.
- Added `prepack` cleanup for `dist/tsconfig.tsbuildinfo`.
- Added `prepublishOnly` release gate (`build` + `test`).

## 0.2.0 - Native server, adaptive slicing, diagnostics

- Flow controller auto-enables adaptive slicing (guarded for TS peers, aggressive for native) with faster defaults.
- Bench diagnostics emit event-loop delay percentiles and per-block send latency.

## 0.1.0 - Initial public kernel

- TypeScript transport layer (length-prefixed TCP with reconnect).
- Optional native bindings (libwebsockets, libsocket).
- Pluggable serializers/deserializers (Buffer/Text/JSON/CBOR helpers).
- Runtime factory for TS/native selection with interface binding.
- Rate limiting and backpressure guard.
- Protocol handshake (version + tags) with optional negentropic signer.
- Full test suite (TS + native smoke).
- Multi-platform support (Windows/macOS/Linux/WSL).
