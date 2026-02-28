# QWormhole Bench Report

Generated: 2026-02-28T14:18:13.500Z

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
| ts-server+ts | ts | ts | 1 | 687.20 | 100000 | 102400000 | 145518 | 142.11 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 1 | 848.27 | 100010 | 102410240 | 117898 | 115.13 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 1 | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1 | 820.12 | 100000 | 102400000 | 121933 | 119.08 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1 | 786.01 | 100000 | 102400000 | 127225 | 124.24 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 1 | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 27 | 43.67 | 84.74 | 0 | 0 | 0 | 19679 | 5.73 | 5.75 | 30 | 30.12 | 19677 | 0 | - | off | off | off |
| ts-server+native-lws | 14 | 14.03 | 74.91 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |
| native-server(lws)+ts | 9 | 12.96 | 85.72 | 0 | 0 | 0 | 12583 | 12.41 | 12.45 | 48 | 48.19 | 12581 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 6 | 6.62 | 80.98 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |

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
      "clients": 1,
      "messagesPerClient": 100000,
      "totalMessages": 100000
    },
    "durationMs": 687.1985999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 145518.3406951062,
    "mbPerSec": 142.10775458506464,
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
        "durationMs": 43.67210000008345,
        "byKind": {
          "incremental": 8,
          "major": 8,
          "minor": 11
        }
      },
      "eventLoop": {
        "utilization": 0.8473934029315668,
        "activeMs": 0.7587618999961019,
        "idleMs": 0.136645
      },
      "eventLoopDelay": {
        "minMs": 19.2512,
        "maxMs": 179.699711,
        "meanMs": 26.146878060606063,
        "stdMs": 27.35374272544712,
        "p50Ms": 20.054015,
        "p99Ms": 179.699711
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
        "availableTokens": 184549.376,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772288290359,
            "size": 4
          },
          {
            "timestamp": 1772288290359,
            "size": 6
          },
          {
            "timestamp": 1772288290359,
            "size": 5
          },
          {
            "timestamp": 1772288290359,
            "size": 7
          },
          {
            "timestamp": 1772288290359,
            "size": 5
          },
          {
            "timestamp": 1772288290359,
            "size": 4
          },
          {
            "timestamp": 1772288290359,
            "size": 6
          },
          {
            "timestamp": 1772288290359,
            "size": 5
          },
          {
            "timestamp": 1772288290359,
            "size": 7
          },
          {
            "timestamp": 1772288290359,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.014927039941398854,
          "bytesPerFlushAvg": 5611.884368121796,
          "eluIdleRatioAvg": 0.8567866334174336,
          "gcPauseMaxMs": 0.003642407984241428
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
        "lastFlushTimestamp": 1772288290359,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772288290359
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
        "avgMs": 1.4519529999999998,
        "minMs": 1.0010999999999513,
        "maxMs": 4.820300000000088
      },
      "heap": {
        "start": {
          "rss": 188465152,
          "heapTotal": 122982400,
          "heapUsed": 67515880,
          "external": 16907305,
          "arrayBuffers": 8112271
        },
        "end": {
          "rss": 217133056,
          "heapTotal": 194678784,
          "heapUsed": 62423128,
          "external": 17886742,
          "arrayBuffers": 9097003
        },
        "peakHeapUsed": 92121512,
        "peakRss": 206958592
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
    "durationMs": 848.2746999999999,
    "messagesReceived": 100010,
    "bytesReceived": 102410240,
    "framing": "length-prefixed",
    "msgsPerSec": 117898.12899052631,
    "mbPerSec": 115.13489159231085,
    "diagnostics": {
      "gc": {
        "count": 14,
        "durationMs": 14.034999996423721,
        "byKind": {
          "incremental": 7,
          "major": 7,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7490776630651002,
        "activeMs": 0.7716863999979972,
        "idleMs": 0.25849570000000005
      },
      "eventLoopDelay": {
        "minMs": 19.00544,
        "maxMs": 54.722559,
        "meanMs": 22.054167272727273,
        "stdMs": 6.343572250916915,
        "p50Ms": 20.004863,
        "p99Ms": 54.722559
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
        "avgMs": 0.534393,
        "minMs": 0.38209999999980937,
        "maxMs": 1.6217000000001462
      },
      "heap": {
        "start": {
          "rss": 242307072,
          "heapTotal": 194842624,
          "heapUsed": 68283448,
          "external": 28961270,
          "arrayBuffers": 20171531
        },
        "end": {
          "rss": 237367296,
          "heapTotal": 191565824,
          "heapUsed": 57016200,
          "external": 18294353,
          "arrayBuffers": 9506019
        },
        "peakHeapUsed": 70419760,
        "peakRss": 360460288
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
    "durationMs": 820.1217999999999,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 121933.10798469205,
    "mbPerSec": 119.07530076630083,
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
        "count": 9,
        "durationMs": 12.95830000191927,
        "byKind": {
          "incremental": 2,
          "major": 2,
          "minor": 5
        }
      },
      "eventLoop": {
        "utilization": 0.8572273257026862,
        "activeMs": 0.8721892000002504,
        "idleMs": 0.14526460000000002
      },
      "eventLoopDelay": {
        "minMs": 19.41504,
        "maxMs": 202.113023,
        "meanMs": 26.703872,
        "stdMs": 29.90128480629803,
        "p50Ms": 20.119551,
        "p99Ms": 202.113023
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 12583,
        "avgBuffersPerFlush": 12.40610347293968,
        "avgBytesPerFlush": 12753.474370181992,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 12581,
        "batchWritevBuffers": 156104,
        "batchWritevBytes": 160474912,
        "writeBufferCalls": 2,
        "writeBufferBytes": 2056,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 15,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 5812,
        "totalBytes": 67201388,
        "backpressureEvents": 11622,
        "availableTokens": 184549.376,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772288292395,
            "size": 15
          },
          {
            "timestamp": 1772288292395,
            "size": 12
          },
          {
            "timestamp": 1772288292395,
            "size": 11
          },
          {
            "timestamp": 1772288292395,
            "size": 15
          },
          {
            "timestamp": 1772288292395,
            "size": 12
          },
          {
            "timestamp": 1772288292395,
            "size": 11
          },
          {
            "timestamp": 1772288292395,
            "size": 15
          },
          {
            "timestamp": 1772288292395,
            "size": 10
          },
          {
            "timestamp": 1772288292395,
            "size": 11
          },
          {
            "timestamp": 1772288292395,
            "size": 15
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 15,
          "flushIntervalAvgMs": 0.0564802758755953,
          "bytesPerFlushAvg": 9481.777359497384,
          "eluIdleRatioAvg": 0.8757923836232819,
          "gcPauseMaxMs": 0.000002719791580719577
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
        "totalFlushes": 12583,
        "totalBytes": 160476968,
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
        "lastFlushTimestamp": 1772288292395,
        "backpressureEvents": 11622,
        "lastBackpressureBytes": 5140,
        "lastBackpressureTimestamp": 1772288292395
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
        "avgMs": 1.3210429999999997,
        "minMs": 1.0284999999998945,
        "maxMs": 4.304900000000089
      },
      "heap": {
        "start": {
          "rss": 227528704,
          "heapTotal": 192352256,
          "heapUsed": 55631128,
          "external": 13088105,
          "arrayBuffers": 4299771
        },
        "end": {
          "rss": 293748736,
          "heapTotal": 197201920,
          "heapUsed": 64418472,
          "external": 13597033,
          "arrayBuffers": 4808699
        },
        "peakHeapUsed": 122515920,
        "peakRss": 262885376
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
    "durationMs": 786.0107000000003,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 127224.73116460115,
    "mbPerSec": 124.24290152793081,
    "diagnostics": {
      "gc": {
        "count": 6,
        "durationMs": 6.623000010848045,
        "byKind": {
          "incremental": 3,
          "major": 3,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8098379378106233,
        "activeMs": 0.769940299993992,
        "idleMs": 0.1807935
      },
      "eventLoopDelay": {
        "minMs": 19.103744,
        "maxMs": 66.191359,
        "meanMs": 22.01430165853659,
        "stdMs": 7.578534973829252,
        "p50Ms": 20.021247,
        "p99Ms": 66.191359
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
        "avgMs": 0.49266399999999977,
        "minMs": 0.40830000000005384,
        "maxMs": 0.7012999999997191
      },
      "heap": {
        "start": {
          "rss": 309612544,
          "heapTotal": 197726208,
          "heapUsed": 67568256,
          "external": 18717033,
          "arrayBuffers": 9928699
        },
        "end": {
          "rss": 371789824,
          "heapTotal": 191827968,
          "heapUsed": 66930800,
          "external": 38580585,
          "arrayBuffers": 29792251
        },
        "peakHeapUsed": 69581808,
        "peakRss": 424755200
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
