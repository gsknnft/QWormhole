# Changelog

## Unreleased (next: 0.3.0)

- Bench and release-lane clarification:
  - `bench:core:report` is explicitly the raw core transport lane again.
  - Transport coherence history sampling is opt-in via `QWORMHOLE_TRANSPORT_COHERENCE=1` to avoid contaminating throughput measurements.
  - Added `bench:core:structure` as a separate structural validation lane writing to `data/core_diagnostics.structure.*`.
  - QWormhole publication from `main` is intentionally paused until `@sigilnet/coherence` is ready for external release.

- Prebuilt-native distribution lane added:
  - Added `native:stage-prebuilds` to stage `prebuilds/<platform>-<arch>/*.node`.
  - Installer now hydrates prebuilt artifacts into `dist/native` before rebuild attempts.
  - Runtime loaders probe prebuilt paths first, then fallback to `bindings()` and TS transport.
- Native build/install hardening:
  - `install-native.js` now uses `node-gyp` for rebuild invocation on non-Windows hosts.
  - Added committed `libwebsockets/include/lws_config.h` fallback for deterministic CI builds.
- CI/release hardening:
  - Release workflow now supports multi-OS prebuild artifact jobs.
  - Release workflow supports `workflow_dispatch` dry-run mode (`semantic-release --dry-run`).
  - Tag-based publish flow remains authoritative for actual release publication.
- Test/contract hardening:
  - Native server smoke suite now skips when native binding is unavailable.
  - Native loader test path is isolated from local prebuilt probing during Vitest unless explicitly enabled.
- Optional/research dependency hardening:
  - Vite release build externalizes optional `@tensorflow/tfjs` and `@sigilnet/qfield` imports.

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
