# QWormhole Bench Report

Generated: 2026-02-28T00:43:08.568Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "160000",
  "QWORMHOLE_BENCH_CLIENTS": "16"
}
```

## Summary

| Scenario | Server | Client | Clients | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 16 | 1623.80 | 160000 | 163840000 | 98534 | 96.22 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 16 | 712.65 | 160247 | 164092928 | 224860 | 219.59 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 16 | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 16 | 1430.71 | 160000 | 163840000 | 111833 | 109.21 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 16 | 1006.52 | 160839 | 164699136 | 159796 | 156.05 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 16 | - | 0 | 0 | - | - | length-prefixed | skipped |
| net-server+net | net | net | 16 | 4206.33 | 160000 | 163840000 | 38038 | 37.15 | length-prefixed | ok |
| ws-server+ws | ws | ws | 16 | 3235.35 | 160000 | 163840000 | 49454 | 48.29 | none | ok |
| uwebsockets-server+ws | uwebsockets | ws | 16 | 1802.34 | 160000 | 163840000 | 88773 | 86.69 | none | ok |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 31 | 107.82 | 93.12 | 0 | 0 | 0 | 31344 | 5.79 | 5.81 | 30 | 30.12 | 31310 | 0 | - | off | off | off |
| ts-server+native-lws | 12 | 17.49 | 94.30 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 2640 | - | off | off | off |
| native-server(lws)+ts | 14 | 50.57 | 91.87 | 0 | 0 | 0 | 17680 | 12.53 | 12.58 | 48 | 48.19 | 17648 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 8 | 11.47 | 96.52 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 2640 | - | off | off | off |

## Transport Coherence

- Transport coherence sampling: disabled in this raw lane. Run `bench:compare:structure` for tSNI / tSPI / tMeta.
- Best transport persistence: unavailable
- Fastest transport-coherence row: unavailable (sampling disabled in this lane)
- Transport/throughput alignment unavailable in this lane.

_Transport coherence metrics are intentionally off in the raw lane._

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 1623.7997999999998,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "length-prefixed",
    "msgsPerSec": 98534.31439023458,
    "mbPerSec": 96.22491639671345,
    "benchConfig": {
      "macroBatchTargetBytes": 131072,
      "flowFastPath": false,
      "payload": {
        "count": 1,
        "minBytes": 1024,
        "maxBytes": 1024,
        "avgBytes": 1024,
        "types": [
          "buffer"
        ],
        "framing": "length-prefixed",
        "frameHeaderBytes": 4
      },
      "effectiveRateBytesPerSec": 16777216,
      "flushCapBytes": 30966,
      "flushCapBuffers": 32,
      "flushIntervalMs": 1,
      "adaptiveMode": "guarded"
    },
    "diagnostics": {
      "gc": {
        "count": 31,
        "durationMs": 107.82079999987036,
        "byKind": {
          "incremental": 10,
          "major": 10,
          "minor": 11
        }
      },
      "eventLoop": {
        "utilization": 0.9311917556037257,
        "activeMs": 1.841818699999949,
        "idleMs": 0.1360969
      },
      "eventLoopDelay": {
        "minMs": 19.447808,
        "maxMs": 320.077823,
        "meanMs": 32.45034813793104,
        "stdMs": 39.37201274994706,
        "p50Ms": 25.395199,
        "p99Ms": 93.650943
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 31344,
        "avgBuffersPerFlush": 5.7894971924451255,
        "avgBytesPerFlush": 5951.603113833588,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "transportCalls": {
        "batchWritevCalls": 31310,
        "batchWritevBuffers": 181432,
        "batchWritevBytes": 186512096,
        "writeBufferCalls": 34,
        "writeBufferBytes": 34952,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 652,
        "totalBytes": 3068580,
        "backpressureEvents": 981,
        "availableTokens": 524288,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772239373787,
            "size": 5
          },
          {
            "timestamp": 1772239373789,
            "size": 7
          },
          {
            "timestamp": 1772239373789,
            "size": 5
          },
          {
            "timestamp": 1772239373789,
            "size": 4
          },
          {
            "timestamp": 1772239373790,
            "size": 6
          },
          {
            "timestamp": 1772239373790,
            "size": 5
          },
          {
            "timestamp": 1772239373790,
            "size": 7
          },
          {
            "timestamp": 1772239373790,
            "size": 5
          },
          {
            "timestamp": 1772239373790,
            "size": 4
          },
          {
            "timestamp": 1772239373791,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.0935774750882527,
          "bytesPerFlushAvg": 3914.6989064533113,
          "eluIdleRatioAvg": 0.8959580790256658,
          "gcPauseMaxMs": 0.0003918704291182251
        },
        "negentropic": {
          "histogram": {
            "buffer": 512
          },
          "entropy": 0,
          "negentropy": 0,
          "neganticIndex": 0,
          "entropyVelocity": 0,
          "coherence": "Low",
          "velocity": "Slow",
          "sampleCount": 512
        }
      },
      "clientBatch": {
        "totalFrames": 10500,
        "totalFlushes": 1959,
        "totalBytes": 11843588,
        "pendingFrames": 0,
        "pendingBytes": 0,
        "maxPendingFrames": 31,
        "maxPendingBytes": 31868,
        "maxInBufferBytes": 0,
        "ringSlots": 128,
        "ringInUse": 0,
        "ringMaxInUse": 31,
        "ringResizeCount": 0,
        "ringResizeBytes": 0,
        "overflowAllocations": 0,
        "overflowAllocatedBytes": 0,
        "copyAllocations": 0,
        "copyAllocatedBytes": 0,
        "lastFlushTimestamp": 1772239373791,
        "backpressureEvents": 981,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772239373790
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 9999,
        "totalEnqueued": 10500,
        "totalDequeued": 10500,
        "bytes": 0,
        "maxBytes": 10238976,
        "bytesEnqueued": 10752000,
        "bytesDequeued": 10752000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 160,
        "avgMs": 1.6603750000000006,
        "minMs": 1.0927000000001499,
        "maxMs": 9.171599999999899
      },
      "heap": {
        "start": {
          "rss": 199581696,
          "heapTotal": 126914560,
          "heapUsed": 70597280,
          "external": 25705841,
          "arrayBuffers": 16910807
        },
        "end": {
          "rss": 278417408,
          "heapTotal": 198479872,
          "heapUsed": 64063000,
          "external": 22645937,
          "arrayBuffers": 13857603
        },
        "peakHeapUsed": 111857920,
        "peakRss": 230449152
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 712.6524999999997,
    "messagesReceived": 160247,
    "bytesReceived": 164092928,
    "framing": "length-prefixed",
    "msgsPerSec": 224859.94225797296,
    "mbPerSec": 219.58978736130172,
    "diagnostics": {
      "gc": {
        "count": 12,
        "durationMs": 17.48600000049919,
        "byKind": {
          "incremental": 6,
          "major": 6,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.9430344312575336,
        "activeMs": 1.3289972999996817,
        "idleMs": 0.08028029999999999
      },
      "eventLoopDelay": {
        "minMs": 19.120128,
        "maxMs": 166.068223,
        "meanMs": 59.612598857142856,
        "stdMs": 52.80692640294917,
        "p50Ms": 22.904831,
        "p99Ms": 166.068223
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 0,
        "avgBuffersPerFlush": 0,
        "avgBytesPerFlush": 0,
        "maxBuffers": 0,
        "maxBytes": 0
      },
      "transportCalls": {
        "batchWritevCalls": 0,
        "batchWritevBuffers": 0,
        "batchWritevBytes": 0,
        "writeBufferCalls": 0,
        "writeBufferBytes": 0,
        "nativeSendManyCalls": 2640,
        "nativeSendManyItems": 168000,
        "nativeSendManyBytes": 172704000,
        "nativeSendCalls": 0
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 160,
        "avgMs": 0.6418537500000013,
        "minMs": 0.01499999999987267,
        "maxMs": 4.075600000000122
      },
      "heap": {
        "start": {
          "rss": 438317056,
          "heapTotal": 198643712,
          "heapUsed": 67703912,
          "external": 41575097,
          "arrayBuffers": 32786763
        },
        "end": {
          "rss": 434860032,
          "heapTotal": 193400832,
          "heapUsed": 55812720,
          "external": 18910713,
          "arrayBuffers": 10122379
        },
        "peakHeapUsed": 70947976,
        "peakRss": 621334528
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "ts",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable"
  },
  {
    "id": "native-server(lws)+ts",
    "serverMode": "native-lws",
    "clientMode": "ts",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "preferredServerBackend": "lws",
    "durationMs": 1430.7066999999997,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "length-prefixed",
    "msgsPerSec": 111832.84456555633,
    "mbPerSec": 109.2117622710511,
    "benchConfig": {
      "macroBatchTargetBytes": 131072,
      "flowFastPath": false,
      "payload": {
        "count": 1,
        "minBytes": 1024,
        "maxBytes": 1024,
        "avgBytes": 1024,
        "types": [
          "buffer"
        ],
        "framing": "length-prefixed",
        "frameHeaderBytes": 4
      },
      "effectiveRateBytesPerSec": 16777216,
      "flushCapBytes": 180224,
      "flushCapBuffers": 110,
      "flushIntervalMs": 1,
      "adaptiveMode": "aggressive"
    },
    "diagnostics": {
      "gc": {
        "count": 14,
        "durationMs": 50.57069999957457,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 6
        }
      },
      "eventLoop": {
        "utilization": 0.9186889541574389,
        "activeMs": 1.523972500000019,
        "idleMs": 0.1348833
      },
      "eventLoopDelay": {
        "minMs": 19.431424,
        "maxMs": 750.256127,
        "meanMs": 44.78332342857143,
        "stdMs": 121.05460735860409,
        "p50Ms": 22.200319,
        "p99Ms": 750.256127
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 17680,
        "avgBuffersPerFlush": 12.531221719457013,
        "avgBytesPerFlush": 12882.09592760181,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 17648,
        "batchWritevBuffers": 221520,
        "batchWritevBytes": 227722560,
        "writeBufferCalls": 32,
        "writeBufferBytes": 32896,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 15,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 371,
        "totalBytes": 4761696,
        "backpressureEvents": 740,
        "availableTokens": 524288,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772239376175,
            "size": 15
          },
          {
            "timestamp": 1772239376175,
            "size": 10
          },
          {
            "timestamp": 1772239376176,
            "size": 11
          },
          {
            "timestamp": 1772239376177,
            "size": 15
          },
          {
            "timestamp": 1772239376177,
            "size": 12
          },
          {
            "timestamp": 1772239376177,
            "size": 11
          },
          {
            "timestamp": 1772239376178,
            "size": 15
          },
          {
            "timestamp": 1772239376178,
            "size": 10
          },
          {
            "timestamp": 1772239376179,
            "size": 11
          },
          {
            "timestamp": 1772239376179,
            "size": 15
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 15,
          "flushIntervalAvgMs": 0.33791291628751113,
          "bytesPerFlushAvg": 10925.8780476731,
          "eluIdleRatioAvg": 0.9236156267026734,
          "gcPauseMaxMs": 5.568819647687576e-17
        },
        "negentropic": {
          "histogram": {
            "buffer": 512
          },
          "entropy": 0,
          "negentropy": 0,
          "neganticIndex": 0,
          "entropyVelocity": 0,
          "coherence": "Low",
          "velocity": "Slow",
          "sampleCount": 512
        }
      },
      "clientBatch": {
        "totalFrames": 10500,
        "totalFlushes": 1105,
        "totalBytes": 14234716,
        "pendingFrames": 0,
        "pendingBytes": 0,
        "maxPendingFrames": 48,
        "maxPendingBytes": 49344,
        "maxInBufferBytes": 0,
        "ringSlots": 128,
        "ringInUse": 0,
        "ringMaxInUse": 50,
        "ringResizeCount": 0,
        "ringResizeBytes": 0,
        "overflowAllocations": 0,
        "overflowAllocatedBytes": 0,
        "copyAllocations": 0,
        "copyAllocatedBytes": 0,
        "lastFlushTimestamp": 1772239376179,
        "backpressureEvents": 740,
        "lastBackpressureBytes": 4112,
        "lastBackpressureTimestamp": 1772239376179
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 9999,
        "totalEnqueued": 10500,
        "totalDequeued": 10500,
        "bytes": 0,
        "maxBytes": 10238976,
        "bytesEnqueued": 10752000,
        "bytesDequeued": 10752000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 160,
        "avgMs": 1.3893281249999974,
        "minMs": 1.0829000000003361,
        "maxMs": 9.174300000000585
      },
      "heap": {
        "start": {
          "rss": 310870016,
          "heapTotal": 193662976,
          "heapUsed": 81277128,
          "external": 29502969,
          "arrayBuffers": 20714635
        },
        "end": {
          "rss": 351563776,
          "heapTotal": 192352256,
          "heapUsed": 69187056,
          "external": 45156713,
          "arrayBuffers": 36368379
        },
        "peakHeapUsed": 121995208,
        "peakRss": 322236416
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "preferredServerBackend": "lws",
    "durationMs": 1006.5246999999999,
    "messagesReceived": 160839,
    "bytesReceived": 164699136,
    "framing": "length-prefixed",
    "msgsPerSec": 159796.37658171728,
    "mbPerSec": 156.05114900558328,
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 11.466999999713153,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.9652028665665716,
        "activeMs": 1.648480400000187,
        "idleMs": 0.05943039999999997
      },
      "eventLoopDelay": {
        "minMs": 19.74272,
        "maxMs": 197.918719,
        "meanMs": 27.874645333333333,
        "stdMs": 27.55406184789559,
        "p50Ms": 21.692415,
        "p99Ms": 197.918719
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 0,
        "avgBuffersPerFlush": 0,
        "avgBytesPerFlush": 0,
        "maxBuffers": 0,
        "maxBytes": 0
      },
      "transportCalls": {
        "batchWritevCalls": 0,
        "batchWritevBuffers": 0,
        "batchWritevBytes": 0,
        "writeBufferCalls": 0,
        "writeBufferBytes": 0,
        "nativeSendManyCalls": 2640,
        "nativeSendManyItems": 168000,
        "nativeSendManyBytes": 172704000,
        "nativeSendCalls": 0
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 160,
        "avgMs": 1.1355687500000045,
        "minMs": 0.018200000000433647,
        "maxMs": 16.825299999999515
      },
      "heap": {
        "start": {
          "rss": 457498624,
          "heapTotal": 192352256,
          "heapUsed": 59425376,
          "external": 19426665,
          "arrayBuffers": 10638331
        },
        "end": {
          "rss": 486289408,
          "heapTotal": 192090112,
          "heapUsed": 62919064,
          "external": 29834601,
          "arrayBuffers": 21046267
        },
        "peakHeapUsed": 62714728,
        "peakRss": 642105344
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "native-lws",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable"
  },
  {
    "id": "net-server+net",
    "serverMode": "net",
    "clientMode": "net",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 4206.334000000001,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "length-prefixed",
    "msgsPerSec": 38037.87335955727,
    "mbPerSec": 37.14636070269265
  },
  {
    "id": "ws-server+ws",
    "serverMode": "ws",
    "clientMode": "ws",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 3235.353299999999,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "none",
    "msgsPerSec": 49453.64081258144,
    "mbPerSec": 48.294571106036564
  },
  {
    "id": "uwebsockets-server+ws",
    "serverMode": "uwebsockets",
    "clientMode": "ws",
    "concurrency": {
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 1802.3408,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "none",
    "msgsPerSec": 88773.44395688098,
    "mbPerSec": 86.69281636414158
  }
]
```
