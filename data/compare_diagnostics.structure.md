# QWormhole Bench Report

Generated: 2026-02-27T19:40:44.182Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 876.70 | 100000 | 102400000 | 114064 | 111.39 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 885.94 | 100003 | 102403072 | 112878 | 110.23 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1046.14 | 100000 | 102400000 | 95590 | 93.35 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 874.20 | 100005 | 102405120 | 114396 | 111.71 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| net-server+net | net | net | - | 0 | 0 | - | - | none | skipped |
| ws-server+ws | ws | ws | 1723.70 | 100000 | 102400000 | 58015 | 56.66 | none | ok |
| uwebsockets-server+ws | uwebsockets | ws | 1119.30 | 100000 | 102400000 | 89342 | 87.25 | none | ok |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 27 | 61.79 | 88.49 | 0 | 0 | 0 | 19680 | 5.84 | 5.86 | 30 | 30.12 | 0 | 0 | - | 0.502 | 0.428 | 0.807 |
| ts-server+native-lws | 15 | 18.95 | 79.25 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |
| native-server(lws)+ts | 9 | 15.59 | 90.95 | 0 | 0 | 0 | 12835 | 13.39 | 13.44 | 48 | 48.19 | 0 | 0 | - | 0.493 | 0.418 | 0.812 |
| native-server(lws)+native-lws | 4 | 6.01 | 82.69 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |

## Transport Coherence

