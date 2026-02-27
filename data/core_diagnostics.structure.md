# QWormhole Bench Report

Generated: 2026-02-27T20:18:56.881Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 925.66 | 100000 | 102400000 | 108031 | 105.50 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 967.28 | 100006 | 102406144 | 103389 | 100.97 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1195.31 | 100000 | 102400000 | 83661 | 81.70 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1035.81 | 100001 | 102401024 | 96544 | 94.28 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 31 | 65.69 | 88.01 | 0 | 0 | 0 | 19679 | 5.73 | 5.75 | 30 | 30.12 | 19677 | 0 | - | 0.487 | 0.411 | 0.815 |
| ts-server+native-lws | 10 | 12.95 | 73.47 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |
| native-server(lws)+ts | 11 | 23.77 | 89.56 | 0 | 0 | 0 | 12330 | 11.36 | 11.40 | 48 | 48.19 | 12328 | 0 | - | 0.502 | 0.422 | 0.810 |
| native-server(lws)+native-lws | 8 | 21.59 | 80.33 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `native-server(lws)+ts` (tSPI 0.422, tMeta 0.810)
- Fastest transport-coherence row: `ts-server+ts` (108031 msg/s)
- Transport winner differs from throughput winner. Prefer tSPI when selecting a default path.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | native-server(lws)+ts | 83661 | 0.502 | 0.422 | 0.810 | unstable |
| 2 | ts-server+ts | 108031 | 0.487 | 0.411 | 0.815 | unstable |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 925.6623,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 108030.75808531903,
    "mbPerSec": 105.49878719269437,
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
        "durationMs": 65.69479999877512,
        "byKind": {
          "incremental": 11,
          "major": 11,
          "minor": 9
        }
      },
      "eventLoop": {
        "utilization": 0.8801049103221532,
        "activeMs": 1.012532799999833,
        "idleMs": 0.1379355
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 235.143167,
        "meanMs": 26.593767619047618,
        "stdMs": 32.77880251594787,
        "p50Ms": 20.037631,
        "p99Ms": 235.143167
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
      "transportCalls": {
        "batchWritevCalls": 19677,
        "batchWritevBuffers": 112805,
        "batchWritevBytes": 115963540,
        "writeBufferCalls": 2,
        "writeBufferBytes": 2056,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 6,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6555,
        "totalBytes": 30374316,
        "backpressureEvents": 9842,
        "availableTokens": 252316.672,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772223532791,
            "size": 4
          },
          {
            "timestamp": 1772223532791,
            "size": 6
          },
          {
            "timestamp": 1772223532791,
            "size": 5
          },
          {
            "timestamp": 1772223532791,
            "size": 7
          },
          {
            "timestamp": 1772223532791,
            "size": 5
          },
          {
            "timestamp": 1772223532791,
            "size": 4
          },
          {
            "timestamp": 1772223532791,
            "size": 6
          },
          {
            "timestamp": 1772223532791,
            "size": 5
          },
          {
            "timestamp": 1772223532791,
            "size": 7
          },
          {
            "timestamp": 1772223532791,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772223532791,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772223532791,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772223532791,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772223532791,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772223532791,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772223532791,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772223532791,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772223532791,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772223532791,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772223532791,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772223532791,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772223532791,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772223532791,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772223532791,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772223532791,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772223532791,
            "bytes": 6168,
            "frames": 6
          }
        ],
        "backpressureHistory": [
          1772223532789,
          1772223532789,
          1772223532789,
          1772223532789,
          1772223532789,
          1772223532789,
          1772223532790,
          1772223532790,
          1772223532790,
          1772223532791,
          1772223532791,
          1772223532791,
          1772223532791,
          1772223532791,
          1772223532791,
          1772223532791
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.030262804648123733,
          "bytesPerFlushAvg": 5611.884368121796,
          "eluIdleRatioAvg": 0.8876216269764096,
          "gcPauseMaxMs": 0.3624427622358129
        },
        "transportCoherence": {
          "transportSNI": 0.486675743826652,
          "transportSPI": 0.4114986916466265,
          "transportMetastability": 0.8148255887590181,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9076802123373588,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9237826833651028,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.487",
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
        "lastFlushTimestamp": 1772223532791,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772223532791
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
        "avgMs": 2.198655000000001,
        "minMs": 1.256900000000087,
        "maxMs": 9.215799999999945
      },
      "heap": {
        "start": {
          "rss": 183885824,
          "heapTotal": 121663488,
          "heapUsed": 64694184,
          "external": 16005261,
          "arrayBuffers": 7210227
        },
        "end": {
          "rss": 204214272,
          "heapTotal": 125988864,
          "heapUsed": 54915072,
          "external": 36788585,
          "arrayBuffers": 1364335
        },
        "peakHeapUsed": 91332920,
        "peakRss": 202289152
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 967.2794000000004,
    "messagesReceived": 100006,
    "bytesReceived": 102406144,
    "framing": "length-prefixed",
    "msgsPerSec": 103388.94842586327,
    "mbPerSec": 100.9657699471321,
    "diagnostics": {
      "gc": {
        "count": 10,
        "durationMs": 12.95449999999255,
        "byKind": {
          "incremental": 5,
          "major": 5,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7346914713683503,
        "activeMs": 0.8767472999996039,
        "idleMs": 0.31660710000000003
      },
      "eventLoopDelay": {
        "minMs": 19.152896,
        "maxMs": 72.941567,
        "meanMs": 21.7284608,
        "stdMs": 7.827086944057428,
        "p50Ms": 20.004863,
        "p99Ms": 72.941567
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
        "nativeSendManyCalls": 1642,
        "nativeSendManyItems": 105000,
        "nativeSendManyBytes": 107940000,
        "nativeSendCalls": 0
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.7164830000000029,
        "minMs": 0.5347000000001572,
        "maxMs": 1.2505000000001019
      },
      "heap": {
        "start": {
          "rss": 229416960,
          "heapTotal": 126152704,
          "heapUsed": 60051064,
          "external": 21118089,
          "arrayBuffers": 12329755
        },
        "end": {
          "rss": 229212160,
          "heapTotal": 122351616,
          "heapUsed": 52460696,
          "external": 13305977,
          "arrayBuffers": 4517643
        },
        "peakHeapUsed": 61994352,
        "peakRss": 346550272
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
    "durationMs": 1195.3064,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 83660.55766119884,
    "mbPerSec": 81.69976334101449,
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
      "flushCapBytes": 163840,
      "flushCapBuffers": 96,
      "flushIntervalMs": 1,
      "adaptiveMode": "aggressive"
    },
    "diagnostics": {
      "gc": {
        "count": 11,
        "durationMs": 23.77000000141561,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 3
        }
      },
      "eventLoop": {
        "utilization": 0.8956410501804305,
        "activeMs": 1.322356600000855,
        "idleMs": 0.15407930000000006
      },
      "eventLoopDelay": {
        "minMs": 19.070976,
        "maxMs": 559.939583,
        "meanMs": 35.497445052631576,
        "stdMs": 86.2285224162297,
        "p50Ms": 20.201471,
        "p99Ms": 559.939583
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 12330,
        "avgBuffersPerFlush": 11.35669099756691,
        "avgBytesPerFlush": 11674.678345498784,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 12328,
        "batchWritevBuffers": 140026,
        "batchWritevBytes": 143946728,
        "writeBufferCalls": 2,
        "writeBufferBytes": 2056,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 14,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 5107,
        "totalBytes": 54685488,
        "backpressureEvents": 10212,
        "availableTokens": 201326.592,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772223535470,
            "size": 14
          },
          {
            "timestamp": 1772223535470,
            "size": 11
          },
          {
            "timestamp": 1772223535470,
            "size": 10
          },
          {
            "timestamp": 1772223535470,
            "size": 14
          },
          {
            "timestamp": 1772223535470,
            "size": 9
          },
          {
            "timestamp": 1772223535470,
            "size": 10
          },
          {
            "timestamp": 1772223535470,
            "size": 14
          },
          {
            "timestamp": 1772223535470,
            "size": 11
          },
          {
            "timestamp": 1772223535470,
            "size": 10
          },
          {
            "timestamp": 1772223535470,
            "size": 14
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772223535469,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535469,
            "bytes": 14392,
            "frames": 14
          },
          {
            "timestamp": 1772223535469,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 9252,
            "frames": 9
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 14392,
            "frames": 14
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 14392,
            "frames": 14
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772223535470,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772223535470,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772223535470,
            "bytes": 11308,
            "frames": 11
          }
        ],
        "backpressureHistory": [
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535469,
          1772223535470,
          1772223535470,
          1772223535470,
          1772223535470,
          1772223535470,
          1772223535470,
          1772223535470,
          1772223535470
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 14,
          "flushIntervalAvgMs": 0.030524500351994232,
          "bytesPerFlushAvg": 10246.373596227199,
          "eluIdleRatioAvg": 0.9488392481694639,
          "gcPauseMaxMs": 3.447723716687078e-26
        },
        "transportCoherence": {
          "transportSNI": 0.5018060162502449,
          "transportSPI": 0.4222055812114656,
          "transportMetastability": 0.8100074884548405,
          "sliceEntropyInverse": 0.056519853349179416,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9158968871963591,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9667455113101515,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9434801466508206,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.502",
            "transport_spi:0.422",
            "transport_meta:0.810"
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
        "totalFlushes": 12330,
        "totalBytes": 143948784,
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
        "lastFlushTimestamp": 1772223535470,
        "backpressureEvents": 10212,
        "lastBackpressureBytes": 5140,
        "lastBackpressureTimestamp": 1772223535470
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
        "avgMs": 1.465306999999998,
        "minMs": 1.1736000000000786,
        "maxMs": 6.389799999999923
      },
      "heap": {
        "start": {
          "rss": 231981056,
          "heapTotal": 122351616,
          "heapUsed": 68638784,
          "external": 18573433,
          "arrayBuffers": 9785099
        },
        "end": {
          "rss": 302481408,
          "heapTotal": 192737280,
          "heapUsed": 80665264,
          "external": 22813033,
          "arrayBuffers": 14024699
        },
        "peakHeapUsed": 121632904,
        "peakRss": 255033344
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 1035.812,
    "messagesReceived": 100001,
    "bytesReceived": 102401024,
    "framing": "length-prefixed",
    "msgsPerSec": 96543.58126764317,
    "mbPerSec": 94.28084108168278,
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 21.594100000336766,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8033441356020017,
        "activeMs": 0.9843112999994833,
        "idleMs": 0.2409559999999999
      },
      "eventLoopDelay": {
        "minMs": 19.202048,
        "maxMs": 89.260031,
        "meanMs": 22.41646276923077,
        "stdMs": 9.80796707248374,
        "p50Ms": 20.054015,
        "p99Ms": 35.061759
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
        "nativeSendManyCalls": 1642,
        "nativeSendManyItems": 105000,
        "nativeSendManyBytes": 107940000,
        "nativeSendCalls": 0
      },
      "sendBlocks": {
        "blockSize": 1000,
        "samples": 100,
        "avgMs": 0.6882750000000033,
        "minMs": 0.4632999999994354,
        "maxMs": 1.256800000000112
      },
      "heap": {
        "start": {
          "rss": 317394944,
          "heapTotal": 192737280,
          "heapUsed": 83708240,
          "external": 27933033,
          "arrayBuffers": 19144699
        },
        "end": {
          "rss": 332197888,
          "heapTotal": 189722624,
          "heapUsed": 62986512,
          "external": 33616233,
          "arrayBuffers": 24827899
        },
        "peakHeapUsed": 85642992,
        "peakRss": 433979392
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
