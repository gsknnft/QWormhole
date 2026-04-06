## Known issues / roadmap
- **Native client binding resolution** may fail outside standard `bindings()` lookup paths; alignment with `module_root` resolution is pending.
- **Native server parity**: per-connection `send()` is not yet implemented on the wrapper; TS server is recommended for production.
- **QUIC/WebTransport**: experimental; bindings and adapters exist but are not production-ready.
- **WireGuard integration**: docs exist, but end-to-end validation is pending in this repo.
- More telemetry/export hooks and Secure Streams are planned for a later release.

### Focus items (v1.x)
1. Native server parity + automated coverage (wrapper implemented, testing in progress)
2. TLS playbooks (mTLS, Let's Encrypt, WireGuard interop)  see [docs/tls-examples.md](docs/tls-examples.md)
3. Sovereign tunnel upgrades: session key rotation, replay guards, forward secrecy toggle
4. SCP semantic layer reference implementation + clearer boundary docs
5. QUIC/WebTransport exploration for high-latency meshes

##  Documentation

- [TLS Examples](docs/tls-examples.md)  Mutual TLS, Let's Encrypt, client certs, fingerprint pinning
- [Mesh Network Tutorial](docs/mesh-network-tutorial.md)  Building mesh networks with WireGuard
- [Deployment Patterns](docs/deployment-patterns.md)  Docker, Kubernetes, Systemd, PM2
- [Security Policy](SECURITY.md)  Vulnerability reporting and security considerations

##  Roadmap

- Secure Streams
- TLS/TCP wrappers
- Multiplexing
- WebSocket transport
- UDP transport
- Browser transport (WebRTC)

## Strange Attractor Detection

VeraOS can detect when system behavior resembles strange attractors
(chaotic dynamical systems).

### Supported Attractors

**Aizawa Attractor:**
- Parameters: a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1
- Characteristics: High fit error (>0.4), low symmetry (<0.4)
- Interpretation: Deterministic chaos

### Usage
```typescript
import { computeAizawa, projectToPolar } from '@sigilnet/coherence/attractors';
import { extractGeometricSignature } from '@sigilnet/coherence';

// Generate reference Aizawa
const aizawa = computeAizawa({ steps: 10000 });
const polar = projectToPolar(aizawa, 'xy');
const sig = extractGeometricSignature(polar);

console.log(sig.fitError);  // ~0.5-0.7 (high)
console.log(sig.symmetry);  // ~0.2-0.3 (low)
```

### Regime Classification

| Fit Error | Symmetry | Regime | Interpretation |
|-----------|----------|--------|----------------|
| < 0.15 | > 0.7 | Coherent | Natural structure |
| 0.15-0.35 | 0.5-0.7 | Turbulent | Some irregularity |
| 0.35-0.5 | 0.3-0.5 | Chaotic | Strange attractor |
| > 0.5 | < 0.3 | Predatory | Adversarial pattern |
---

##  What's Built

- **QWormholeNode**
  - Wraps a `QWormholeServer` (listener) and optional `QWormholeClient` (dialer).
  - Participates in **UDP/mDNS discovery** so nodes can autodiscover peers on a LAN.
  - Maintains a **PeerTable** with metadata (negentropic index, trust level, keys, etc.).
  - Exposes **gossip hooks** (`tick`, `broadcast`) for higher layers like SigilNet or NegentropicCouplingTheory.
  - Can **dial seeds** to bootstrap into a mesh.

- **Bench harness upgrades**
  - Adaptive/jitter flags for batch sizing and flush interval tuning.
  - Live logging via `console.table`.
  - Richer CSV metadata for plotting sweeps.
  - README-style benchmark template (`docs/benchmarks-template.md`) for reproducible reporting.

- **Plotting script polish**
  - Combined subplots by default, with clearer annotations and colorbar.
  - `--separate` switch for individual windows.
  - Heatmap gated to multiflush sweeps, so you dont clutter singlerun plots.

---

##  Why This Matters

**A full stack feedback loop**:

1. **Transport substrate (QWormhole)**  canonical batching, flush, backpressure.
2. **Mesh runtime (QWormholeNode)**  discovery, peer tracking, gossip.
3. **Bench harness**  adaptive tuning, CSV emission, live diagnostics.
4. **Plotting script**  annotated heatmaps, throughput vs latency tradeoff curves.
5. **Docs template**  reproducible benchmark narratives for contributors.

This is the kind of scaffolding that makes performance optimization **teachable and auditable**.

---

##  Next Moves

- **Connection tracking**
  - Extend `dialSeed()` to register live `QWormholeClient` connections keyed by `PeerId`.
  - Feed latency/flush metrics back into `PeerTable`.

- **Gossip forwarding**
  - Right now gossip emits locally. Next step: forward gossip messages across QWormhole connections.
  - That turns your runtime into a true mesh overlay.

- **Adaptive runtime**
  - Let `QWormholeNode` autotune batch size/flush interval based on peer backpressure and latency.
  - You already have adaptive flags in the bench harness  fold them into runtime.

- **Diagnostics surfacing**
  - Pipe node metrics (peer count, gossip ticks, backpressure events) into your console UI.
  - Export snapshots for README diagrams.

---

### Takeaway
QWormhole is now a mesh-ready runtime with diagnostics, plotting, and reproducible benchmark workflows. The next step is routing gossip across live peer connections and feeding adaptive tuning into the node runtime.

## TS writev/length-prefixed tuning

- Env overrides (BatchFramer/entropy policy):
  - `QW_WRITEV_BATCH_SIZE` (default `96`): frames per flush; try `64-96` to balance latency vs throughput.
  - `QW_WRITEV_FLUSH_MS` (default `2`): flush interval for partial batches; try `1-4` ms.
- Sweep quickly:
  - `pnpm --filter @gsknnft/qwormhole run bench:writev`
