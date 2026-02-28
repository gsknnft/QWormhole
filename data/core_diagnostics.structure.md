# QWormhole Bench Report

Generated: 2026-02-28T14:18:49.561Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000",
  "QWORMHOLE_BENCH_CLIENTS": "1"
}
```

## Summary

| Scenario | Server | Client | Clients | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 1 | 768.30 | 100000 | 102400000 | 130157 | 127.11 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 1 | 879.04 | 100001 | 102401024 | 113761 | 111.09 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 1 | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1 | 910.39 | 100000 | 102400000 | 109843 | 107.27 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1 | 821.36 | 100001 | 102401024 | 121751 | 118.90 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 1 | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 16 | 35.67 | 87.58 | 0 | 0 | 0 | 19680 | 5.84 | 5.86 | 30 | 30.12 | 19678 | 0 | - | 0.490 | 0.416 | 0.813 |
| ts-server+native-lws | 15 | 17.89 | 73.42 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |
| native-server(lws)+ts | 7 | 15.12 | 86.18 | 0 | 0 | 0 | 12944 | 12.39 | 12.44 | 48 | 48.19 | 12942 | 0 | - | 0.486 | 0.412 | 0.815 |
| native-server(lws)+native-lws | 5 | 6.49 | 77.11 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `ts-server+ts` (tSPI 0.416, tMeta 0.813)
- Fastest transport-coherence row: `ts-server+ts` (130157 msg/s)
- Throughput leader and transport-stability leader are aligned in this run.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ts-server+ts | 130157 | 0.490 | 0.416 | 0.813 | unstable |
| 2 | native-server(lws)+ts | 109843 | 0.486 | 0.412 | 0.815 | unstable |

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
    "durationMs": 768.3028999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 130156.9992772382,
    "mbPerSec": 127.10644460667793,
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
        "durationMs": 35.667500004172325,
        "byKind": {
          "minor": 12,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8758050740143916,
        "activeMs": 0.8541577999998212,
        "idleMs": 0.12112519999999999
      },
      "eventLoopDelay": {
        "minMs": 19.529728,
        "maxMs": 174.718975,
        "meanMs": 25.03669221052632,
        "stdMs": 24.721125911379545,
        "p50Ms": 20.054015,
        "p99Ms": 174.718975
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
      "transportCalls": {
        "batchWritevCalls": 19678,
        "batchWritevBuffers": 114881,
        "batchWritevBytes": 118097668,
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
        "totalFlushes": 6556,
        "totalBytes": 30376372,
        "backpressureEvents": 9843,
        "availableTokens": 84215.296,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772288326318,
            "size": 7
          },
          {
            "timestamp": 1772288326318,
            "size": 5
          },
          {
            "timestamp": 1772288326318,
            "size": 4
          },
          {
            "timestamp": 1772288326319,
            "size": 6
          },
          {
            "timestamp": 1772288326319,
            "size": 5
          },
          {
            "timestamp": 1772288326319,
            "size": 7
          },
          {
            "timestamp": 1772288326319,
            "size": 6
          },
          {
            "timestamp": 1772288326319,
            "size": 5
          },
          {
            "timestamp": 1772288326319,
            "size": 4
          },
          {
            "timestamp": 1772288326319,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772288326318,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772288326318,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772288326318,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772288326318,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772288326319,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772288326319,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772288326319,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772288326319,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772288326319,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772288326319,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772288326319,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772288326319,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772288326319,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772288326319,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772288326319,
            "bytes": 3084,
            "frames": 3
          },
          {
            "timestamp": 1772288326319,
            "bytes": 3084,
            "frames": 3
          }
        ],
        "backpressureHistory": [
          1772288326317,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326318,
          1772288326319,
          1772288326319,
          1772288326319
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.03618843911458864,
          "bytesPerFlushAvg": 4554.133633066638,
          "eluIdleRatioAvg": 0.8562768633869866,
          "gcPauseMaxMs": 1.4843712296102682e-19
        },
        "transportCoherence": {
          "transportSNI": 0.48992045821500985,
          "transportSPI": 0.41611962380806916,
          "transportMetastability": 0.8127461692863689,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.43830933850734494,
          "batchingRegularity": 0.8938850735311425,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9065799612015413,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.2030739299866456,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.490",
            "transport_spi:0.416",
            "transport_meta:0.813"
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
        "lastFlushTimestamp": 1772288326319,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772288326319
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
        "avgMs": 1.5616759999999998,
        "minMs": 0.9623000000000275,
        "maxMs": 5.1100999999999885
      },
      "heap": {
        "start": {
          "rss": 174587904,
          "heapTotal": 126390272,
          "heapUsed": 59548032,
          "external": 11103949,
          "arrayBuffers": 2308915
        },
        "end": {
          "rss": 305274880,
          "heapTotal": 210509824,
          "heapUsed": 118478464,
          "external": 50861385,
          "arrayBuffers": 42066311
        },
        "peakHeapUsed": 93885848,
        "peakRss": 207704064
      },
      "coherenceTrace": []
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
    "durationMs": 879.0431000000001,
    "messagesReceived": 100001,
    "bytesReceived": 102401024,
    "framing": "length-prefixed",
    "msgsPerSec": 113761.20238017908,
    "mbPerSec": 111.09492419939363,
    "diagnostics": {
      "gc": {
        "count": 15,
        "durationMs": 17.89139998704195,
        "byKind": {
          "minor": 1,
          "incremental": 7,
          "major": 7
        }
      },
      "eventLoop": {
        "utilization": 0.7341998372504815,
        "activeMs": 0.7661854000010014,
        "idleMs": 0.2773798
      },
      "eventLoopDelay": {
        "minMs": 19.070976,
        "maxMs": 67.698687,
        "meanMs": 21.756527304347824,
        "stdMs": 7.310067194756285,
        "p50Ms": 20.004863,
        "p99Ms": 67.698687
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
        "avgMs": 0.5122720000000004,
        "minMs": 0.4093000000000302,
        "maxMs": 0.8520999999998367
      },
      "heap": {
        "start": {
          "rss": 331235328,
          "heapTotal": 210935808,
          "heapUsed": 124605056,
          "external": 62004417,
          "arrayBuffers": 53209343
        },
        "end": {
          "rss": 316604416,
          "heapTotal": 192352256,
          "heapUsed": 66000280,
          "external": 38393437,
          "arrayBuffers": 29605103
        },
        "peakHeapUsed": 126707368,
        "peakRss": 448667648
      },
      "coherenceTrace": []
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
    "reason": "Native client backend unavailable"
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
    "durationMs": 910.3906999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 109842.94984559927,
    "mbPerSec": 107.26850570859304,
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
        "count": 7,
        "durationMs": 15.123499989509583,
        "byKind": {
          "minor": 5,
          "incremental": 1,
          "major": 1
        }
      },
      "eventLoop": {
        "utilization": 0.8618449188737277,
        "activeMs": 0.9548091999993681,
        "idleMs": 0.15305740000000004
      },
      "eventLoopDelay": {
        "minMs": 19.349504,
        "maxMs": 160.694271,
        "meanMs": 24.633534511627907,
        "stdMs": 21.324270972328396,
        "p50Ms": 20.070399,
        "p99Ms": 160.694271
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 12944,
        "avgBuffersPerFlush": 12.386665636588381,
        "avgBytesPerFlush": 12733.492274412856,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 12942,
        "batchWritevBuffers": 160331,
        "batchWritevBytes": 164820268,
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
        "totalFlushes": 6314,
        "totalBytes": 71885984,
        "backpressureEvents": 12624,
        "availableTokens": 251658.24,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772288328457,
            "size": 10
          },
          {
            "timestamp": 1772288328457,
            "size": 11
          },
          {
            "timestamp": 1772288328457,
            "size": 15
          },
          {
            "timestamp": 1772288328457,
            "size": 12
          },
          {
            "timestamp": 1772288328457,
            "size": 11
          },
          {
            "timestamp": 1772288328457,
            "size": 15
          },
          {
            "timestamp": 1772288328457,
            "size": 12
          },
          {
            "timestamp": 1772288328457,
            "size": 11
          },
          {
            "timestamp": 1772288328457,
            "size": 15
          },
          {
            "timestamp": 1772288328457,
            "size": 10
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 15420,
            "frames": 15
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772288328457,
            "bytes": 3084,
            "frames": 3
          },
          {
            "timestamp": 1772288328457,
            "bytes": 3084,
            "frames": 3
          }
        ],
        "backpressureHistory": [
          1772288328456,
          1772288328456,
          1772288328456,
          1772288328456,
          1772288328456,
          1772288328456,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457,
          1772288328457
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 10,
          "flushIntervalAvgMs": 0.02953165178787517,
          "bytesPerFlushAvg": 9004.661699371729,
          "eluIdleRatioAvg": 0.8641654150627293,
          "gcPauseMaxMs": 2.3220050404884845e-42
        },
        "transportCoherence": {
          "transportSNI": 0.4864007498469556,
          "transportSPI": 0.41163632750851425,
          "transportMetastability": 0.8147636526211686,
          "sliceEntropyInverse": 0.04569551887948631,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9029090774194054,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.911707519790774,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9543044811205137,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.486",
            "transport_spi:0.412",
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
        "totalFlushes": 12944,
        "totalBytes": 164822324,
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
        "lastFlushTimestamp": 1772288328457,
        "backpressureEvents": 12624,
        "lastBackpressureBytes": 10280,
        "lastBackpressureTimestamp": 1772288328457
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
        "avgMs": 1.2244709999999985,
        "minMs": 1.0349999999998545,
        "maxMs": 4.7753999999999905
      },
      "heap": {
        "start": {
          "rss": 287150080,
          "heapTotal": 192352256,
          "heapUsed": 69829368,
          "external": 14265705,
          "arrayBuffers": 5477371
        },
        "end": {
          "rss": 321163264,
          "heapTotal": 206114816,
          "heapUsed": 111946776,
          "external": 29161833,
          "arrayBuffers": 20373499
        },
        "peakHeapUsed": 122042056,
        "peakRss": 302411776
      },
      "coherenceTrace": []
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
    "durationMs": 821.3591999999994,
    "messagesReceived": 100001,
    "bytesReceived": 102401024,
    "framing": "length-prefixed",
    "msgsPerSec": 121750.62993146003,
    "mbPerSec": 118.89709954244144,
    "diagnostics": {
      "gc": {
        "count": 5,
        "durationMs": 6.486100010573864,
        "byKind": {
          "minor": 1,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.7710969833579195,
        "activeMs": 0.7430197999995235,
        "idleMs": 0.22056819999999994
      },
      "eventLoopDelay": {
        "minMs": 19.08736,
        "maxMs": 62.619647,
        "meanMs": 21.683271441860462,
        "stdMs": 6.704178500869527,
        "p50Ms": 20.021247,
        "p99Ms": 62.619647
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
        "avgMs": 0.592177999999999,
        "minMs": 0.44259999999985666,
        "maxMs": 1.027299999999741
      },
      "heap": {
        "start": {
          "rss": 336338944,
          "heapTotal": 206114816,
          "heapUsed": 115082072,
          "external": 34281833,
          "arrayBuffers": 25493499
        },
        "end": {
          "rss": 342016000,
          "heapTotal": 200216576,
          "heapUsed": 63544616,
          "external": 30857577,
          "arrayBuffers": 22069243
        },
        "peakHeapUsed": 117254960,
        "peakRss": 453726208
      },
      "coherenceTrace": []
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
    "reason": "Native client backend unavailable"
  }
]
```
