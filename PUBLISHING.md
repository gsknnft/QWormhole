# Publishing @sigilnet/qwormhole

Checklist:
- [ ] `pnpm --filter @sigilnet/qwormhole build`
- [ ] (Optional) `pnpm --filter @sigilnet/qwormhole run build:native`
- [ ] `pnpm --filter @sigilnet/qwormhole test`
- [ ] README and CHANGELOG updated
- [ ] Version bumped in `package.json`
- [ ] (Optional) set `QWORMHOLE_NATIVE=0` if skipping native in CI

Publish:
```bash
cd packages/QWormhole
npm publish --access public
```

Known current scope:
- Server transport is TS-only; native server bindings planned.
- Transport is unencrypted; use TLS/WireGuard/SSH as needed.
