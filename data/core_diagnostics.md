# QWormhole Bench Report

Generated: 2026-02-27T19:14:35.624Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 874.21 | 100000 | 102400000 | 114389 | 111.71 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 870.76 | 100009 | 102409216 | 114853 | 112.16 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 993.56 | 100000 | 102400000 | 100648 | 98.29 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 922.86 | 100000 | 102400000 | 108358 | 105.82 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 16 | 40.42 | 88.31 | 0 | 0 | 0 | 19678 | 5.84 | 5.86 | 30 | 30.12 | 0 | 0 | - | off | off | off |
| ts-server+native-lws | 16 | 23.93 | 79.97 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | off | off | off |
| native-server(lws)+ts | 7 | 23.91 | 89.70 | 0 | 0 | 0 | 12902 | 13.38 | 13.44 | 48 | 48.19 | 0 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 1 | 2.21 | 79.05 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | off | off | off |

## Transport Coherence

- Transport coherence sampling: disabled in this raw lane. Run `bench:core:structure` for tSNI / tSPI / tMeta.
- Best transport persistence: unavailable
- Fastest measured path: unavailable
- Throughput leader and transport-stability leader are aligned in this run.

_Transport coherence metrics are intentionally off in the raw lane._

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 874.2065,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 114389.44917476592,
    "mbPerSec": 111.70844645973234,
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
        "count": 16,
        "durationMs": 40.42259999969974,
        "byKind": {
          "minor": 12,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8830566909486355,
        "activeMs": 0.9913341000000667,
        "idleMs": 0.1312825
      },
      "eventLoopDelay": {
        "minMs": 19.070976,
        "maxMs": 184.025087,
        "meanMs": 25.35580038095238,
        "stdMs": 25.04654349207279,
        "p50Ms": 20.185087,
        "p99Ms": 184.025087
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 19678,
        "avgBuffersPerFlush": 5.838093302164854,
        "avgBytesPerFlush": 6001.55991462547,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6558,
        "totalBytes": 30389736,
        "backpressureEvents": 9842,
        "availableTokens": 134217.728,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772219672118,
            "size": 7
          },
          {
            "timestamp": 1772219672118,
            "size": 5
          },
          {
            "timestamp": 1772219672118,
            "size": 4
          },
          {
            "timestamp": 1772219672118,
            "size": 6
          },
          {
            "timestamp": 1772219672118,
            "size": 5
          },
          {
            "timestamp": 1772219672118,
            "size": 7
          },
          {
            "timestamp": 1772219672118,
            "size": 6
          },
          {
            "timestamp": 1772219672118,
            "size": 5
          },
          {
            "timestamp": 1772219672118,
            "size": 4
          },
          {
            "timestamp": 1772219672118,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.013526817874477494,
          "bytesPerFlushAvg": 4554.133633066638,
          "eluIdleRatioAvg": 0.8636247574581082,
          "gcPauseMaxMs": 8.395356558421606e-16
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
        "totalFrames": 105000,
        "totalFlushes": 19678,
        "totalBytes": 118098696,
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
        "lastFlushTimestamp": 1772219672118,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772219672118
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 99999,
        "totalEnqueued": 105000,
        "totalDequeued": 105000,
        "bytes": 0,
        "maxBytes": 102398976,
        "bytesEnqueued": 107520000,
        "bytesDequeued": 107520000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 1.8094119999999998,
        "minMs": 1.2635999999999967,
        "maxMs": 11.804799999999886
      },
      "heap": {
        "start": {
          "rss": 169877504,
          "heapTotal": 124018688,
          "heapUsed": 57983536,
          "external": 11095757,
          "arrayBuffers": 2300723
        },
        "end": {
          "rss": 293150720,
          "heapTotal": 209186816,
          "heapUsed": 108290256,
          "external": 43164729,
          "arrayBuffers": 34369655
        },
        "peakHeapUsed": 92339296,
        "peakRss": 203657216
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 870.7601,
    "messagesReceived": 100009,
    "bytesReceived": 102409216,
    "framing": "length-prefixed",
    "msgsPerSec": 114852.5294165408,
    "mbPerSec": 112.16067325834062,
    "diagnostics": {
      "gc": {
        "count": 16,
        "durationMs": 23.928000000305474,
        "byKind": {
          "minor": 0,
          "incremental": 8,
          "major": 8
        }
      },
      "eventLoop": {
        "utilization": 0.7997193534218997,
        "activeMs": 0.8503088000000782,
        "idleMs": 0.21295020000000003
      },
      "eventLoopDelay": {
        "minMs": 19.316736,
        "maxMs": 68.681727,
        "meanMs": 21.577906086956524,
        "stdMs": 7.186482051269978,
        "p50Ms": 20.021247,
        "p99Ms": 68.681727
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
      "clientQueue": {
        "length": 0,
        "maxLength": 99999,
        "totalEnqueued": 105000,
        "totalDequeued": 105000,
        "bytes": 0,
        "maxBytes": 102398976,
        "bytesEnqueued": 107520000,
        "bytesDequeued": 107520000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.6063749999999982,
        "minMs": 0.4277999999999338,
        "maxMs": 1.014599999999973
      },
      "heap": {
        "start": {
          "rss": 319541248,
          "heapTotal": 209350656,
          "heapUsed": 114016048,
          "external": 54159777,
          "arrayBuffers": 45364703
        },
        "end": {
          "rss": 347881472,
          "heapTotal": 191029248,
          "heapUsed": 72866984,
          "external": 74908973,
          "arrayBuffers": 66120639
        },
        "peakHeapUsed": 115929792,
        "peakRss": 436178944
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "ts",
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
    "preferredServerBackend": "lws",
    "durationMs": 993.5646999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 100647.6981317875,
    "mbPerSec": 98.28876770682373,
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
      "flushCapBytes": 196608,
      "flushCapBuffers": 115,
      "flushIntervalMs": 1,
      "adaptiveMode": "aggressive"
    },
    "diagnostics": {
      "gc": {
        "count": 7,
        "durationMs": 23.908500000135973,
        "byKind": {
          "minor": 5,
          "incremental": 1,
          "major": 1
        }
      },
      "eventLoop": {
        "utilization": 0.8970312344228161,
        "activeMs": 1.0689443999999875,
        "idleMs": 0.12270240000000002
      },
      "eventLoopDelay": {
        "minMs": 19.562496,
        "maxMs": 170.131455,
        "meanMs": 23.88717480851064,
        "stdMs": 21.693420877008066,
        "p50Ms": 20.021247,
        "p99Ms": 170.131455
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 12902,
        "avgBuffersPerFlush": 13.384203999379942,
        "avgBytesPerFlush": 13758.961711362579,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "clientFlow": {
        "currentSliceSize": 16,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6436,
        "totalBytes": 79464400,
        "backpressureEvents": 12806,
        "availableTokens": 100663.296,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772219674386,
            "size": 16
          },
          {
            "timestamp": 1772219674386,
            "size": 11
          },
          {
            "timestamp": 1772219674386,
            "size": 12
          },
          {
            "timestamp": 1772219674386,
            "size": 16
          },
          {
            "timestamp": 1772219674386,
            "size": 13
          },
          {
            "timestamp": 1772219674386,
            "size": 12
          },
          {
            "timestamp": 1772219674386,
            "size": 16
          },
          {
            "timestamp": 1772219674386,
            "size": 11
          },
          {
            "timestamp": 1772219674386,
            "size": 12
          },
          {
            "timestamp": 1772219674386,
            "size": 16
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 16,
          "flushIntervalAvgMs": 0.030276300748859335,
          "bytesPerFlushAvg": 12535.418930131247,
          "eluIdleRatioAvg": 0.8683350198626689,
          "gcPauseMaxMs": 5.07740804197805e-34
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
        "totalFrames": 105000,
        "totalFlushes": 12902,
        "totalBytes": 177518124,
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
        "lastFlushTimestamp": 1772219674386,
        "backpressureEvents": 12806,
        "lastBackpressureBytes": 9252,
        "lastBackpressureTimestamp": 1772219674386
      },
      "clientQueue": {
        "length": 0,
        "maxLength": 99999,
        "totalEnqueued": 105000,
        "totalDequeued": 105000,
        "bytes": 0,
        "maxBytes": 102398976,
        "bytesEnqueued": 107520000,
        "bytesDequeued": 107520000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 1.3628920000000015,
        "minMs": 1.1722999999997228,
        "maxMs": 3.8045999999999367
      },
      "heap": {
        "start": {
          "rss": 277671936,
          "heapTotal": 191291392,
          "heapUsed": 68823696,
          "external": 14273897,
          "arrayBuffers": 5485563
        },
        "end": {
          "rss": 306757632,
          "heapTotal": 204529664,
          "heapUsed": 100848728,
          "external": 25137513,
          "arrayBuffers": 16349179
        },
        "peakHeapUsed": 120711984,
        "peakRss": 291323904
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 922.8647000000001,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 108358.24579702744,
    "mbPerSec": 105.81859941115961,
    "diagnostics": {
      "gc": {
        "count": 1,
        "durationMs": 2.205599999986589,
        "byKind": {
          "minor": 1,
          "incremental": 0,
          "major": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7905069169912052,
        "activeMs": 0.8713186999999935,
        "idleMs": 0.23090909999999998
      },
      "eventLoopDelay": {
        "minMs": 19.16928,
        "maxMs": 91.553791,
        "meanMs": 22.320236936170215,
        "stdMs": 10.555036438598256,
        "p50Ms": 20.037631,
        "p99Ms": 91.553791
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
      "clientQueue": {
        "length": 0,
        "maxLength": 99999,
        "totalEnqueued": 105000,
        "totalDequeued": 105000,
        "bytes": 0,
        "maxBytes": 102398976,
        "bytesEnqueued": 107520000,
        "bytesDequeued": 107520000
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.6889009999999962,
        "minMs": 0.5120000000006257,
        "maxMs": 1.4477999999999156
      },
      "heap": {
        "start": {
          "rss": 322162688,
          "heapTotal": 204529664,
          "heapUsed": 103790008,
          "external": 30257513,
          "arrayBuffers": 21469179
        },
        "end": {
          "rss": 389591040,
          "heapTotal": 207937536,
          "heapUsed": 102329320,
          "external": 75900265,
          "arrayBuffers": 67111931
        },
        "peakHeapUsed": 105698768,
        "peakRss": 438005760
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "native-lws",
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable"
  }
]
```
