# QWormhole Bench Report

Generated: 2026-02-28T00:42:28.674Z

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
| ts-server+ts | ts | ts | 16 | 1377.24 | 160000 | 163840000 | 116174 | 113.45 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 16 | 804.66 | 160268 | 164114432 | 199175 | 194.51 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 16 | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 16 | 1365.50 | 160000 | 163840000 | 117174 | 114.43 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 16 | 826.92 | 160806 | 164665344 | 194463 | 189.91 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 16 | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 32 | 111.48 | 91.22 | 0 | 0 | 0 | 31344 | 5.82 | 5.84 | 30 | 30.12 | 31306 | 0 | - | off | off | off |
| ts-server+native-lws | 14 | 23.12 | 94.10 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 2640 | - | off | off | off |
| native-server(lws)+ts | 15 | 44.81 | 92.88 | 0 | 0 | 0 | 17680 | 12.53 | 12.58 | 48 | 48.19 | 17648 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 8 | 9.53 | 95.02 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 2640 | - | off | off | off |

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
      "clients": 16,
      "messagesPerClient": 10000,
      "totalMessages": 160000
    },
    "durationMs": 1377.2441000000001,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "length-prefixed",
    "msgsPerSec": 116174.03189456392,
    "mbPerSec": 113.45120302203507,
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
        "durationMs": 111.48009999934584,
        "byKind": {
          "incremental": 12,
          "major": 12,
          "minor": 8
        }
      },
      "eventLoop": {
        "utilization": 0.9122385702536584,
        "activeMs": 1.5108278999999334,
        "idleMs": 0.14534840000000002
      },
      "eventLoopDelay": {
        "minMs": 19.808256,
        "maxMs": 300.941311,
        "meanMs": 30.550331076923076,
        "stdMs": 38.35000192471578,
        "p50Ms": 23.527423,
        "p99Ms": 59.506687
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 31344,
        "avgBuffersPerFlush": 5.815658499234303,
        "avgBytesPerFlush": 5978.4969372128635,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "transportCalls": {
        "batchWritevCalls": 31306,
        "batchWritevBuffers": 182248,
        "batchWritevBytes": 187350944,
        "writeBufferCalls": 38,
        "writeBufferBytes": 39064,
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
            "timestamp": 1772239343925,
            "size": 5
          },
          {
            "timestamp": 1772239343926,
            "size": 7
          },
          {
            "timestamp": 1772239343926,
            "size": 5
          },
          {
            "timestamp": 1772239343926,
            "size": 4
          },
          {
            "timestamp": 1772239343927,
            "size": 6
          },
          {
            "timestamp": 1772239343927,
            "size": 5
          },
          {
            "timestamp": 1772239343928,
            "size": 7
          },
          {
            "timestamp": 1772239343928,
            "size": 5
          },
          {
            "timestamp": 1772239343928,
            "size": 4
          },
          {
            "timestamp": 1772239343928,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.06800806331667378,
          "bytesPerFlushAvg": 3914.6989064533113,
          "eluIdleRatioAvg": 0.8966471780763533,
          "gcPauseMaxMs": 0.03666283462121255
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
        "lastFlushTimestamp": 1772239343928,
        "backpressureEvents": 981,
        "lastBackpressureBytes": 3084,
        "lastBackpressureTimestamp": 1772239343928
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
        "avgMs": 1.5236675000000006,
        "minMs": 1.1037000000001171,
        "maxMs": 11.166200000000117
      },
      "heap": {
        "start": {
          "rss": 199258112,
          "heapTotal": 128487424,
          "heapUsed": 69026640,
          "external": 23683221,
          "arrayBuffers": 14888187
        },
        "end": {
          "rss": 296407040,
          "heapTotal": 199266304,
          "heapUsed": 93594464,
          "external": 51449665,
          "arrayBuffers": 42661331
        },
        "peakHeapUsed": 111428976,
        "peakRss": 228474880
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
    "durationMs": 804.6593000000003,
    "messagesReceived": 160268,
    "bytesReceived": 164114432,
    "framing": "length-prefixed",
    "msgsPerSec": 199174.9800194939,
    "mbPerSec": 194.506816425287,
    "diagnostics": {
      "gc": {
        "count": 14,
        "durationMs": 23.123099999967963,
        "byKind": {
          "incremental": 7,
          "major": 7,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.9410074885116989,
        "activeMs": 1.4001304999998334,
        "idleMs": 0.08777529999999999
      },
      "eventLoopDelay": {
        "minMs": 19.562496,
        "maxMs": 274.726911,
        "meanMs": 60.87529813333333,
        "stdMs": 73.26704184620571,
        "p50Ms": 20.398079,
        "p99Ms": 274.726911
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
        "avgMs": 0.629233124999999,
        "minMs": 0.013800000000173895,
        "maxMs": 3.483099999999922
      },
      "heap": {
        "start": {
          "rss": 457015296,
          "heapTotal": 199430144,
          "heapUsed": 97218096,
          "external": 70386785,
          "arrayBuffers": 61598451
        },
        "end": {
          "rss": 437792768,
          "heapTotal": 193400832,
          "heapUsed": 60550456,
          "external": 31358225,
          "arrayBuffers": 22569891
        },
        "peakHeapUsed": 100461480,
        "peakRss": 641048576
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
    "durationMs": 1365.4952000000003,
    "messagesReceived": 160000,
    "bytesReceived": 163840000,
    "framing": "length-prefixed",
    "msgsPerSec": 117173.6085194587,
    "mbPerSec": 114.4273520697839,
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
        "count": 15,
        "durationMs": 44.812100001610816,
        "byKind": {
          "incremental": 5,
          "major": 5,
          "minor": 5
        }
      },
      "eventLoop": {
        "utilization": 0.9287519762375013,
        "activeMs": 1.4827816000003808,
        "idleMs": 0.1137497
      },
      "eventLoopDelay": {
        "minMs": 19.6608,
        "maxMs": 763.363327,
        "meanMs": 45.750334060606065,
        "stdMs": 126.89455125956712,
        "p50Ms": 21.528575,
        "p99Ms": 763.363327
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
            "timestamp": 1772239346416,
            "size": 15
          },
          {
            "timestamp": 1772239346416,
            "size": 10
          },
          {
            "timestamp": 1772239346417,
            "size": 11
          },
          {
            "timestamp": 1772239346417,
            "size": 15
          },
          {
            "timestamp": 1772239346418,
            "size": 12
          },
          {
            "timestamp": 1772239346418,
            "size": 11
          },
          {
            "timestamp": 1772239346418,
            "size": 15
          },
          {
            "timestamp": 1772239346418,
            "size": 10
          },
          {
            "timestamp": 1772239346419,
            "size": 11
          },
          {
            "timestamp": 1772239346420,
            "size": 15
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 15,
          "flushIntervalAvgMs": 0.31757460367496354,
          "bytesPerFlushAvg": 10925.8780476731,
          "eluIdleRatioAvg": 0.9227639504021161,
          "gcPauseMaxMs": 4.5370377629367646e-17
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
        "lastFlushTimestamp": 1772239346420,
        "backpressureEvents": 740,
        "lastBackpressureBytes": 4112,
        "lastBackpressureTimestamp": 1772239346419
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
        "avgMs": 1.4978524999999991,
        "minMs": 1.0933999999997468,
        "maxMs": 8.171100000000479
      },
      "heap": {
        "start": {
          "rss": 288874496,
          "heapTotal": 193400832,
          "heapUsed": 79485344,
          "external": 22210237,
          "arrayBuffers": 13421903
        },
        "end": {
          "rss": 356044800,
          "heapTotal": 192876544,
          "heapUsed": 71872408,
          "external": 51294569,
          "arrayBuffers": 42506235
        },
        "peakHeapUsed": 121488000,
        "peakRss": 309936128
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
    "durationMs": 826.9229999999998,
    "messagesReceived": 160806,
    "bytesReceived": 164665344,
    "framing": "length-prefixed",
    "msgsPerSec": 194463.0878570315,
    "mbPerSec": 189.90535923538232,
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 9.53429999994114,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.950167073473085,
        "activeMs": 1.4187661000000653,
        "idleMs": 0.07440930000000003
      },
      "eventLoopDelay": {
        "minMs": 19.464192,
        "maxMs": 134.021119,
        "meanMs": 26.287900444444443,
        "stdMs": 19.442078151121233,
        "p50Ms": 21.348351,
        "p99Ms": 134.021119
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
        "avgMs": 0.7537862500000017,
        "minMs": 0.018199999999524152,
        "maxMs": 3.9439999999995052
      },
      "heap": {
        "start": {
          "rss": 458436608,
          "heapTotal": 193138688,
          "heapUsed": 59167544,
          "external": 19426665,
          "arrayBuffers": 10638331
        },
        "end": {
          "rss": 484941824,
          "heapTotal": 192352256,
          "heapUsed": 62247928,
          "external": 28314985,
          "arrayBuffers": 19526651
        },
        "peakHeapUsed": 62450168,
        "peakRss": 644390912
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
  }
]
```