- Transport coherence sampling: enabled
- Best transport persistence: `ts-server+ts` (tSPI 0.428, tMeta 0.807)
- Fastest measured path: `ts-server+ts` (114064 msg/s)
- Throughput leader and transport-stability leader are aligned in this run.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ts-server+ts | 114064 | 0.502 | 0.428 | 0.807 | unstable |
| 2 | native-server(lws)+ts | 95590 | 0.493 | 0.418 | 0.812 | unstable |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 876.7018,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 114063.8698357868,
    "mbPerSec": 111.39049788651054,
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
        "count": 27,
        "durationMs": 61.78860000008717,
        "byKind": {
          "minor": 11,
          "incremental": 8,
          "major": 8
        }
      },
      "eventLoop": {
        "utilization": 0.8848630396407917,
        "activeMs": 0.9746776999998241,
        "idleMs": 0.1268235
      },
      "eventLoopDelay": {
        "minMs": 19.300352,
        "maxMs": 190.709759,
        "meanMs": 25.646354731707316,
        "stdMs": 26.37731694796985,
        "p50Ms": 20.103167,
        "p99Ms": 190.709759
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
        "availableTokens": 167772.16,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772221237456,
            "size": 7
          },
          {
            "timestamp": 1772221237456,
            "size": 5
          },
          {
            "timestamp": 1772221237456,
            "size": 4
          },
          {
            "timestamp": 1772221237456,
            "size": 6
          },
          {
            "timestamp": 1772221237456,
            "size": 5
          },
          {
            "timestamp": 1772221237456,
            "size": 7
          },
          {
            "timestamp": 1772221237456,
            "size": 6
          },
          {
            "timestamp": 1772221237456,
            "size": 5
          },
          {
            "timestamp": 1772221237456,
            "size": 4
          },
          {
            "timestamp": 1772221237456,
            "size": 6
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772221237456,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221237456,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221237456,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221237456,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221237456,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221237456,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221237456,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221237456,
            "bytes": 6168,
            "frames": 6
          },
          {
            "timestamp": 1772221237456,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221237456,
            "bytes": 5140,
            "frames": 5
          },
          {
            "timestamp": 1772221237456,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221237456,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221237456,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221237456,
            "bytes": 4112,
            "frames": 4
          },
          {
            "timestamp": 1772221237456,
            "bytes": 3084,
            "frames": 3
          },
          {
            "timestamp": 1772221237456,
            "bytes": 3084,
            "frames": 3
          }
        ],
        "backpressureHistory": [
          1772221237455,
          1772221237455,
          1772221237455,
          1772221237455,
          1772221237455,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456,
          1772221237456
        ],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.016851642604915174,
          "bytesPerFlushAvg": 4554.133633066638,
          "eluIdleRatioAvg": 0.8672807688940335,
          "gcPauseMaxMs": 8.472479130217908e-7
        },
        "transportCoherence": {
          "transportSNI": 0.5024911767161859,
          "transportSPI": 0.42811813981595237,
          "transportMetastability": 0.8073468370828214,
          "sliceEntropyInverse": 0.03186093777043353,
          "flushIntervalStability": 0.4853229338876243,
          "batchingRegularity": 0.8938850735311425,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9137324923677026,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9681390622295665,
          "flushIntervalEntropy": 0.11759466565886476,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.502",
            "transport_spi:0.428",
            "transport_meta:0.807"
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
        "lastFlushTimestamp": 1772221237456,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772221237456
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
        "avgMs": 1.7818959999999993,
        "minMs": 1.2669999999998254,
        "maxMs": 6.639399999999796
      },
      "heap": {
        "start": {
          "rss": 183050240,
          "heapTotal": 123756544,
          "heapUsed": 62715664,
          "external": 14518249,
          "arrayBuffers": 5723215
        },
        "end": {
          "rss": 213954560,
          "heapTotal": 127295488,
          "heapUsed": 67266056,
          "external": 21571890,
          "arrayBuffers": 12782151
        },
        "peakHeapUsed": 91905416,
        "peakRss": 202342400
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 885.9416000000001,
    "messagesReceived": 100003,
    "bytesReceived": 102403072,
    "framing": "length-prefixed",
    "msgsPerSec": 112877.64340222876,
    "mbPerSec": 110.23207363498902,
    "diagnostics": {
      "gc": {
        "count": 15,
        "durationMs": 18.950299999676645,
        "byKind": {
          "minor": 1,
          "incremental": 7,
          "major": 7
        }
      },
      "eventLoop": {
        "utilization": 0.7924640098616584,
        "activeMs": 0.864655500000149,
        "idleMs": 0.22644199999999998
      },
      "eventLoopDelay": {
        "minMs": 19.054592,
        "maxMs": 78.643199,
        "meanMs": 21.664278260869565,
        "stdMs": 8.796685780684438,
        "p50Ms": 20.004863,
        "p99Ms": 78.643199
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
        "avgMs": 0.7457650000000012,
        "minMs": 0.5109999999999673,
        "maxMs": 1.4199000000003252
      },
      "heap": {
        "start": {
          "rss": 239161344,
          "heapTotal": 127721472,
          "heapUsed": 71808744,
          "external": 32597258,
          "arrayBuffers": 23807519
        },
        "end": {
          "rss": 282775552,
          "heapTotal": 124182528,
          "heapUsed": 72773848,
          "external": 67536217,
          "arrayBuffers": 58747883
        },
        "peakHeapUsed": 73724840,
        "peakRss": 356454400
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
    "durationMs": 1046.1362999999997,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 95589.83853251247,
    "mbPerSec": 93.34945169190671,
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
        "count": 9,
        "durationMs": 15.587499999906868,
        "byKind": {
          "minor": 5,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.9095152177792843,
        "activeMs": 1.152201799999817,
        "idleMs": 0.11462890000000005
      },
      "eventLoopDelay": {
        "minMs": 19.398656,
        "maxMs": 170.393599,
        "meanMs": 23.411633230769233,
        "stdMs": 20.628588082916025,
        "p50Ms": 20.135935,
        "p99Ms": 28.180479
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 12835,
        "avgBuffersPerFlush": 13.386832878846903,
        "avgBytesPerFlush": 13761.664199454617,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "clientFlow": {
        "currentSliceSize": 11,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6397,
        "totalBytes": 79002828,
        "backpressureEvents": 12705,
        "availableTokens": 83886.08,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772221239845,
            "size": 11
          },
          {
            "timestamp": 1772221239845,
            "size": 12
          },
          {
            "timestamp": 1772221239846,
            "size": 16
          },
          {
            "timestamp": 1772221239846,
            "size": 13
          },
          {
            "timestamp": 1772221239846,
            "size": 12
          },
          {
            "timestamp": 1772221239846,
            "size": 16
          },
          {
            "timestamp": 1772221239846,
            "size": 13
          },
          {
            "timestamp": 1772221239846,
            "size": 12
          },
          {
            "timestamp": 1772221239846,
            "size": 16
          },
          {
            "timestamp": 1772221239846,
            "size": 11
          }
        ],
        "flushHistory": [
          {
            "timestamp": 1772221239845,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239845,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772221239845,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239845,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239845,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221239845,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239845,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239845,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221239846,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239846,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239846,
            "bytes": 16448,
            "frames": 16
          },
          {
            "timestamp": 1772221239846,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239846,
            "bytes": 12336,
            "frames": 12
          },
          {
            "timestamp": 1772221239846,
            "bytes": 11308,
            "frames": 11
          },
          {
            "timestamp": 1772221239846,
            "bytes": 7196,
            "frames": 7
          },
          {
            "timestamp": 1772221239846,
            "bytes": 11308,
            "frames": 11
          }
        ],
        "backpressureHistory": [
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239845,
          1772221239846,
          1772221239846,
          1772221239846,
          1772221239846
        ],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 11,
          "flushIntervalAvgMs": 0.02188917621241726,
          "bytesPerFlushAvg": 11677.11390526833,
          "eluIdleRatioAvg": 0.8713513142825705,
          "gcPauseMaxMs": 8.186929938343909e-18
        },
        "transportCoherence": {
          "transportSNI": 0.4931945994301258,
          "transportSPI": 0.41805651033225266,
          "transportMetastability": 0.8118745703504864,
          "sliceEntropyInverse": 0.04569551887948631,
          "flushIntervalStability": 0.39809251479363345,
          "batchingRegularity": 0.9277136581462752,
          "backpressureBoundedness": 0,
          "runtimeRegularity": 0.9163783542836709,
          "payloadRegularity": 0,
          "sliceEntropy": 0.9543044811205137,
          "flushIntervalEntropy": 0.2761954276479391,
          "sampleCount": {
            "slices": 32,
            "flushes": 64,
            "backpressure": 64
          },
          "diagnostics": [
            "transport_sni:0.493",
            "transport_spi:0.418",
            "transport_meta:0.812"
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
        "totalFlushes": 12835,
        "totalBytes": 176630960,
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
        "lastFlushTimestamp": 1772221239846,
        "backpressureEvents": 12705,
        "lastBackpressureBytes": 7196,
        "lastBackpressureTimestamp": 1772221239846
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
        "avgMs": 1.4955780000000005,
        "minMs": 1.1676000000002205,
        "maxMs": 6.104400000000169
      },
      "heap": {
        "start": {
          "rss": 221474816,
          "heapTotal": 124182528,
          "heapUsed": 68768936,
          "external": 14265705,
          "arrayBuffers": 5477371
        },
        "end": {
          "rss": 269373440,
          "heapTotal": 194830336,
          "heapUsed": 73243400,
          "external": 17168745,
          "arrayBuffers": 8380411
        },
        "peakHeapUsed": 105922936,
        "peakRss": 234156032
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 874.1995999999999,
    "messagesReceived": 100005,
    "bytesReceived": 102405120,
    "framing": "length-prefixed",
    "msgsPerSec": 114396.071560774,
    "mbPerSec": 111.71491363356836,
    "diagnostics": {
      "gc": {
        "count": 4,
        "durationMs": 6.009399999864399,
        "byKind": {
          "minor": 0,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8269440800995151,
        "activeMs": 0.8876946999996872,
        "idleMs": 0.18576929999999994
      },
      "eventLoopDelay": {
        "minMs": 19.283968,
        "maxMs": 91.422719,
        "meanMs": 22.587019636363635,
        "stdMs": 10.811800005865035,
        "p50Ms": 20.021247,
        "p99Ms": 91.422719
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
        "avgMs": 0.6879269999999997,
        "minMs": 0.4985999999998967,
        "maxMs": 1.9056999999993423
      },
      "heap": {
        "start": {
          "rss": 285659136,
          "heapTotal": 194830336,
          "heapUsed": 76243496,
          "external": 22288745,
          "arrayBuffers": 13500411
        },
        "end": {
          "rss": 336105472,
          "heapTotal": 192077824,
          "heapUsed": 73334880,
          "external": 57178473,
          "arrayBuffers": 48390139
        },
        "peakHeapUsed": 78190144,
        "peakRss": 401477632
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
  },
  {
    "id": "net-server+net",
    "serverMode": "net",
    "clientMode": "net",
    "durationMs": 0,
    "messagesReceived": 0,
    "bytesReceived": 0,
    "framing": "none",
    "skipped": true,
    "reason": "raw net baseline requires framing=none"
  },
  {
    "id": "ws-server+ws",
    "serverMode": "ws",
    "clientMode": "ws",
    "durationMs": 1723.6994999999997,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "none",
    "msgsPerSec": 58014.752571431396,
    "mbPerSec": 56.65503180803847
  },
  {
    "id": "uwebsockets-server+ws",
    "serverMode": "uwebsockets",
    "clientMode": "ws",
    "durationMs": 1119.2969000000003,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "none",
    "msgsPerSec": 89341.8001961767,
    "mbPerSec": 87.24785175407881
  }
]
```
