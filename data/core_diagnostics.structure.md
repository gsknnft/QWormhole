# QWormhole Bench Report

Generated: 2026-02-27T18:32:04.051Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 3204.36 | 100000 | 102400000 | 31208 | 30.48 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 1083.11 | 100001 | 102401024 | 92327 | 90.16 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 2344.66 | 100000 | 102400000 | 42650 | 41.65 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 934.48 | 100095 | 102497280 | 107113 | 104.60 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 38 | 120.00 | 97.67 | 0 | 0 | 0 | 19680 | 5.84 | 5.86 | 30 | 30.12 | 0 | 0 | - | 0.512 | 0.433 | 0.805 |
| ts-server+native-lws | 14 | 19.03 | 79.96 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |
| native-server(lws)+ts | 7 | 24.15 | 94.46 | 0 | 0 | 0 | 13120 | 9.82 | 9.86 | 32 | 32.13 | 0 | 0 | - | 0.489 | 0.411 | 0.815 |
| native-server(lws)+native-lws | 4 | 5.64 | 85.22 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `ts-server+ts` (tSPI 0.433, tMeta 0.805)
- Fastest measured path: `native-server(lws)+ts` (42650 msg/s)
- Transport winner differs from throughput winner. Prefer tSPI when selecting a default path.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ts-server+ts | 31208 | 0.512 | 0.433 | 0.805 | unstable |
| 2 | native-server(lws)+ts | 42650 | 0.489 | 0.411 | 0.815 | unstable |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 3204.3567000000003,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 31207.511947717925,
    "mbPerSec": 30.476085886443286,
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
        "durationMs": 119.99739992618561,
        "byKind": {
          "minor": 8,
          "incremental": 15,
          "major": 15
        }
      },
      "eventLoop": {
        "utilization": 0.9766943047457872,
        "activeMs": 4.7445056999981405,
        "idleMs": 0.11321250000000001
      },
      "eventLoopDelay": {
        "minMs": 17.432576,
        "maxMs": 677.904383,
        "meanMs": 34.116745552238804,
        "stdMs": 61.018620004603335,
        "p50Ms": 23.101439,
        "p99Ms": 263.454719
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 19680,
        "avgBuffersPerFlush": 5.83755081300813,
        "avgBytesPerFlush": 6001.002235772357,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6556,
        "totalBytes": 30376372,
        "backpressureEvents": 9843,
        "availableTokens": 150994.944,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772217119071,
            "size": 7
          },
          {
            "timestamp": 1772217119071,
            "size": 5
          },
          {
            "timestamp": 1772217119071,
            "size": 4
          },
          {
            "timestamp": 1772217119071,
            "size": 6
          },
          {
            "timestamp": 1772217119071,
            "size": 5
          },
          {
            "timestamp": 1772217119071,
            "size": 7
          },
          {
            "timestamp": 1772217119071,
            "size": 6
          },
          {
            "timestamp": 1772217119071,
            "size": 5
          },
          {
            "timestamp": 1772217119071,
            "size": 4
          },
          {
            "timestamp": 1772217119071,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772217119071,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772217119071,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772217119071,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772217119071,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772217119071,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772217119071,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772217119071,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772217119071,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772217119071,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772217119071,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772217119071,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772217119071,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772217119071,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772217119071,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772217119071,
            "bytes": 3084,
            "frames": 3
          },
          {
            "timestamp": 1772217119071,
            "bytes": 3084,
            "frames": 3
          }
        ],
        "backpressureHistory": [
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071,
          1772217119071
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.020787074456382316,
          "bytesPerFlushAvg": 4554.133633066638,
          "eluIdleRatioAvg": 0.9492103451864722,
          "gcPauseMaxMs": 1.1531549364350347e-11
        },
        "transportCoherence": {
          "transportSNI": 0.5120769384767985,
          "transportSPI": 0.4334435630162927,
          "transportMetastability": 0.8049503966426683,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.4853229338876243,
          "batchingRegularity": 0.8938850735311425,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.966986724371106,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.11759466565886476,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.512",
            "transport_spi:0.433",
            "transport_meta:0.805"
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
        "totalFlushes": 19680,
        "totalBytes": 118099724,
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
        "lastFlushTimestamp": 1772217119071,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772217119071
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
        "avgMs": 2.3861269999999966,
        "minMs": 1.2166999999999462,
        "maxMs": 8.693199999999706
      },
      "heap": {
        "start": {
          "rss": 178860032,
          "heapTotal": 125329408,
          "heapUsed": 57877464,
          "external": 12056813,
          "arrayBuffers": 3261779
        },
        "end": {
          "rss": 230907904,
          "heapTotal": 193355776,
          "heapUsed": 78066216,
          "external": 35105481,
          "arrayBuffers": 26317147
        },
        "peakHeapUsed": 92286136,
        "peakRss": 204742656
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 1083.1128000000008,
    "messagesReceived": 100001,
    "bytesReceived": 102401024,
    "framing": "length-prefixed",
    "msgsPerSec": 92327.41040453028,
    "mbPerSec": 90.1634867231741,
    "diagnostics": {
      "gc": {
        "count": 14,
        "durationMs": 19.03420004248619,
        "byKind": {
          "minor": 0,
          "incremental": 7,
          "major": 7
        }
      },
      "eventLoop": {
        "utilization": 0.799570039085197,
        "activeMs": 0.977684100014495,
        "idleMs": 0.24507819999999997
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 77.987839,
        "meanMs": 21.484488145454545,
        "stdMs": 7.92876999185413,
        "p50Ms": 20.004863,
        "p99Ms": 31.064063
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
        "avgMs": 0.5944899999999871,
        "minMs": 0.3944999999985157,
        "maxMs": 1.016700000000128
      },
      "heap": {
        "start": {
          "rss": 230154240,
          "heapTotal": 191815680,
          "heapUsed": 57547568,
          "external": 20292005,
          "arrayBuffers": 11503671
        },
        "end": {
          "rss": 262008832,
          "heapTotal": 191029248,
          "heapUsed": 68385368,
          "external": 49091741,
          "arrayBuffers": 40303407
        },
        "peakHeapUsed": 59460496,
        "peakRss": 345952256
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
    "durationMs": 2344.661399999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 42650.08158534108,
    "mbPerSec": 41.65047029818465,
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
      "flushCapBuffers": 77,
      "flushIntervalMs": 1,
      "adaptiveMode": "aggressive"
    },
    "diagnostics": {
      "gc": {
        "count": 7,
        "durationMs": 24.153300046920776,
        "byKind": {
          "minor": 5,
          "incremental": 1,
          "major": 1
        }
      },
      "eventLoop": {
        "utilization": 0.9446284600192913,
        "activeMs": 2.396278500010205,
        "idleMs": 0.1404633
      },
      "eventLoopDelay": {
        "minMs": 19.234816,
        "maxMs": 248.905727,
        "meanMs": 26.269674442105263,
        "stdMs": 23.7689039779604,
        "p50Ms": 20.496383,
        "p99Ms": 44.433407
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 13120,
        "avgBuffersPerFlush": 9.816996951219512,
        "avgBytesPerFlush": 10091.872865853658,
        "maxBuffers": 32,
        "maxBytes": 32896
      },
      "clientFlow": {
        "currentSliceSize": 12,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6252,
        "totalBytes": 51430840,
        "backpressureEvents": 11686,
        "availableTokens": 268435.456,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772217122830,
            "size": 12
          },
          {
            "timestamp": 1772217122830,
            "size": 10
          },
          {
            "timestamp": 1772217122830,
            "size": 8
          },
          {
            "timestamp": 1772217122830,
            "size": 12
          },
          {
            "timestamp": 1772217122830,
            "size": 10
          },
          {
            "timestamp": 1772217122830,
            "size": 8
          },
          {
            "timestamp": 1772217122830,
            "size": 12
          },
          {
            "timestamp": 1772217122830,
            "size": 10
          },
          {
            "timestamp": 1772217122830,
            "size": 8
          },
          {
            "timestamp": 1772217122830,
            "size": 12
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772217122829,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122829,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772217122829,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122829,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122829,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 8224,
            "frames": 8
          },
          {
            "timestamp": 1772217122830,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772217122830,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772217122830,
            "bytes": 7196,
            "frames": 7
          }
        ],
        "backpressureHistory": [
          1772217122828,
          1772217122828,
          1772217122828,
          1772217122829,
          1772217122829,
          1772217122829,
          1772217122829,
          1772217122829,
          1772217122829,
          1772217122829,
          1772217122830,
          1772217122830,
          1772217122830,
          1772217122830,
          1772217122830,
          1772217122830
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 12,
          "flushIntervalAvgMs": 0.051712074291093924,
          "bytesPerFlushAvg": 8859.346572608012,
          "eluIdleRatioAvg": 0.957025966922277,
          "gcPauseMaxMs": 3.8579593280596897e-10
        },
        "transportCoherence": {
          "transportSNI": 0.488776414175346,
          "transportSPI": 0.41075756984644857,
          "transportMetastability": 0.8151590935690982,
          "sliceEntropyInverse": 0.006337351230228272,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9036164801038542,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9720668784961043,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9936626487697717,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.489",
            "transport_spi:0.411",
            "transport_meta:0.815"
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
        "totalFlushes": 13120,
        "totalBytes": 132405372,
        "pendingFrames": 0,
        "pendingBytes": 0,
        "maxPendingFrames": 32,
        "maxPendingBytes": 32896,
        "maxInBufferBytes": 0,
        "ringSlots": 128,
        "ringInUse": 0,
        "ringMaxInUse": 38,
        "ringResizeCount": 0,
        "ringResizeBytes": 0,
        "overflowAllocations": 0,
        "overflowAllocatedBytes": 0,
        "copyAllocations": 0,
        "copyAllocatedBytes": 0,
        "lastFlushTimestamp": 1772217122830,
        "backpressureEvents": 11686,
        "lastBackpressureBytes": 4112,
        "lastBackpressureTimestamp": 1772217122830
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
        "avgMs": 1.8185469999999986,
        "minMs": 1.1823999999996886,
        "maxMs": 4.747699999999895
      },
      "heap": {
        "start": {
          "rss": 220803072,
          "heapTotal": 191029248,
          "heapUsed": 68369304,
          "external": 14265705,
          "arrayBuffers": 5477371
        },
        "end": {
          "rss": 290603008,
          "heapTotal": 195092480,
          "heapUsed": 77538568,
          "external": 20096361,
          "arrayBuffers": 11308027
        },
        "peakHeapUsed": 120285464,
        "peakRss": 265428992
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 934.4847000000009,
    "messagesReceived": 100095,
    "bytesReceived": 102497280,
    "framing": "length-prefixed",
    "msgsPerSec": 107112.50810205872,
    "mbPerSec": 104.60205869341672,
    "diagnostics": {
      "gc": {
        "count": 4,
        "durationMs": 5.642500042915344,
        "byKind": {
          "minor": 0,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8522429184501766,
        "activeMs": 0.9206723999896058,
        "idleMs": 0.15962099999999999
      },
      "eventLoopDelay": {
        "minMs": 19.120128,
        "maxMs": 65.437695,
        "meanMs": 22.811336347826085,
        "stdMs": 7.055659952765782,
        "p50Ms": 20.119551,
        "p99Ms": 65.437695
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
        "avgMs": 0.619974000000002,
        "minMs": 0.4603000000006432,
        "maxMs": 1.063399999999092
      },
      "heap": {
        "start": {
          "rss": 306294784,
          "heapTotal": 195092480,
          "heapUsed": 80581624,
          "external": 25216361,
          "arrayBuffers": 16428027
        },
        "end": {
          "rss": 355434496,
          "heapTotal": 192339968,
          "heapUsed": 74100640,
          "external": 59159913,
          "arrayBuffers": 50371579
        },
        "peakHeapUsed": 82490264,
        "peakRss": 422555648
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
