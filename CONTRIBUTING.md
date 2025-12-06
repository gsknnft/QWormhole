# Contributing to QWormhole

QWormhole Core is a transport kernel. Please keep contributions scoped to transport concerns:

1) Preserve deterministic transport behavior (framing, reconnect, telemetry).  
2) Keep the zero-dependency TypeScript fallback working even when native is absent or fails.  
3) Treat native bindings as optional accelerators; installs must not fail if native is missing.  
4) Avoid business logic or SigilNet/Sovereign concepts in Core.  
5) Add tests for new code paths (TS and native where applicable).

Before opening a PR:
- `pnpm --filter @sigilnet/qwormhole test` (TS + coverage)
- `pnpm --filter @sigilnet/qwormhole run build:native` (optional; native smoke)
- Ensure README/CHANGELOG/docs stay accurate, especially for diagnostics/negentropic features (0.2.0+).
