# QWormhole Bench Report

Generated: 2026-02-27T19:49:28.561Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 880.99 | 100000 | 102400000 | 113509 | 110.85 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 871.39 | 100003 | 102403072 | 114763 | 112.07 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1204.60 | 100000 | 102400000 | 83015 | 81.07 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1096.05 | 100000 | 102400000 | 91236 | 89.10 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| net-server+net | net | net | 1584.80 | 100000 | 102400000 | 63099 | 61.62 | length-prefixed | ok |
| ws-server+ws | ws | ws | 1695.30 | 100000 | 102400000 | 58986 | 57.60 | none | ok |
| uwebsockets-server+ws | uwebsockets | ws | 1021.37 | 100000 | 102400000 | 97908 | 95.61 | none | ok |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 27 | 53.71 | 88.04 | 0 | 0 | 0 | 19679 | 5.73 | 5.75 | 30 | 30.12 | 0 | 0 | - | off | off | off |
| ts-server+native-lws | 16 | 19.57 | 76.98 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | off | off | off |
| native-server(lws)+ts | 11 | 27.21 | 90.66 | 0 | 0 | 0 | 10851 | 13.47 | 13.52 | 48 | 48.19 | 0 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 6 | 13.18 | 81.79 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | off | off | off |

## Transport Coherence

