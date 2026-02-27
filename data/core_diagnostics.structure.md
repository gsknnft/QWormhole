# QWormhole Bench Report

Generated: 2026-02-27T19:41:05.548Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 988.42 | 100000 | 102400000 | 101172 | 98.80 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 960.20 | 100002 | 102402048 | 104147 | 101.71 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1323.65 | 100000 | 102400000 | 75549 | 73.78 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 874.60 | 100000 | 102400000 | 114338 | 111.66 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 32 | 91.24 | 89.27 | 0 | 0 | 0 | 19679 | 5.73 | 5.75 | 30 | 30.12 | 0 | 0 | - | 0.496 | 0.421 | 0.811 |
| ts-server+native-lws | 18 | 20.14 | 80.09 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |
| native-server(lws)+ts | 15 | 42.70 | 90.00 | 0 | 0 | 0 | 10720 | 13.47 | 13.53 | 48 | 48.19 | 0 | 0 | - | 0.514 | 0.432 | 0.806 |
| native-server(lws)+native-lws | 4 | 10.54 | 79.83 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `native-server(lws)+ts` (tSPI 0.432, tMeta 0.806)
- Fastest measured path: `ts-server+ts` (101172 msg/s)
- Transport winner differs from throughput winner. Prefer tSPI when selecting a default path.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | native-server(lws)+ts | 75549 | 0.514 | 0.432 | 0.806 | unstable |
| 2 | ts-server+ts | 101172 | 0.496 | 0.421 | 0.811 | unstable |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 988.4188999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 101171.67933555298,
    "mbPerSec": 98.80046810112596,
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
        "count": 32,
        "durationMs": 91.23600000189617,
        "byKind": {
          "incremental": 12,
          "major": 12,
          "minor": 8
        }
      },
      "eventLoop": {
        "utilization": 0.8927221375215619,
        "activeMs": 1.0838352000003761,
        "idleMs": 0.1302438
      },
      "eventLoopDelay": {
        "minMs": 19.283968,
        "maxMs": 215.875583,
        "meanMs": 25.538738086956524,
        "stdMs": 28.514082860838066,
        "p50Ms": 20.103167,
        "p99Ms": 215.875583
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 19679,
        "avgBuffersPerFlush": 5.732354286295036,
        "avgBytesPerFlush": 5892.860206311297,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6555,
        "totalBytes": 30374316,
        "backpressureEvents": 9842,
        "availableTokens": 184549.376,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772221261652,
            "size": 4
          },
          {
            "timestamp": 1772221261652,
            "size": 6
          },
          {
            "timestamp": 1772221261652,
            "size": 5
          },
          {
            "timestamp": 1772221261652,
            "size": 7
          },
          {
            "timestamp": 1772221261652,
            "size": 5
          },
          {
            "timestamp": 1772221261652,
            "size": 4
          },
          {
            "timestamp": 1772221261652,
            "size": 6
          },
          {
            "timestamp": 1772221261652,
            "size": 5
          },
          {
            "timestamp": 1772221261652,
            "size": 7
          },
          {
            "timestamp": 1772221261653,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772221261652,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221261652,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221261652,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221261652,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221261652,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221261652,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221261652,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221261652,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221261652,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221261652,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221261652,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221261652,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221261652,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221261652,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221261653,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221261653,
            "bytes": 6168,
            "frames": 6
          }
        ],
        "backpressureHistory": [
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652,
          1772221261652
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.019902687813903107,
          "bytesPerFlushAvg": 5611.884368121796,
          "eluIdleRatioAvg": 0.8805752728427085,
          "gcPauseMaxMs": 0.0003895181870206381
        },
        "transportCoherence": {
          "transportSNI": 0.4960735919436766,
          "transportSPI": 0.4210095129077694,
          "transportMetastability": 0.8105457191915038,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.43830933850734494,
          "batchingRegularity": 0.9076802123373588,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9223705190636242,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.2030739299866456,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.496",
            "transport_spi:0.421",
            "transport_meta:0.811"
          ]
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
        "totalFlushes": 19679,
        "totalBytes": 115965596,
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
        "lastFlushTimestamp": 1772221261653,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772221261652
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
        "avgMs": 1.9709819999999991,
        "minMs": 1.3938000000000557,
        "maxMs": 9.117199999999912
      },
      "heap": {
        "start": {
          "rss": 183025664,
          "heapTotal": 122707968,
          "heapUsed": 63402256,
          "external": 15262269,
          "arrayBuffers": 6467235
        },
        "end": {
          "rss": 209801216,
          "heapTotal": 125198336,
          "heapUsed": 61561272,
          "external": 18480553,
          "arrayBuffers": 9692219
        },
        "peakHeapUsed": 91035560,
        "peakRss": 201129984
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 960.2048,
    "messagesReceived": 100002,
    "bytesReceived": 102402048,
    "framing": "length-prefixed",
    "msgsPerSec": 104146.53207315772,
    "mbPerSec": 101.70559772769309,
    "diagnostics": {
      "gc": {
        "count": 18,
        "durationMs": 20.135800000280142,
        "byKind": {
          "incremental": 9,
          "major": 9,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8008617980384072,
        "activeMs": 0.8857822999996338,
        "idleMs": 0.22025409999999998
      },
      "eventLoopDelay": {
        "minMs": 19.709952,
        "maxMs": 81.854463,
        "meanMs": 21.737221224489797,
        "stdMs": 8.86755736273758,
        "p50Ms": 20.021247,
        "p99Ms": 81.854463
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
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.8054100000000016,
        "minMs": 0.5527999999999338,
        "maxMs": 2.0604999999995925
      },
      "heap": {
        "start": {
          "rss": 235327488,
          "heapTotal": 125362176,
          "heapUsed": 64984424,
          "external": 29389729,
          "arrayBuffers": 20601395
        },
        "end": {
          "rss": 236134400,
          "heapTotal": 123133952,
          "heapUsed": 55659896,
          "external": 22014957,
          "arrayBuffers": 13226623
        },
        "peakHeapUsed": 66904768,
        "peakRss": 352890880
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
    "durationMs": 1323.6458000000002,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 75548.91195212495,
    "mbPerSec": 73.77823432824702,
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
        "count": 15,
        "durationMs": 42.69580000033602,
        "byKind": {
          "incremental": 6,
          "major": 6,
          "minor": 3
        }
      },
      "eventLoop": {
        "utilization": 0.8999704653113408,
        "activeMs": 1.391639899999762,
        "idleMs": 0.15467740000000002
      },
      "eventLoopDelay": {
        "minMs": 19.513344,
        "maxMs": 600.834047,
        "meanMs": 35.92731473170732,
        "stdMs": 89.34604689137294,
        "p50Ms": 20.201471,
        "p99Ms": 600.834047
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 10720,
        "avgBuffersPerFlush": 13.47294776119403,
        "avgBytesPerFlush": 13850.190298507463,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "clientFlow": {
        "currentSliceSize": 17,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 5183,
        "totalBytes": 64664284,
        "backpressureEvents": 9650,
        "availableTokens": 331432.32,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772221264296,
            "size": 12
          },
          {
            "timestamp": 1772221264296,
            "size": 16
          },
          {
            "timestamp": 1772221264296,
            "size": 11
          },
          {
            "timestamp": 1772221264296,
            "size": 12
          },
          {
            "timestamp": 1772221264296,
            "size": 16
          },
          {
            "timestamp": 1772221264296,
            "size": 13
          },
          {
            "timestamp": 1772221264296,
            "size": 12
          },
          {
            "timestamp": 1772221264296,
            "size": 16
          },
          {
            "timestamp": 1772221264297,
            "size": 13
          },
          {
            "timestamp": 1772221264297,
            "size": 17
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264296,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221264297,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221264297,
            "bytes": 4112,
            "frames": 4
          }
        ],
        "backpressureHistory": [
          1772221264295,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264296,
          1772221264297
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 17,
          "flushIntervalAvgMs": 0.02733373305374122,
          "bytesPerFlushAvg": 10001.23238158541,
          "eluIdleRatioAvg": 0.9539800892254524,
          "gcPauseMaxMs": 2.5992276177449965e-16
        },
        "transportCoherence": {
          "transportSNI": 0.5136653879497417,
          "transportSPI": 0.431540763284809,
          "transportMetastability": 0.805806656521836,
          "sliceEntropyInverse": 0.11294150063022779,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9110849325885066,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.970087057996544,
          "payloadRegularity": 0,
          "sliceEntropy": 0.8870584993697722,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.514",
            "transport_spi:0.432",
            "transport_meta:0.806"
          ]
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
        "totalFlushes": 10720,
        "totalBytes": 148474040,
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
        "lastFlushTimestamp": 1772221264297,
        "backpressureEvents": 9650,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772221264297
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
        "avgMs": 1.6414969999999993,
        "minMs": 1.3255000000003747,
        "maxMs": 7.674199999999928
      },
      "heap": {
        "start": {
          "rss": 221814784,
          "heapTotal": 123658240,
          "heapUsed": 68581224,
          "external": 14272901,
          "arrayBuffers": 5484567
        },
        "end": {
          "rss": 294383616,
          "heapTotal": 192995328,
          "heapUsed": 68332600,
          "external": 16858473,
          "arrayBuffers": 8070139
        },
        "peakHeapUsed": 121230288,
        "peakRss": 249954304
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 874.5964000000004,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 114338.45371419315,
    "mbPerSec": 111.65864620526675,
    "diagnostics": {
      "gc": {
        "count": 4,
        "durationMs": 10.537999999709427,
        "byKind": {
          "incremental": 2,
          "major": 2,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7982938121069152,
        "activeMs": 0.8631384999996481,
        "idleMs": 0.2180906
      },
      "eventLoopDelay": {
        "minMs": 19.08736,
        "maxMs": 88.997887,
        "meanMs": 23.032180363636364,
        "stdMs": 10.714272590381311,
        "p50Ms": 20.021247,
        "p99Ms": 88.997887
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
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.8510249999999996,
        "minMs": 0.5672999999997046,
        "maxMs": 1.440099999999802
      },
      "heap": {
        "start": {
          "rss": 309956608,
          "heapTotal": 192995328,
          "heapUsed": 71441600,
          "external": 21978473,
          "arrayBuffers": 13190139
        },
        "end": {
          "rss": 359366656,
          "heapTotal": 191029248,
          "heapUsed": 73364992,
          "external": 56905065,
          "arrayBuffers": 48116731
        },
        "peakHeapUsed": 73350992,
        "peakRss": 425947136
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
