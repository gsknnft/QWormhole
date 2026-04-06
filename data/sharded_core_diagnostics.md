# QWormhole Sharded Bench Report

Generated: 2026-02-28T00:59:27.180Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "160000",
  "QWORMHOLE_BENCH_CLIENTS": "16",
  "QWORMHOLE_BENCH_WARMUP_MESSAGES": "8000",
  "QWORMHOLE_BENCH_SHARD_WORKERS": "4"
}
```

## Summary

| Scenario | Workers | Clients | Messages | Duration (ms) | Received | Bytes | Msg/s | MB/s | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 1 | 16 | 160000 | 1506.97 | 160000 | 163840000 | 106174 | 103.69 | ok |
| sharded-ts-server+ts(4w) | 4 | 16 | 160000 | 0.00 | 0 | 0 | 0 | 0.00 | skipped: WorkerShardedServer could not bind 4 workers to the same port on this runtime. reusePort same-port worker startup is not functioning here. |


## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "workers": 1,
    "clients": 16,
    "messages": 160000,
    "durationMs": 1506.9666000000002,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "msgsPerSec": 106173.55421148683,
    "mbPerSec": 103.6851115346551
  },
  {
    "id": "sharded-ts-server+ts(4w)",
    "workers": 4,
    "clients": 16,
    "messages": 160000,
    "skipped": true,
    "reason": "WorkerShardedServer could not bind 4 workers to the same port on this runtime. reusePort same-port worker startup is not functioning here.",
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "msgsPerSec": 0,
    "mbPerSec": 0
  }
]
```
