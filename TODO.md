# QWormhole TODO (2026-02-05)

## Native realignment
- Add CI smoke tests for native client + native server (Windows + Linux).

## QUIC stabilization
- Gate QUIC transport behind a feature flag (clear error when bindings are missing).
- Document supported environments and expected failure modes.
- Add a minimal integration test for `qwquic.node` (connect, send, receive, close).

## WireGuard validation
- Run the mesh tutorial end-to-end and capture a validated example config.
- Document interface binding gotchas per OS (Windows vs Linux vs macOS).

## Performance safety
- Add a documented, safe rate-limit profile (e.g., defaults for `rateLimitBytesPerSec` and `rateLimitBurstBytes`).
- Add a benchmark preset for "safe" vs "max" throughput with clear warnings.

## Native client parity
- Add backpressure signaling for native client writes to avoid silent overload.
