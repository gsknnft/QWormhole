# QWormhole Core Bench Delta Report

Generated: 2026-03-01T14:55:09.740Z

## Inputs

```json
{
  "rawPath": "C:\\Users\\G\\Desktop\\Builds\\sigilnet\\packages\\QWormhole\\data\\core_diagnostics.jsonl",
  "structurePath": "C:\\Users\\G\\Desktop\\Builds\\sigilnet\\packages\\QWormhole\\data\\core_diagnostics.structure.jsonl",
  "scenarios": 4
}
```

## Summary

| Scenario | Raw Median Msg/s | Structure Median Msg/s | Median Delta | Raw Avg Msg/s | Structure Avg Msg/s | Avg Delta | Raw Range % | Structure Range % | Range Reduction | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 105771 | 92265 | -12.8% | 104107 | 87270 | -16.2% | 13.2 | 44.9 | -239.3% | overhead |
| ts-server+native-lws | 102746 | 100080 | -2.6% | 101493 | 96281 | -5.1% | 8.8 | 34.2 | -290.0% | neutral |
| native-server(lws)+ts | 82141 | 50256 | -38.8% | 83321 | 50457 | -39.4% | 14.0 | 31.3 | -123.1% | overhead |
| native-server(lws)+native-lws | 107714 | 81924 | -23.9% | 107495 | 82347 | -23.4% | 10.7 | 29.3 | -173.8% | overhead |

## Classification

- `overhead`: structure materially slower on throughput.
- `native-benefit`: native-involved lane with materially higher throughput under structure.
- `native-benefit+stabilized`: native-involved lane with materially higher throughput and reduced normalized range.
- `neutral`: throughput delta within about +/-5%.
- `neutral+stabilized`: near-neutral throughput with reduced normalized range.
- `variance-improved`: throughput story is mixed, but normalized range improved.
- `mixed`: no strong signal under the current thresholds.

## Interpretation

- `ts-server+ts`: structure is slower by -12.8% on median throughput.
- native-involved lanes average -21.8% median throughput delta under structure.
- Range reduction is based on normalized throughput range `(best - worst) / avg` from the repeat summary.
- This report compares the latest JSONL entry per scenario from each file; rerun both lanes back-to-back for the cleanest pairing.

