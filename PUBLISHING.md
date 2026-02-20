# Publishing @gsknnft/qwormhole

Checklist:
- [x] `pnpm --filter @gsknnft/qwormhole build`
- [x] (Optional) `pnpm --filter @gsknnft/qwormhole run rebuild`
- [x] (Optional) `pnpm --filter @gsknnft/qwormhole run native:stage-prebuilds`
- [x] `pnpm --filter @gsknnft/qwormhole test`
- [x] README and CHANGELOG updated
- [x] Version bumped in `package.json`
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