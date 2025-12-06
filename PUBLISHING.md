
# Publishing @gsknnft/qwormhole (v0.2.0 — Negentropic Coupling Diagnostics)

Checklist:
- [x] `pnpm --filter @gsknnft/qwormhole build`
- [x] (Optional) `pnpm --filter @gsknnft/qwormhole run build:native`
- [x] `pnpm --filter @gsknnft/qwormhole test`
- [x] README and CHANGELOG updated for 0.2.0
- [x] Version bumped in `package.json` to 0.2.0
- [ ] (Optional) set `QWORMHOLE_NATIVE=0` if skipping native in CI

Publish:
```bash
cd packages/QWormhole
npm publish --access public
```


Release scope:
- Native server bindings (libwebsockets) now included
- Negentropic diagnostics, entropy/negentropy, coherence/velocity enums
- Transport is unencrypted by default; use TLS/WireGuard/SSH as needed.
