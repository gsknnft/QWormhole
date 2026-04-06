# QWormhole Bench Report

Generated: 2026-02-28T00:06:14.875Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "320000",
  "QWORMHOLE_BENCH_CLIENTS": "64"
}
```

## Summary

| Scenario | Server | Client | Clients | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 64 | 2712.69 | 320000 | 327680000 | 117964 | 115.20 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 64 | 3604.96 | 320044 | 327725056 | 88779 | 86.70 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 64 | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 64 | 3065.56 | 320000 | 327680000 | 104386 | 101.94 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 64 | - | 2932 | 3002368 | - | - | length-prefixed | skipped |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 64 | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 38 | 105.54 | 96.09 | 0 | 0 | 0 | 62336 | 5.93 | 5.96 | 30 | 30.12 | 62208 | 0 | - | off | off | off |
| ts-server+native-lws | 28 | 368.83 | 99.31 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 5312 | - | off | off | off |
| native-server(lws)+ts | 25 | 78.66 | 97.07 | 0 | 0 | 0 | 35392 | 12.54 | 12.59 | 48 | 48.19 | 35264 | 0 | - | off | off | off |

## Transport Coherence

- Transport coherence sampling: disabled in this raw lane. Run `bench:core:structure` for tSNI / tSPI / tMeta.
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
      "clients": 64,
      "messagesPerClient": 5000,
      "totalMessages": 320000
    },
    "durationMs": 2712.6892,
    "messagesReceived": 320000,
    "bytesReceived": 327680000,
    "framing": "length-prefixed",
    "msgsPerSec": 117964.12209699512,
    "mbPerSec": 115.1993379853468,
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
        "count": 38,
        "durationMs": 105.53740000049584,
        "byKind": {
          "minor": 18,
          "incremental": 10,
          "major": 10
        }
      },
      "eventLoop": {
        "utilization": 0.9609495392389396,
        "activeMs": 2.968548499999879,
        "idleMs": 0.120634
      },
      "eventLoopDelay": {
        "minMs": 21.05344,
        "maxMs": 637.534207,
        "meanMs": 39.93163093333333,
        "stdMs": 70.60184880315971,
        "p50Ms": 29.786111,
        "p99Ms": 118.554623
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 62336,
        "avgBuffersPerFlush": 5.933377181724846,
        "avgBytesPerFlush": 6099.511742813142,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "transportCalls": {
        "batchWritevCalls": 62208,
        "batchWritevBuffers": 369735,
        "batchWritevBytes": 380087580,
        "writeBufferCalls": 128,
        "writeBufferBytes": 131584,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 323,
        "totalBytes": 1549196,
        "backpressureEvents": 490,
        "availableTokens": 524288,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772237144160,
            "size": 5
          },
          {
            "timestamp": 1772237144163,
            "size": 7
          },
          {
            "timestamp": 1772237144163,
            "size": 5
          },
          {
            "timestamp": 1772237144163,
            "size": 4
          },
          {
            "timestamp": 1772237144178,
            "size": 6
          },
          {
            "timestamp": 1772237144178,
            "size": 5
          },
          {
            "timestamp": 1772237144179,
            "size": 7
          },
          {
            "timestamp": 1772237144179,
            "size": 5
          },
          {
            "timestamp": 1772237144179,
            "size": 4
          },
          {
            "timestamp": 1772237144180,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.6232932450152644,
          "bytesPerFlushAvg": 5011.003801666622,
          "eluIdleRatioAvg": 0.9345133488618712,
          "gcPauseMaxMs": 0.38482477171316437
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
        "totalFrames": 5250,
        "totalFlushes": 974,
        "totalBytes": 5941840,
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
        "lastFlushTimestamp": 1772237144180,
        "backpressureEvents": 490,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772237144179
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 4999,
        "totalEnqueued": 5250,
        "totalDequeued": 5250,
        "bytes": 0,
        "maxBytes": 5118976,
        "bytesEnqueued": 5376000,
        "bytesDequeued": 5376000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 320,
        "avgMs": 1.4512718750000004,
        "minMs": 0.7400000000000091,
        "maxMs": 5.689999999999827
      },
      "heap": {
        "start": {
          "rss": 244948992,
          "heapTotal": 132681728,
          "heapUsed": 68896192,
          "external": 48068885,
          "arrayBuffers": 39273851
        },
        "end": {
          "rss": 397459456,
          "heapTotal": 214208512,
          "heapUsed": 136660384,
          "external": 108177889,
          "arrayBuffers": 99389555
        },
        "peakHeapUsed": 142533232,
        "peakRss": 333041664
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "concurrency": {
      "clients": 64,
      "messagesPerClient": 5000,
      "totalMessages": 320000
    },
    "durationMs": 3604.9626000000007,
    "messagesReceived": 320044,
    "bytesReceived": 327725056,
    "framing": "length-prefixed",
    "msgsPerSec": 88778.72963231294,
    "mbPerSec": 86.6979781565556,
    "diagnostics": {
      "gc": {
        "count": 28,
        "durationMs": 368.8261999997776,
        "byKind": {
          "minor": 0,
          "incremental": 14,
          "major": 14
        }
      },
      "eventLoop": {
        "utilization": 0.993103030374836,
        "activeMs": 10.326718700000004,
        "idleMs": 0.0717177
      },
      "eventLoopDelay": {
        "minMs": 19.103744,
        "maxMs": 885.522431,
        "meanMs": 390.0658609230769,
        "stdMs": 277.76774074536513,
        "p50Ms": 353.894399,
        "p99Ms": 885.522431
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
        "nativeSendManyCalls": 5312,
        "nativeSendManyItems": 336000,
        "nativeSendManyBytes": 345408000,
        "nativeSendCalls": 0
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 320,
        "avgMs": 0.6462665624999999,
        "minMs": 0.012000000000625732,
        "maxMs": 8.8033000000014
      },
      "heap": {
        "start": {
          "rss": 868491264,
          "heapTotal": 195497984,
          "heapUsed": 55675184,
          "external": 22311957,
          "arrayBuffers": 13523623
        },
        "end": {
          "rss": 895078400,
          "heapTotal": 196284416,
          "heapUsed": 58205872,
          "external": 29895141,
          "arrayBuffers": 21106807
        },
        "peakHeapUsed": 61890664,
        "peakRss": 1218027520
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "ts",
    "concurrency": {
      "clients": 64,
      "messagesPerClient": 5000,
      "totalMessages": 320000
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
      "clients": 64,
      "messagesPerClient": 5000,
      "totalMessages": 320000
    },
    "preferredServerBackend": "lws",
    "durationMs": 3065.5556000000015,
    "messagesReceived": 320000,
    "bytesReceived": 327680000,
    "framing": "length-prefixed",
    "msgsPerSec": 104385.64546015732,
    "mbPerSec": 101.93910689468488,
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
        "count": 25,
        "durationMs": 78.66359999985434,
        "byKind": {
          "minor": 11,
          "incremental": 7,
          "major": 7
        }
      },
      "eventLoop": {
        "utilization": 0.9706925798307152,
        "activeMs": 3.328665700000014,
        "idleMs": 0.1005
      },
      "eventLoopDelay": {
        "minMs": 19.2512,
        "maxMs": 1656.750079,
        "meanMs": 45.49698343661972,
        "stdMs": 192.53256636452537,
        "p50Ms": 22.134783,
        "p99Ms": 31.965183
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 35392,
        "avgBuffersPerFlush": 12.544303797468354,
        "avgBytesPerFlush": 12895.54430379747,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 35264,
        "batchWritevBuffers": 443840,
        "batchWritevBytes": 456267520,
        "writeBufferCalls": 128,
        "writeBufferBytes": 131584,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 10,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 187,
        "totalBytes": 2387016,
        "backpressureEvents": 370,
        "availableTokens": 524288,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772237156598,
            "size": 12
          },
          {
            "timestamp": 1772237156598,
            "size": 11
          },
          {
            "timestamp": 1772237156601,
            "size": 15
          },
          {
            "timestamp": 1772237156601,
            "size": 10
          },
          {
            "timestamp": 1772237156607,
            "size": 11
          },
          {
            "timestamp": 1772237156609,
            "size": 15
          },
          {
            "timestamp": 1772237156610,
            "size": 12
          },
          {
            "timestamp": 1772237156610,
            "size": 11
          },
          {
            "timestamp": 1772237156612,
            "size": 15
          },
          {
            "timestamp": 1772237156613,
            "size": 10
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 10,
          "flushIntervalAvgMs": 1.428250348980756,
          "bytesPerFlushAvg": 9421.987559591375,
          "eluIdleRatioAvg": 0.9728241583847496,
          "gcPauseMaxMs": 6.282742415257519e-7
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
        "totalFrames": 5250,
        "totalFlushes": 553,
        "totalBytes": 7131236,
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
        "lastFlushTimestamp": 1772237156619,
        "backpressureEvents": 370,
        "lastBackpressureBytes": 14392,
        "lastBackpressureTimestamp": 1772237156610
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 4999,
        "totalEnqueued": 5250,
        "totalDequeued": 5250,
        "bytes": 0,
        "maxBytes": 5118976,
        "bytesEnqueued": 5376000,
        "bytesDequeued": 5376000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 320,
        "avgMs": 1.5274503125000023,
        "minMs": 0.9966999999996915,
        "maxMs": 6.069800000001123
      },
      "heap": {
        "start": {
          "rss": 347009024,
          "heapTotal": 201527296,
          "heapUsed": 88418184,
          "external": 34811241,
          "arrayBuffers": 26022907
        },
        "end": {
          "rss": 391327744,
          "heapTotal": 197595136,
          "heapUsed": 76743000,
          "external": 64713065,
          "arrayBuffers": 55924731
        },
        "peakHeapUsed": 147027912,
        "peakRss": 348614656
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 0,
    "messagesReceived": 2932,
    "bytesReceived": 3002368,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "warmup timed out after 5000ms (2932/16000 messages)"
  },
  {
    "id": "native-server(lws)+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "native-lws",
    "concurrency": {
      "clients": 64,
      "messagesPerClient": 5000,
      "totalMessages": 320000
    },
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable"
  }
]
```
