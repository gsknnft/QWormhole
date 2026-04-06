# QWormhole Bench Report

Generated: 2026-03-01T14:55:09.614Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000",
  "QWORMHOLE_BENCH_CLIENTS": "1",
  "QWORMHOLE_TS_FAST_MAX_BYTES": "131072",
  "QWORMHOLE_TS_FAST_MAX_BUFFERS": "96"
}
```

## Summary

| Scenario | Server | Client | Clients | Runs | Rep | Duration (ms) | Dur Avg | Messages | Bytes | Msg/s | Msg/s Avg | Best | Worst | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 1 | 7 | median | 1083.84 | 1174.75 | 100000 | 102400000 | 92265 | 87270 | 107252 | 68075 | 90.10 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 1 | 7 | median | 999.32 | 1054.94 | 100012 | 102412288 | 100080 | 96281 | 103620 | 70681 | 97.73 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 1 | 1 | first | - | - | 0 | 0 | - | - | - | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1 | 7 | median | 1989.82 | 2000.43 | 100000 | 102400000 | 50256 | 50457 | 59543 | 43733 | 49.08 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1 | 7 | median | 1220.65 | 1226.38 | 100001 | 102401024 | 81924 | 82347 | 94990 | 70855 | 80.00 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 1 | 1 | first | - | - | 0 | 0 | - | - | - | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 6 | 16.38 | 87.98 | 0 | 0 | 0 | 19682 | 5.73 | 5.75 | 30 | 30.12 | 19680 | 0 | - | 0.513 | 0.435 | 0.804 |
| ts-server+native-lws | 10 | 11.09 | 74.80 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |
| native-server(lws)+ts | 11 | 33.58 | 94.92 | 0 | 0 | 0 | 11822 | 12.45 | 12.50 | 48 | 48.19 | 11820 | 0 | - | 0.504 | 0.424 | 0.809 |
| native-server(lws)+native-lws | 6 | 8.34 | 71.48 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `ts-server+ts` (tSPI 0.435, tMeta 0.804)
- Fastest transport-coherence row: `ts-server+ts` (92265 msg/s)
- Throughput leader and transport-stability leader are aligned in this run.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ts-server+ts | 92265 | 0.513 | 0.435 | 0.804 | unstable |
| 2 | native-server(lws)+ts | 50256 | 0.504 | 0.424 | 0.809 | unstable |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "durationMs": 1083.8375999999998,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 92264.74519798909,
    "mbPerSec": 90.10229023241122,
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
        "count": 6,
        "durationMs": 16.383700042963028,
        "byKind": {
          "incremental": 0,
          "major": 0,
          "minor": 6
        }
      },
      "eventLoop": {
        "utilization": 0.8797836012560397,
        "activeMs": 1.1233486999960896,
        "idleMs": 0.15349789999999996
      },
      "eventLoopDelay": {
        "minMs": 19.120128,
        "maxMs": 203.816959,
        "meanMs": 24.77211648,
        "stdMs": 25.739396052511168,
        "p50Ms": 20.201471,
        "p99Ms": 203.816959
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 19682,
        "avgBuffersPerFlush": 5.726755411035464,
        "avgBytesPerFlush": 5887.104562544457,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "transportCalls": {
        "batchWritevCalls": 19680,
        "batchWritevBuffers": 112712,
        "batchWritevBytes": 115867936,
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
        "totalFlushes": 6553,
        "totalBytes": 30359924,
        "backpressureEvents": 9843,
        "availableTokens": 318767.104,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772376872941,
            "size": 4
          },
          {
            "timestamp": 1772376872941,
            "size": 6
          },
          {
            "timestamp": 1772376872941,
            "size": 5
          },
          {
            "timestamp": 1772376872941,
            "size": 7
          },
          {
            "timestamp": 1772376872941,
            "size": 5
          },
          {
            "timestamp": 1772376872941,
            "size": 4
          },
          {
            "timestamp": 1772376872941,
            "size": 6
          },
          {
            "timestamp": 1772376872941,
            "size": 5
          },
          {
            "timestamp": 1772376872941,
            "size": 7
          },
          {
            "timestamp": 1772376872941,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772376872941,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772376872941,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772376872941,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772376872941,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772376872941,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772376872941,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772376872941,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772376872941,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772376872941,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772376872941,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772376872941,
            "bytes": 5140,
            "frames": 5
          }
        ],
        "backpressureHistory": [
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872940,
          1772376872941,
          1772376872941,
          1772376872941,
          1772376872941,
          1772376872941,
          1772376872941
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.021254452198516915,
          "bytesPerFlushAvg": 5353.027494497436,
          "eluIdleRatioAvg": 0.9226920410753704,
          "gcPauseMaxMs": 0.000010423873093768202
        },
        "transportCoherence": {
          "transportSNI": 0.5125147927314981,
          "transportSPI": 0.4352603763814727,
          "transportMetastability": 0.8041328306283373,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.4853229338876243,
          "batchingRegularity": 0.9086372079198113,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9497497354901012,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.11759466565886476,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.513",
            "transport_spi:0.435",
            "transport_meta:0.804"
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
        "totalFlushes": 19682,
        "totalBytes": 115869992,
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
        "lastFlushTimestamp": 1772376872941,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772376872941
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
        "avgMs": 1.7385410000000048,
        "minMs": 1.2254000000002634,
        "maxMs": 8.016499999999724
      },
      "heap": {
        "start": {
          "rss": 330424320,
          "heapTotal": 210034688,
          "heapUsed": 124410016,
          "external": 57421757,
          "arrayBuffers": 48633423
        },
        "end": {
          "rss": 303190016,
          "heapTotal": 216379392,
          "heapUsed": 89244320,
          "external": 21150069,
          "arrayBuffers": 12361735
        },
        "peakHeapUsed": 142671032,
        "peakRss": 335634432
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 92264.74519798909,
        "avg": 87269.79215905313,
        "best": 107252.05122229253,
        "worst": 68074.64548256315
      },
      "durationMs": {
        "median": 1083.8375999999998,
        "avg": 1174.7526428571432,
        "best": 1468.9756999999995,
        "worst": 932.3831000000009
      }
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "durationMs": 999.3191999999999,
    "messagesReceived": 100012,
    "bytesReceived": 102412288,
    "framing": "length-prefixed",
    "msgsPerSec": 100080.13455560546,
    "mbPerSec": 97.73450640195846,
    "diagnostics": {
      "gc": {
        "count": 10,
        "durationMs": 11.091699957847595,
        "byKind": {
          "incremental": 5,
          "major": 5,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7480230420236068,
        "activeMs": 0.859242100015259,
        "idleMs": 0.28944190000000025
      },
      "eventLoopDelay": {
        "minMs": 19.562496,
        "maxMs": 70.254591,
        "meanMs": 21.44240246153846,
        "stdMs": 7.148488816712743,
        "p50Ms": 20.004863,
        "p99Ms": 32.653311
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
        "avgMs": 0.5816589999999997,
        "minMs": 0.4293999999990774,
        "maxMs": 1.6669000000001688
      },
      "heap": {
        "start": {
          "rss": 331235328,
          "heapTotal": 193413120,
          "heapUsed": 60785408,
          "external": 29493437,
          "arrayBuffers": 20705103
        },
        "end": {
          "rss": 332275712,
          "heapTotal": 193937408,
          "heapUsed": 58088848,
          "external": 22352025,
          "arrayBuffers": 13563691
        },
        "peakHeapUsed": 62749536,
        "peakRss": 447397888
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 100080.13455560546,
        "avg": 96281.22288049912,
        "best": 103619.88840361222,
        "worst": 70681.49008203144
      },
      "durationMs": {
        "median": 999.3191999999999,
        "avg": 1054.9430714285706,
        "best": 1414.8966,
        "worst": 965.0849999999991
      }
    }
  },
  {
    "id": "ts-server+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "ts",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable",
    "repeatStats": {
      "runs": 1,
      "successfulRuns": 0,
      "skippedRuns": 1,
      "representative": "first"
    }
  },
  {
    "id": "native-server(lws)+ts",
    "serverMode": "native-lws",
    "clientMode": "ts",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "preferredServerBackend": "lws",
    "durationMs": 1989.8194000000003,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 50255.81718622302,
    "mbPerSec": 49.07794647092092,
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
        "count": 11,
        "durationMs": 33.57819998264313,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 3
        }
      },
      "eventLoop": {
        "utilization": 0.9492007849888698,
        "activeMs": 2.1641122000074846,
        "idleMs": 0.1158186999999998
      },
      "eventLoopDelay": {
        "minMs": 19.283968,
        "maxMs": 977.797119,
        "meanMs": 41.516740923076924,
        "stdMs": 131.137864204339,
        "p50Ms": 21.430271,
        "p99Ms": 36.732927
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 11822,
        "avgBuffersPerFlush": 12.45110810353578,
        "avgBytesPerFlush": 12799.739130434782,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 11820,
        "batchWritevBuffers": 147195,
        "batchWritevBytes": 151316460,
        "writeBufferCalls": 2,
        "writeBufferBytes": 2056,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 10,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 4755,
        "totalBytes": 57342868,
        "backpressureEvents": 9508,
        "availableTokens": 184549.376,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772376886234,
            "size": 10
          },
          {
            "timestamp": 1772376886234,
            "size": 11
          },
          {
            "timestamp": 1772376886234,
            "size": 15
          },
          {
            "timestamp": 1772376886234,
            "size": 12
          },
          {
            "timestamp": 1772376886234,
            "size": 11
          },
          {
            "timestamp": 1772376886234,
            "size": 15
          },
          {
            "timestamp": 1772376886234,
            "size": 12
          },
          {
            "timestamp": 1772376886234,
            "size": 11
          },
          {
            "timestamp": 1772376886235,
            "size": 15
          },
          {
            "timestamp": 1772376886235,
            "size": 10
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 10280,
            "frames": 10
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886234,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772376886235,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772376886235,
            "bytes": 11308,
            "frames": 11
          }
        ],
        "backpressureHistory": [
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234,
          1772376886234
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 10,
          "flushIntervalAvgMs": 0.05212480984852462,
          "bytesPerFlushAvg": 10858.436233248085,
          "eluIdleRatioAvg": 0.9744907738691274,
          "gcPauseMaxMs": 1.4523969044258477e-19
        },
        "transportCoherence": {
          "transportSNI": 0.504037831903808,
          "transportSPI": 0.42353649090743395,
          "transportMetastability": 0.8094085790916548,
          "sliceEntropyInverse": 0.04569551887948631,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9226133069048379,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9834190030149328,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9543044811205137,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.504",
            "transport_spi:0.424",
            "transport_meta:0.809"
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
        "totalFlushes": 11822,
        "totalBytes": 151318516,
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
        "lastFlushTimestamp": 1772376886235,
        "backpressureEvents": 9508,
        "lastBackpressureBytes": 6168,
        "lastBackpressureTimestamp": 1772376886234
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
        "avgMs": 3.499370999999992,
        "minMs": 1.4395000000004075,
        "maxMs": 10.954699999998411
      },
      "heap": {
        "start": {
          "rss": 330899456,
          "heapTotal": 193675264,
          "heapUsed": 71768304,
          "external": 21208113,
          "arrayBuffers": 12419779
        },
        "end": {
          "rss": 323350528,
          "heapTotal": 195641344,
          "heapUsed": 75272664,
          "external": 18531689,
          "arrayBuffers": 9743355
        },
        "peakHeapUsed": 122377968,
        "peakRss": 333479936
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 50255.81718622302,
        "avg": 50457.19726740514,
        "best": 59543.13977883054,
        "worst": 43733.246613220865
      },
      "durationMs": {
        "median": 1989.8194000000003,
        "avg": 2000.4318571428569,
        "best": 2286.589899999999,
        "worst": 1679.454600000001
      }
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "preferredServerBackend": "lws",
    "durationMs": 1220.6521000000066,
    "messagesReceived": 100001,
    "bytesReceived": 102401024,
    "framing": "length-prefixed",
    "msgsPerSec": 81924.24360716659,
    "mbPerSec": 80.00414414762362,
    "diagnostics": {
      "gc": {
        "count": 6,
        "durationMs": 8.341900050640106,
        "byKind": {
          "incremental": 3,
          "major": 3,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7148423339177726,
        "activeMs": 1.0015182000191198,
        "idleMs": 0.3995154999999995
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 86.900735,
        "meanMs": 21.43989434920635,
        "stdMs": 8.422572452422031,
        "p50Ms": 20.037631,
        "p99Ms": 27.361279
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
        "avgMs": 0.6650470000000496,
        "minMs": 0.3619999999937136,
        "maxMs": 1.864900000000489
      },
      "heap": {
        "start": {
          "rss": 436994048,
          "heapTotal": 193675264,
          "heapUsed": 57650232,
          "external": 13970793,
          "arrayBuffers": 5182459
        },
        "end": {
          "rss": 471298048,
          "heapTotal": 193675264,
          "heapUsed": 67320120,
          "external": 37384553,
          "arrayBuffers": 28596219
        },
        "peakHeapUsed": 59615392,
        "peakRss": 470425600
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 81924.24360716659,
        "avg": 82347.0625933218,
        "best": 94989.52371019256,
        "worst": 70854.7592220657
      },
      "durationMs": {
        "median": 1220.6521000000066,
        "avg": 1226.377357142859,
        "best": 1411.3378000000012,
        "worst": 1052.7582000000039
      }
    }
  },
  {
    "id": "native-server(lws)+native-libsocket",
    "clientMode": "native-libsocket",
    "serverMode": "native-lws",
    "concurrency": {
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "length-prefixed",
    "skipped": true,
    "reason": "Native client backend unavailable",
    "repeatStats": {
      "runs": 1,
      "successfulRuns": 0,
      "skippedRuns": 1,
      "representative": "first"
    }
  }
]
```
