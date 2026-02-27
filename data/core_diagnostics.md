# QWormhole Bench Report

Generated: 2026-02-27T20:24:27.207Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 865.43 | 100000 | 102400000 | 115549 | 112.84 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 922.78 | 100004 | 102404096 | 108373 | 105.83 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1096.40 | 100000 | 102400000 | 91207 | 89.07 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 853.10 | 100003 | 102403072 | 117223 | 114.48 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 30 | 68.88 | 87.16 | 0 | 0 | 0 | 19681 | 5.84 | 5.86 | 30 | 30.12 | 19679 | 0 | - | off | off | off |
| ts-server+native-lws | 18 | 27.86 | 77.13 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |
| native-server(lws)+ts | 8 | 14.47 | 89.86 | 0 | 0 | 0 | 13076 | 12.39 | 12.44 | 48 | 48.19 | 13074 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 4 | 5.89 | 84.38 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |

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
    "durationMs": 865.4300000000001,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 115549.4956264516,
    "mbPerSec": 112.84130432270663,
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
        "count": 30,
        "durationMs": 68.88169999979436,
        "byKind": {
          "minor": 12,
          "incremental": 9,
          "major": 9
        }
      },
      "eventLoop": {
        "utilization": 0.8716103369740386,
        "activeMs": 0.9861489999994695,
        "idleMs": 0.14526139999999998
      },
      "eventLoopDelay": {
        "minMs": 19.152896,
        "maxMs": 222.298111,
        "meanMs": 26.9606912,
        "stdMs": 31.6503379766652,
        "p50Ms": 20.103167,
        "p99Ms": 222.298111
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 19681,
        "avgBuffersPerFlush": 5.837203394136477,
        "avgBytesPerFlush": 6000.645089172298,
        "maxBuffers": 30,
        "maxBytes": 30840
      },
      "transportCalls": {
        "batchWritevCalls": 19679,
        "batchWritevBuffers": 114880,
        "batchWritevBytes": 118096640,
        "writeBufferCalls": 2,
        "writeBufferBytes": 2056,
        "nativeSendManyCalls": 0,
        "nativeSendManyItems": 0,
        "nativeSendManyBytes": 0,
        "nativeSendCalls": 0
      },
      "clientFlow": {
        "currentSliceSize": 7,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 6555,
        "totalBytes": 30369176,
        "backpressureEvents": 9843,
        "availableTokens": 201326.592,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772223863549,
            "size": 5
          },
          {
            "timestamp": 1772223863549,
            "size": 4
          },
          {
            "timestamp": 1772223863549,
            "size": 6
          },
          {
            "timestamp": 1772223863549,
            "size": 5
          },
          {
            "timestamp": 1772223863549,
            "size": 7
          },
          {
            "timestamp": 1772223863549,
            "size": 5
          },
          {
            "timestamp": 1772223863549,
            "size": 4
          },
          {
            "timestamp": 1772223863549,
            "size": 6
          },
          {
            "timestamp": 1772223863549,
            "size": 5
          },
          {
            "timestamp": 1772223863549,
            "size": 7
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 7,
          "flushIntervalAvgMs": 0.01750904962479122,
          "bytesPerFlushAvg": 4244.543440104096,
          "eluIdleRatioAvg": 0.8805847670818903,
          "gcPauseMaxMs": 5.798078467698134e-12
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
        "totalFlushes": 19681,
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
        "lastFlushTimestamp": 1772223863549,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772223863549
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
        "avgMs": 1.8818820000000005,
        "minMs": 1.2807000000000244,
        "maxMs": 7.2543000000000575
      },
      "heap": {
        "start": {
          "rss": 184123392,
          "heapTotal": 123498496,
          "heapUsed": 63329472,
          "external": 14814829,
          "arrayBuffers": 6019795
        },
        "end": {
          "rss": 231481344,
          "heapTotal": 192573440,
          "heapUsed": 79174224,
          "external": 35238865,
          "arrayBuffers": 26450531
        },
        "peakHeapUsed": 91700376,
        "peakRss": 203603968
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 922.7788999999998,
    "messagesReceived": 100004,
    "bytesReceived": 102404096,
    "framing": "length-prefixed",
    "msgsPerSec": 108372.65568165897,
    "mbPerSec": 105.83267156412009,
    "diagnostics": {
      "gc": {
        "count": 18,
        "durationMs": 27.857200000435114,
        "byKind": {
          "minor": 0,
          "incremental": 9,
          "major": 9
        }
      },
      "eventLoop": {
        "utilization": 0.7712575761328139,
        "activeMs": 0.8597600000005039,
        "idleMs": 0.2549908
      },
      "eventLoopDelay": {
        "minMs": 19.218432,
        "maxMs": 90.898431,
        "meanMs": 22.093824,
        "stdMs": 10.510292731109423,
        "p50Ms": 20.021247,
        "p99Ms": 90.898431
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
        "avgMs": 0.7525070000000005,
        "minMs": 0.29739999999992506,
        "maxMs": 7.638600000000224
      },
      "heap": {
        "start": {
          "rss": 257536000,
          "heapTotal": 192737280,
          "heapUsed": 83872472,
          "external": 46242129,
          "arrayBuffers": 37453795
        },
        "end": {
          "rss": 271130624,
          "heapTotal": 191033344,
          "heapUsed": 52211720,
          "external": 79454169,
          "arrayBuffers": 35745999
        },
        "peakHeapUsed": 85355168,
        "peakRss": 345698304
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
    "durationMs": 1096.4049000000005,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 91207.18085079697,
    "mbPerSec": 89.06951254960642,
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
      "flushCapBuffers": 112,
      "flushIntervalMs": 1,
      "adaptiveMode": "aggressive"
    },
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 14.46750000026077,
        "byKind": {
          "minor": 4,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8985704945870092,
        "activeMs": 1.199717499999495,
        "idleMs": 0.13542259999999998
      },
      "eventLoopDelay": {
        "minMs": 19.103744,
        "maxMs": 167.116799,
        "meanMs": 23.78029403773585,
        "stdMs": 20.098318679632673,
        "p50Ms": 20.004863,
        "p99Ms": 31.997951
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 13076,
        "avgBuffersPerFlush": 12.387121443866626,
        "avgBytesPerFlush": 12733.960844294892,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 13074,
        "batchWritevBuffers": 161972,
        "batchWritevBytes": 166507216,
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
        "totalFlushes": 6496,
        "totalBytes": 73591436,
        "backpressureEvents": 12990,
        "availableTokens": 167772.16,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772223866013,
            "size": 15
          },
          {
            "timestamp": 1772223866013,
            "size": 12
          },
          {
            "timestamp": 1772223866013,
            "size": 11
          },
          {
            "timestamp": 1772223866013,
            "size": 15
          },
          {
            "timestamp": 1772223866013,
            "size": 12
          },
          {
            "timestamp": 1772223866013,
            "size": 11
          },
          {
            "timestamp": 1772223866013,
            "size": 15
          },
          {
            "timestamp": 1772223866013,
            "size": 10
          },
          {
            "timestamp": 1772223866013,
            "size": 11
          },
          {
            "timestamp": 1772223866013,
            "size": 15
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 15,
          "flushIntervalAvgMs": 0.02573197410058038,
          "bytesPerFlushAvg": 8939.320183423022,
          "eluIdleRatioAvg": 0.8889672125420601,
          "gcPauseMaxMs": 5.231140855780296e-13
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
        "totalFlushes": 13076,
        "totalBytes": 166509272,
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
        "lastFlushTimestamp": 1772223866013,
        "backpressureEvents": 12990,
        "lastBackpressureBytes": 2056,
        "lastBackpressureTimestamp": 1772223866013
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
        "avgMs": 1.4754770000000008,
        "minMs": 1.1989000000003216,
        "maxMs": 5.096600000000308
      },
      "heap": {
        "start": {
          "rss": 232296448,
          "heapTotal": 191295488,
          "heapUsed": 69716496,
          "external": 17326621,
          "arrayBuffers": 8538287
        },
        "end": {
          "rss": 280821760,
          "heapTotal": 194834432,
          "heapUsed": 67835760,
          "external": 15021417,
          "arrayBuffers": 6233083
        },
        "peakHeapUsed": 120048536,
        "peakRss": 276893696
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 853.1014999999998,
    "messagesReceived": 100003,
    "bytesReceived": 102403072,
    "framing": "length-prefixed",
    "msgsPerSec": 117222.86269570506,
    "mbPerSec": 114.47545185127447,
    "diagnostics": {
      "gc": {
        "count": 4,
        "durationMs": 5.889399999752641,
        "byKind": {
          "minor": 0,
          "incremental": 2,
          "major": 2
        }
      },
      "eventLoop": {
        "utilization": 0.8437538360540071,
        "activeMs": 0.8770648999992636,
        "idleMs": 0.16241470000000005
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 77.398015,
        "meanMs": 22.073157818181816,
        "stdMs": 8.819949239938762,
        "p50Ms": 20.021247,
        "p99Ms": 77.398015
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
        "avgMs": 0.6714409999999953,
        "minMs": 0.4916000000002896,
        "maxMs": 1.4385000000002037
      },
      "heap": {
        "start": {
          "rss": 297332736,
          "heapTotal": 194834432,
          "heapUsed": 70745568,
          "external": 20155753,
          "arrayBuffers": 11367419
        },
        "end": {
          "rss": 347054080,
          "heapTotal": 191557632,
          "heapUsed": 72333992,
          "external": 55007593,
          "arrayBuffers": 46219259
        },
        "peakHeapUsed": 72689592,
        "peakRss": 412753920
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
