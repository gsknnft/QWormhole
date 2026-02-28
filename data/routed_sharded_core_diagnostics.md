# QWormhole Routed Sharded Bench Report

Generated: 2026-02-28T14:04:18.857Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "320000",
  "QWORMHOLE_BENCH_CLIENTS": "64",
  "QWORMHOLE_BENCH_WARMUP_MESSAGES": "16000",
  "QWORMHOLE_BENCH_SHARD_WORKERS": "8"
}
```

## Summary

| Scenario | Workers | Clients | Messages | Duration (ms) | Received | Bytes | Msg/s | MB/s | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 1 | 64 | 320000 | 2520.49 | 320000 | 327680000 | 126959 | 123.98 | ok |
| routed-sharded-ts-server+ts(8w) | 8 | 64 | 320000 | 3040.66 | 320000 | 327680000 | 105240 | 102.77 | ok |

## routed-sharded-ts-server+ts(8w) Workers

| Shard | Process | Listening | Connections | Messages | Bytes | Errors | Port |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7748 | yes | 8 | 42000 | 43008000 | 0 | 60628 |
| 1 | 15156 | yes | 8 | 42000 | 43008000 | 0 | 60632 |
| 2 | 17476 | yes | 8 | 42000 | 43008000 | 0 | 60630 |
| 3 | 19656 | yes | 8 | 42000 | 43008000 | 0 | 60631 |
| 4 | 12128 | yes | 8 | 42000 | 43008000 | 0 | 60629 |
| 5 | 19780 | yes | 8 | 42000 | 43008000 | 0 | 60635 |
| 6 | 17372 | yes | 8 | 42000 | 43008000 | 0 | 60634 |
| 7 | 1988 | yes | 8 | 42000 | 43008000 | 0 | 60633 |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "workers": 1,
    "clients": 64,
    "messages": 320000,
    "durationMs": 2520.4899000000005,
    "messagesReceived": 320000,
    "bytesReceived": 327680000,
    "msgsPerSec": 126959.4454633601,
    "mbPerSec": 123.9838334603126
  },
  {
    "id": "routed-sharded-ts-server+ts(8w)",
    "workers": 8,
    "clients": 64,
    "messages": 320000,
    "durationMs": 3040.6615999999995,
    "messagesReceived": 320000,
    "bytesReceived": 327680000,
    "msgsPerSec": 105240.25429202647,
    "mbPerSec": 102.7736858320571,
    "workerStats": {
      "workers": 8,
      "listening": true,
      "connections": 64,
      "acceptedConnections": 64,
      "proxiedConnections": 64,
      "messagesIn": 336000,
      "bytesIn": 344064000,
      "errors": 0,
      "address": {
        "address": "127.0.0.1",
        "family": "IPv4",
        "port": 60636
      },
      "byWorker": [
        {
          "shardIndex": 0,
          "processId": 7748,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60628
          }
        },
        {
          "shardIndex": 1,
          "processId": 15156,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60632
          }
        },
        {
          "shardIndex": 2,
          "processId": 17476,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60630
          }
        },
        {
          "shardIndex": 3,
          "processId": 19656,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60631
          }
        },
        {
          "shardIndex": 4,
          "processId": 12128,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60629
          }
        },
        {
          "shardIndex": 5,
          "processId": 19780,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60635
          }
        },
        {
          "shardIndex": 6,
          "processId": 17372,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60634
          }
        },
        {
          "shardIndex": 7,
          "processId": 1988,
          "listening": true,
          "connections": 8,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 60633
          }
        }
      ]
    }
  }
]
```
