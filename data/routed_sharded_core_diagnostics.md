# QWormhole Routed Sharded Bench Report

Generated: 2026-02-28T14:19:39.401Z

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
| ts-server+ts | 1 | 16 | 160000 | 1578.29 | 160000 | 163840000 | 101375 | 99.00 | ok |
| routed-sharded-ts-server+ts(4w) | 4 | 16 | 160000 | 1481.62 | 160000 | 163840000 | 107990 | 105.46 | ok |

## routed-sharded-ts-server+ts(4w) Workers

| Shard | Process | Listening | Connections | Messages | Bytes | Errors | Port |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 12476 | yes | 4 | 42000 | 43008000 | 0 | 64511 |
| 1 | 21444 | yes | 4 | 42000 | 43008000 | 0 | 64512 |
| 2 | 5220 | yes | 4 | 42000 | 43008000 | 0 | 64513 |
| 3 | 7488 | yes | 4 | 42000 | 43008000 | 0 | 64514 |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "workers": 1,
    "clients": 16,
    "messages": 160000,
    "durationMs": 1578.2945000000002,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "msgsPerSec": 101375.2503097489,
    "mbPerSec": 98.99926788061416
  },
  {
    "id": "routed-sharded-ts-server+ts(4w)",
    "workers": 4,
    "clients": 16,
    "messages": 160000,
    "durationMs": 1481.6165999999994,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "msgsPerSec": 107990.15075830014,
    "mbPerSec": 105.45913159990248,
    "workerStats": {
      "workers": 4,
      "listening": true,
      "connections": 16,
      "acceptedConnections": 16,
      "proxiedConnections": 16,
      "messagesIn": 168000,
      "bytesIn": 172032000,
      "errors": 0,
      "address": {
        "address": "127.0.0.1",
        "family": "IPv4",
        "port": 64515
      },
      "byWorker": [
        {
          "shardIndex": 0,
          "processId": 12476,
          "listening": true,
          "connections": 4,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 64511
          }
        },
        {
          "shardIndex": 1,
          "processId": 21444,
          "listening": true,
          "connections": 4,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 64512
          }
        },
        {
          "shardIndex": 2,
          "processId": 5220,
          "listening": true,
          "connections": 4,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 64513
          }
        },
        {
          "shardIndex": 3,
          "processId": 7488,
          "listening": true,
          "connections": 4,
          "messagesIn": 42000,
          "bytesIn": 43008000,
          "errors": 0,
          "address": {
            "address": "127.0.0.1",
            "family": "IPv4",
            "port": 64514
          }
        }
      ]
    }
  }
]
```
