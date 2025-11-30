# Publishing @gsknnft/qwormhole

Checklist:
- [x] `pnpm --filter @gsknnft/qwormhole build`
- [x] (Optional) `pnpm --filter @gsknnft/qwormhole run build:native`
- [x] `pnpm --filter @gsknnft/qwormhole test`
- [x] README and CHANGELOG updated
- [x] Version bumped in `package.json`
- [ ] (Optional) set `QWORMHOLE_NATIVE=0` if skipping native in CI

Publish:
```bash
cd packages/QWormhole
npm publish --access public
```

Known current scope:
- Server transport is TS-only; native server bindings planned.
- Transport is unencrypted; use TLS/WireGuard/SSH as needed.