- Transport coherence sampling: disabled in this raw lane. Run `bench:compare:structure` for tSNI / tSPI / tMeta.
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
    "durationMs": 880.9888000000001,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 113508.82099749734,
    "mbPerSec": 110.8484580053685,
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
        "durationMs": 53.70669999951497,
        "byKind": {
          "incremental": 9,
          "major": 9,
          "minor": 9
        }
      },
      "eventLoop": {
        "utilization": 0.8804288087309778,
        "activeMs": 0.9856824000002474,
        "idleMs": 0.1338657
      },
      "eventLoopDelay": {
        "minMs": 19.202048,
        "maxMs": 194.904063,
        "meanMs": 26.146266536585365,
        "stdMs": 27.10907413447862,
        "p50Ms": 20.135935,
        "p99Ms": 194.904063
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
        "availableTokens": 150994.944,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772221759945,
            "size": 4
          },
          {
            "timestamp": 1772221759945,
            "size": 6
          },
          {
            "timestamp": 1772221759945,
            "size": 5
          },
          {
            "timestamp": 1772221759945,
            "size": 7
          },
          {
            "timestamp": 1772221759945,
            "size": 5
          },
          {
            "timestamp": 1772221759945,
            "size": 4
          },
          {
            "timestamp": 1772221759945,
            "size": 6
          },
          {
            "timestamp": 1772221759945,
            "size": 5
          },
          {
            "timestamp": 1772221759945,
            "size": 7
          },
          {
            "timestamp": 1772221759945,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.017268811539656974,
          "bytesPerFlushAvg": 5611.884368121796,
          "eluIdleRatioAvg": 0.8665923759101721,
          "gcPauseMaxMs": 4.670533599035122e-8
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
        "lastFlushTimestamp": 1772221759945,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772221759945
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
        "avgMs": 1.7268700000000012,
        "minMs": 1.2391999999999825,
        "maxMs": 7.494899999999916
      },
      "heap": {
        "start": {
          "rss": 214294528,
          "heapTotal": 121921536,
          "heapUsed": 64755016,
          "external": 16133891,
          "arrayBuffers": 7338865
        },
        "end": {
          "rss": 250298368,
          "heapTotal": 128344064,
          "heapUsed": 70401512,
          "external": 25041293,
          "arrayBuffers": 16252967
        },
        "peakHeapUsed": 90856768,
        "peakRss": 234295296
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 871.3863000000001,
    "messagesReceived": 100003,
    "bytesReceived": 102403072,
    "framing": "length-prefixed",
    "msgsPerSec": 114763.10793502259,
    "mbPerSec": 112.0733475927955,
    "diagnostics": {
      "gc": {
        "count": 16,
        "durationMs": 19.57390000158921,
        "byKind": {
          "incremental": 8,
          "major": 8,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7698395315498859,
        "activeMs": 0.814391299999892,
        "idleMs": 0.24348020000000004
      },
      "eventLoopDelay": {
        "minMs": 19.054592,
        "maxMs": 77.070335,
        "meanMs": 21.766326044444444,
        "stdMs": 8.575276054193056,
        "p50Ms": 20.021247,
        "p99Ms": 77.070335
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
        "avgMs": 0.6352489999999988,
        "minMs": 0.44830000000001746,
        "maxMs": 1.6630999999997584
      },
      "heap": {
        "start": {
          "rss": 274288640,
          "heapTotal": 128507904,
          "heapUsed": 75018784,
          "external": 36190961,
          "arrayBuffers": 27402635
        },
        "end": {
          "rss": 259743744,
          "heapTotal": 123658240,
          "heapUsed": 52937888,
          "external": 12747817,
          "arrayBuffers": 3959491
        },
        "peakHeapUsed": 76941040,
        "peakRss": 391905280
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
    "durationMs": 1204.6046999999994,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 83014.78485016708,
    "mbPerSec": 81.06912583024129,
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
        "count": 11,
        "durationMs": 27.214999998919666,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 3
        }
      },
      "eventLoop": {
        "utilization": 0.90661504558468,
        "activeMs": 1.2977799999998547,
        "idleMs": 0.13367650000000003
      },
      "eventLoopDelay": {
        "minMs": 19.267584,
        "maxMs": 557.842431,
        "meanMs": 35.661500631578946,
        "stdMs": 85.88083379742469,
        "p50Ms": 20.185087,
        "p99Ms": 557.842431
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 10851,
        "avgBuffersPerFlush": 13.467053727767025,
        "avgBytesPerFlush": 13844.131232144502,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "clientFlow": {
        "currentSliceSize": 16,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 5257,
        "totalBytes": 65556588,
        "backpressureEvents": 9840,
        "availableTokens": 67108.864,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772221762437,
            "size": 16
          },
          {
            "timestamp": 1772221762437,
            "size": 13
          },
          {
            "timestamp": 1772221762437,
            "size": 12
          },
          {
            "timestamp": 1772221762437,
            "size": 16
          },
          {
            "timestamp": 1772221762437,
            "size": 13
          },
          {
            "timestamp": 1772221762437,
            "size": 12
          },
          {
            "timestamp": 1772221762437,
            "size": 16
          },
          {
            "timestamp": 1772221762437,
            "size": 11
          },
          {
            "timestamp": 1772221762437,
            "size": 12
          },
          {
            "timestamp": 1772221762437,
            "size": 16
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 16,
          "flushIntervalAvgMs": 0.035921135647502093,
          "bytesPerFlushAvg": 11135.128183423023,
          "eluIdleRatioAvg": 0.9493571023326364,
          "gcPauseMaxMs": 9.012847099536459e-23
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
        "totalFlushes": 10851,
        "totalBytes": 150222668,
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
        "lastFlushTimestamp": 1772221762437,
        "backpressureEvents": 9840,
        "lastBackpressureBytes": 6168,
        "lastBackpressureTimestamp": 1772221762437
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
        "avgMs": 1.63096,
        "minMs": 1.3188000000000102,
        "maxMs": 8.379700000000412
      },
      "heap": {
        "start": {
          "rss": 261312512,
          "heapTotal": 123658240,
          "heapUsed": 70032440,
          "external": 18015273,
          "arrayBuffers": 9226947
        },
        "end": {
          "rss": 333852672,
          "heapTotal": 193519616,
          "heapUsed": 76797680,
          "external": 21779817,
          "arrayBuffers": 12991491
        },
        "peakHeapUsed": 121613888,
        "peakRss": 287002624
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 1096.0533999999998,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 91236.43063376294,
    "mbPerSec": 89.09807679078412,
    "diagnostics": {
      "gc": {
        "count": 6,
        "durationMs": 13.179100000299513,
        "byKind": {
          "incremental": 3,
          "major": 3,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8179068632183517,
        "activeMs": 1.0547182999999032,
        "idleMs": 0.2348151999999999
      },
      "eventLoopDelay": {
        "minMs": 19.054592,
        "maxMs": 107.806719,
        "meanMs": 22.57229748148148,
        "stdMs": 12.095790455132859,
        "p50Ms": 20.004863,
        "p99Ms": 36.667391
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
        "avgMs": 0.8409249999999975,
        "minMs": 0.5974999999998545,
        "maxMs": 1.7934999999997672
      },
      "heap": {
        "start": {
          "rss": 347607040,
          "heapTotal": 192077824,
          "heapUsed": 52263696,
          "external": 26899817,
          "arrayBuffers": 16958467
        },
        "end": {
          "rss": 391852032,
          "heapTotal": 191291392,
          "heapUsed": 73778168,
          "external": 57997673,
          "arrayBuffers": 49209347
        },
        "peakHeapUsed": 54175144,
        "peakRss": 443842560
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
    "durationMs": 1584.8022,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 63099.35713112967,
    "mbPerSec": 61.62046594836882
  },
  {
    "id": "ws-server+ws",
    "serverMode": "ws",
    "clientMode": "ws",
    "durationMs": 1695.3040999999994,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "none",
    "msgsPerSec": 58986.467383639334,
    "mbPerSec": 57.60397205433529
  },
  {
    "id": "uwebsockets-server+ws",
    "serverMode": "uwebsockets",
    "clientMode": "ws",
    "durationMs": 1021.3703999999998,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "none",
    "msgsPerSec": 97907.67384682385,
    "mbPerSec": 95.61296274103891
  }
]
```
