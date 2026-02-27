# QWormhole Bench Report

Generated: 2026-02-27T18:02:20.934Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000"
}
```

## Summary

| Scenario | Server | Client | Duration (ms) | Messages | Bytes | Msg/s | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 872.36 | 100000 | 102400000 | 114631 | 111.94 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 883.51 | 100002 | 102402048 | 113187 | 110.53 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1015.50 | 100000 | 102400000 | 98473 | 96.17 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 776.28 | 100000 | 102400000 | 128820 | 125.80 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | - | 0 | 0 | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 29 | 45.95 | 88.47 | 0 | 0 | 0 | 19679 | 5.73 | 5.75 | 30 | 30.12 | 0 | 0 | - | - | - | - |
| ts-server+native-lws | 17 | 16.18 | 78.73 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |
| native-server(lws)+ts | 12 | 20.02 | 90.59 | 0 | 0 | 0 | 13120 | 10.62 | 10.66 | 32 | 32.13 | 0 | 0 | - | - | - | - |
| native-server(lws)+native-lws | 8 | 9.78 | 84.05 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 0 | - | - | - | - |

## Transport Coherence

- Best transport persistence: unavailable
- Fastest measured path: unavailable
- Throughput leader and transport-stability leader are aligned in this run.

| Rank | Scenario | Msg/s | tSNI | tSPI | tMeta | Health |
| --- | --- | --- | --- | --- | --- | --- |

## Raw JSON

```json
[
  {
    "id": "ts-server+ts",
    "serverMode": "ts",
    "clientMode": "ts",
    "durationMs": 872.3624,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 114631.2587520966,
    "mbPerSec": 111.94458862509434,
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
        "count": 29,
        "durationMs": 45.94610008597374,
        "byKind": {
          "incremental": 10,
          "major": 10,
          "minor": 9
        }
      },
      "eventLoop": {
        "utilization": 0.8847068838456176,
        "activeMs": 0.9640374000095845,
        "idleMs": 0.1256313
      },
      "eventLoopDelay": {
        "minMs": 19.365888,
        "maxMs": 198.967295,
        "meanMs": 25.68691512195122,
        "stdMs": 27.52005120176002,
        "p50Ms": 20.217855,
        "p99Ms": 198.967295
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
        "availableTokens": 50331.648,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772215337682,
            "size": 4
          },
          {
            "timestamp": 1772215337682,
            "size": 6
          },
          {
            "timestamp": 1772215337682,
            "size": 5
          },
          {
            "timestamp": 1772215337682,
            "size": 7
          },
          {
            "timestamp": 1772215337682,
            "size": 5
          },
          {
            "timestamp": 1772215337682,
            "size": 4
          },
          {
            "timestamp": 1772215337682,
            "size": 6
          },
          {
            "timestamp": 1772215337682,
            "size": 5
          },
          {
            "timestamp": 1772215337682,
            "size": 7
          },
          {
            "timestamp": 1772215337682,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.016333945855870585,
          "bytesPerFlushAvg": 5611.884368121796,
          "eluIdleRatioAvg": 0.8711468017176274,
          "gcPauseMaxMs": 1.06457953957658e-9
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
        "lastFlushTimestamp": 1772215337682,
        "backpressureEvents": 9842,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772215337682
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
        "avgMs": 1.7891020000000004,
        "minMs": 1.0287000000000717,
        "maxMs": 7.883899999999812
      },
      "heap": {
        "start": {
          "rss": 198041600,
          "heapTotal": 122437632,
          "heapUsed": 63467288,
          "external": 15161135,
          "arrayBuffers": 6367004
        },
        "end": {
          "rss": 236478464,
          "heapTotal": 125714432,
          "heapUsed": 72800328,
          "external": 28901078,
          "arrayBuffers": 20113647
        },
        "peakHeapUsed": 90992472,
        "peakRss": 217731072
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "ts-server+native-lws",
    "serverMode": "ts",
    "clientMode": "native-lws",
    "durationMs": 883.5138999999999,
    "messagesReceived": 100002,
    "bytesReceived": 102402048,
    "framing": "length-prefixed",
    "msgsPerSec": 113186.67425605869,
    "mbPerSec": 110.53386157818231,
    "diagnostics": {
      "gc": {
        "count": 17,
        "durationMs": 16.17689996957779,
        "byKind": {
          "incremental": 8,
          "major": 8,
          "minor": 1
        }
      },
      "eventLoop": {
        "utilization": 0.7873154373969072,
        "activeMs": 0.8139551999988555,
        "idleMs": 0.21988100000000002
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 75.563007,
        "meanMs": 21.80837831111111,
        "stdMs": 8.562786715206816,
        "p50Ms": 20.004863,
        "p99Ms": 75.563007
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
        "avgMs": 0.5122740000000021,
        "minMs": 0.41390000000001237,
        "maxMs": 0.9628999999999905
      },
      "heap": {
        "start": {
          "rss": 262311936,
          "heapTotal": 125878272,
          "heapUsed": 78089592,
          "external": 40038670,
          "arrayBuffers": 31251239
        },
        "end": {
          "rss": 274411520,
          "heapTotal": 123650048,
          "heapUsed": 65861768,
          "external": 44046938,
          "arrayBuffers": 35259507
        },
        "peakHeapUsed": 80005864,
        "peakRss": 378687488
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
    "durationMs": 1015.5040000000004,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 98473.27041547839,
    "mbPerSec": 96.16530314011561,
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
        "count": 12,
        "durationMs": 20.019499987363815,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 4
        }
      },
      "eventLoop": {
        "utilization": 0.905907159987725,
        "activeMs": 1.0755235999939918,
        "idleMs": 0.11171019999999998
      },
      "eventLoopDelay": {
        "minMs": 19.08736,
        "maxMs": 705.691647,
        "meanMs": 54.39409980952381,
        "stdMs": 145.58447950080972,
        "p50Ms": 22.036479,
        "p99Ms": 705.691647
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 13120,
        "avgBuffersPerFlush": 10.620655487804878,
        "avgBytesPerFlush": 10918.033841463415,
        "maxBuffers": 32,
        "maxBytes": 32896
      },
      "clientFlow": {
        "currentSliceSize": 12,
        "effectiveRateBytesPerSec": 16777216,
        "totalFlushes": 4494,
        "totalBytes": 36973048,
        "backpressureEvents": 8939,
        "availableTokens": 524288,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772215339850,
            "size": 12
          },
          {
            "timestamp": 1772215339850,
            "size": 10
          },
          {
            "timestamp": 1772215339850,
            "size": 8
          },
          {
            "timestamp": 1772215339850,
            "size": 12
          },
          {
            "timestamp": 1772215339850,
            "size": 10
          },
          {
            "timestamp": 1772215339850,
            "size": 8
          },
          {
            "timestamp": 1772215339850,
            "size": 12
          },
          {
            "timestamp": 1772215339850,
            "size": 10
          },
          {
            "timestamp": 1772215339850,
            "size": 8
          },
          {
            "timestamp": 1772215339852,
            "size": 12
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 12,
          "flushIntervalAvgMs": 0.46587184685478866,
          "bytesPerFlushAvg": 8931.159969594662,
          "eluIdleRatioAvg": 0.9563071988364036,
          "gcPauseMaxMs": 0.01982648535926246
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
        "totalBytes": 143244604,
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
        "lastFlushTimestamp": 1772215339852,
        "backpressureEvents": 8939,
        "lastBackpressureBytes": 4112,
        "lastBackpressureTimestamp": 1772215339850
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
        "avgMs": 1.397145999999998,
        "minMs": 0.9820000000004256,
        "maxMs": 5.428600000000188
      },
      "heap": {
        "start": {
          "rss": 238448640,
          "heapTotal": 123912192,
          "heapUsed": 68241984,
          "external": 14264810,
          "arrayBuffers": 5477379
        },
        "end": {
          "rss": 362684416,
          "heapTotal": 192462848,
          "heapUsed": 77507424,
          "external": 58194410,
          "arrayBuffers": 49406979
        },
        "peakHeapUsed": 120841120,
        "peakRss": 266797056
      },
      "coherenceTrace": []
    }
  },
  {
    "id": "native-server(lws)+native-lws",
    "serverMode": "native-lws",
    "clientMode": "native-lws",
    "preferredServerBackend": "lws",
    "durationMs": 776.2783,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 128819.78022572576,
    "mbPerSec": 125.80056662668531,
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 9.784400016069412,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8405238980240035,
        "activeMs": 0.7619644999998095,
        "idleMs": 0.1445707
      },
      "eventLoopDelay": {
        "minMs": 19.185664,
        "maxMs": 78.118911,
        "meanMs": 22.32467035897436,
        "stdMs": 9.328425363034867,
        "p50Ms": 20.217855,
        "p99Ms": 78.118911
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
        "avgMs": 0.5898019999999997,
        "minMs": 0.3657999999995809,
        "maxMs": 0.9305000000003929
      },
      "heap": {
        "start": {
          "rss": 316469248,
          "heapTotal": 191545344,
          "heapUsed": 55169592,
          "external": 14109162,
          "arrayBuffers": 5321731
        },
        "end": {
          "rss": 386105344,
          "heapTotal": 190758912,
          "heapUsed": 77533952,
          "external": 66592234,
          "arrayBuffers": 57804803
        },
        "peakHeapUsed": 57077128,
        "peakRss": 433192960
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
