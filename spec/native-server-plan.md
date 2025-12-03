# Native Server & Benchmark Plan

## Objectives
- Mirror the existing client-side native binding pattern for the server so both ends can optionally use libwebsockets/libsocket without breaking the TypeScript fallback.
- Advertise native capability flags through the SCP handshake (sid/caps/nv) so peers can reason about transport features.
- Provide deterministic fallbacks: if bindings fail to load or the env forbids native, we instantly return to the TS implementation with clear diagnostics.
- Establish a repeatable benchmark matrix (TS↔TS, Native↔TS, Native↔Native) to prove the perf gains and catch regressions in CI.

## Native Server Binding Shape

### Loader Strategy
- Introduce `src/native-server.ts` that reuses the binding resolver from `src/native.ts` but looks for exported server wrappers, e.g. `ServerWrapper` next to `TcpClientWrapper`.
- Detection order matches the client: prefer `qwormhole_lws.node`, fall back to `qwormhole.node`. Respect `QWORMHOLE_NATIVE`/`preferNative`/`forceTs` flags.
- Export helpers:
  ```ts
  export type NativeServerBinding = {
    kind: NativeBackend;
    module: {
      QWormholeServerWrapper: new () => NativeServer;
    };
  };

  export const loadNativeServer(preferred?: NativeBackend): NativeServerBinding | null;
  export class NativeQWormholeServer implements QWormholeServerLike { ... }
  ```
- `NativeQWormholeServer` must expose the same public surface as `QWormholeServer` (`listen`, `close`, `broadcast`, `on`, telemetry hooks) so downstream code remains agnostic.

### Factory Integration
- Extend `createQWormholeServer` signature to accept `{ preferNative?: boolean; forceTs?: boolean; }`, mirroring `createQWormholeClient`.
- When native bindings are available and not forced off, instantiate `NativeQWormholeServer` with a shared options object. Include `mode` in the result (`native-lws`, `native-libsocket`, `ts`).
- Ensure a failure to instantiate native (throws, missing symbol) immediately falls back to TS after logging a single warning.

### SCP Alignment
- During the handshake the server must advertise capability flags such as:
  ```json
  {
    "transport": { "native": true, "backend": "lws" }
  }
  ```
  so peers can degrade gracefully according to `scp-capabilities.md`.
- Use Zod schemas (now added as dev dependency) to validate handshake payloads in both TS and native paths before sending/accepting them.
- Native server telemetry should still emit NV/intent/shard events exactly as the TS server does, feeding the spec’s negentropy/state models.

### Error-handling & Fallback Rules
1. Binding missing → log `[native-server] binding not found, falling back to TS` once per process.
2. Runtime failure (e.g., server wrapper throws) → destroy the native instance, emit `error`, and optionally auto-migrate clients to TS via reconnect (documented behavior).
3. Env override `QWORMHOLE_NATIVE=disable` or options.forceTs skips binding resolution entirely for deterministic deployments.

## Benchmark Coverage Plan

### Goals
- Quantify throughput (messages/s, bytes/s) and latency across transport combinations.
- Compare CPU usage where possible (Node profiling, `process.cpuUsage`).
- Ensure fallback paths are exercised under load (e.g., simulate binding failure mid-run and confirm clients reconnect using TS).

### Harness
- Reuse `packages/QWormhole/scripts/bench.ts` as the basis; it already sends fixed payloads across TS/native clients.
- Extend it to:
  1. Spin up both TS and native servers once available.
  2. Run the following matrix: `ts-server ↔ ts-client`, `ts-server ↔ native-client`, `native-server ↔ ts-client`, `native-server ↔ native-client`.
  3. Capture per-run stats: duration, messages, bytes, average latency (add histogram using `performance.now()` snapshots), optional CPU.
  4. Emit JSON + table summaries that CI can archive.

### Automation
- Add a `pnpm bench:qwormhole` script that invokes the harness with `--mode=all`.
- Wire a nightly GitHub Action to build native bindings (if runners support it) and publish benchmark artifacts for regression tracking.
- Complement automated runs with a light Vitest bench (or `vitest --runInBand --benchmark`) that exercises the TS-only path so contributors without native deps can still validate changes quickly.

### Validation Checklist
- Bench harness must succeed even when native bindings are missing (skip native modes, mark results as `"skipped": true`).
- Add integration tests asserting `createQWormholeServer({ preferNative: true })` selects native mode when available and falls back otherwise (mirroring `test/factory-native.test.ts`).
- Document operational toggles (`QWORMHOLE_NATIVE=force-ts`, `preferNative` flags) in `README.md` so ops know how to control deployments.

---
These steps give Codex a clear target for implementing the native server wrapper while keeping the TypeScript path reliable. Once Codex lands the bindings, we’ll plug them into the factory, apply the Zod-validated handshake, and light up the benchmark matrix above.
