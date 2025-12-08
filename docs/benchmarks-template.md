## QWormhole TS/writev Benchmarks

| Batch | Flush (ms) | p50 (ms) | p99 (ms) | Throughput (msg/s) | Server Backpressure |
|-------|------------|----------|----------|--------------------|---------------------|
| b8    | 1          | …        | …        | …                  | …                   |
| b16   | 1          | …        | …        | …                  | …                   |
| b32   | 1          | …        | …        | …                  | …                   |
| b64   | 1          | …        | …        | …                  | …                   |

**How to regenerate**

```bash
# Run a sweep (override batches/flushes via env)
pnpm --filter @gsknnft/qwormhole bench:sweep

# Plot combined figures (default) or separate windows
python scripts/plot_bench.py            # subplots
python scripts/plot_bench.py --separate # individual windows
```

**Tuning notes**
- `--batch` / `--flushMs`: primary knobs; use smaller batches for latency, larger for throughput.
- `--jitter`: adds ± jitter to flush interval to smooth burst timing.
- `--adapt`: shrink batch on backpressure (`--bpThreshold`, `--batchMin`).
- Live logging: `--logInterval=500` for rolling p50/p99 + backpressure telemetry.

**Artifact paths**
- CSVs: `packages/QWormhole/data/*.csv`
- Plots: save from matplotlib or wire into `docs/assets/qwormhole-bench.png` for README embedding.
