# QWormhole Bench Report

Generated: 2026-03-01T14:47:30.289Z

## Environment

```json
{
  "QWORMHOLE_BENCH_MESSAGES": "100000",
  "QWORMHOLE_BENCH_CLIENTS": "1"
}
```

## Summary

| Scenario | Server | Client | Clients | Runs | Rep | Duration (ms) | Dur Avg | Messages | Bytes | Msg/s | Msg/s Avg | Best | Worst | MB/s | Framing | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | ts | ts | 1 | 7 | median | 945.44 | 962.52 | 100000 | 102400000 | 105771 | 104107 | 110060 | 96285 | 103.29 | length-prefixed | ok |
| ts-server+native-lws | ts | native-lws | 1 | 7 | median | 973.34 | 986.26 | 100006 | 102406144 | 102746 | 101493 | 105123 | 96219 | 100.34 | length-prefixed | ok |
| ts-server+native-libsocket | ts | native-libsocket | 1 | 1 | first | - | - | 0 | 0 | - | - | - | - | - | length-prefixed | skipped |
| native-server(lws)+ts | native-lws | ts | 1 | 7 | median | 1217.42 | 1202.77 | 100000 | 102400000 | 82141 | 83321 | 89464 | 77762 | 80.22 | length-prefixed | ok |
| native-server(lws)+native-lws | native-lws | native-lws | 1 | 7 | median | 928.38 | 931.53 | 100000 | 102400000 | 107714 | 107495 | 113283 | 101775 | 105.19 | length-prefixed | ok |
| native-server(lws)+native-libsocket | native-lws | native-libsocket | 1 | 1 | first | - | - | 0 | 0 | - | - | - | - | - | length-prefixed | skipped |

## Diagnostics

| Scenario | GC | GC ms | ELU% | BP | Drain | MaxQueued | Flushes | AvgBuf | AvgKB | MaxBuf | MaxKB | WV | SM | Gov | tSNI | tSPI | tMeta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ts-server+ts | 6 | 19.34 | 89.21 | 0 | 0 | 0 | 19682 | 5.73 | 5.75 | 30 | 30.12 | 19680 | 0 | - | off | off | off |
| ts-server+native-lws | 8 | 13.08 | 76.14 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |
| native-server(lws)+ts | 5 | 16.23 | 90.05 | 0 | 0 | 0 | 13071 | 12.38 | 12.43 | 48 | 48.19 | 13069 | 0 | - | off | off | off |
| native-server(lws)+native-lws | 4 | 5.11 | 80.10 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 0 | 0.00 | 0 | 1642 | - | off | off | off |

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
    "durationMs": 945.4371000000001,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 105771.1824509531,
    "mbPerSec": 103.29217036225889,
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
        "durationMs": 19.343800008296967,
        "byKind": {
          "incremental": 0,
          "major": 0,
          "minor": 6
        }
      },
      "eventLoop": {
        "utilization": 0.8920702294094538,
        "activeMs": 1.0079729000054836,
        "idleMs": 0.12195260000000002
      },
      "eventLoopDelay": {
        "minMs": 19.382272,
        "maxMs": 202.506239,
        "meanMs": 25.080366545454545,
        "stdMs": 27.12271879081426,
        "p50Ms": 20.152319,
        "p99Ms": 202.506239
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
        "availableTokens": 67108.864,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": false
        },
        "sliceHistory": [
          {
            "timestamp": 1772376419747,
            "size": 4
          },
          {
            "timestamp": 1772376419748,
            "size": 6
          },
          {
            "timestamp": 1772376419748,
            "size": 5
          },
          {
            "timestamp": 1772376419748,
            "size": 7
          },
          {
            "timestamp": 1772376419748,
            "size": 5
          },
          {
            "timestamp": 1772376419748,
            "size": 4
          },
          {
            "timestamp": 1772376419748,
            "size": 6
          },
          {
            "timestamp": 1772376419748,
            "size": 5
          },
          {
            "timestamp": 1772376419748,
            "size": 7
          },
          {
            "timestamp": 1772376419748,
            "size": 6
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "guarded",
          "sliceSize": 6,
          "flushIntervalAvgMs": 0.032405052164406235,
          "bytesPerFlushAvg": 5353.027494497436,
          "eluIdleRatioAvg": 0.8810524889688602,
          "gcPauseMaxMs": 1.0243748963010251e-15
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
        "lastFlushTimestamp": 1772376419748,
        "backpressureEvents": 9843,
        "lastBackpressureBytes": 16448,
        "lastBackpressureTimestamp": 1772376419748
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
        "avgMs": 1.8273090000000003,
        "minMs": 1.195299999999861,
        "maxMs": 6.935199999999895
      },
      "heap": {
        "start": {
          "rss": 306761728,
          "heapTotal": 237645824,
          "heapUsed": 107667000,
          "external": 13495073,
          "arrayBuffers": 4699999
        },
        "end": {
          "rss": 355995648,
          "heapTotal": 257265664,
          "heapUsed": 156315720,
          "external": 43254845,
          "arrayBuffers": 34459771
        },
        "peakHeapUsed": 169638992,
        "peakRss": 310128640
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 105771.1824509531,
        "avg": 104107.23802609727,
        "best": 110060.47382794952,
        "worst": 96284.83982679897
      },
      "durationMs": {
        "median": 945.4371000000001,
        "avg": 962.5159571428572,
        "best": 1038.5851000000002,
        "worst": 908.5913999999998
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
    "durationMs": 973.3364999999994,
    "messagesReceived": 100006,
    "bytesReceived": 102406144,
    "framing": "length-prefixed",
    "msgsPerSec": 102745.55613603318,
    "mbPerSec": 100.3374571640949,
    "diagnostics": {
      "gc": {
        "count": 8,
        "durationMs": 13.078500092029572,
        "byKind": {
          "incremental": 4,
          "major": 4,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.7614110976454225,
        "activeMs": 0.8596561999913683,
        "idleMs": 0.2693741
      },
      "eventLoopDelay": {
        "minMs": 19.480576,
        "maxMs": 72.286207,
        "meanMs": 21.70044416,
        "stdMs": 7.801718711989721,
        "p50Ms": 20.004863,
        "p99Ms": 72.286207
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
        "avgMs": 0.5918810000000121,
        "minMs": 0.44760000000133005,
        "maxMs": 1.3703999999997905
      },
      "heap": {
        "start": {
          "rss": 373723136,
          "heapTotal": 192626688,
          "heapUsed": 60049984,
          "external": 27605457,
          "arrayBuffers": 18817123
        },
        "end": {
          "rss": 380612608,
          "heapTotal": 192364544,
          "heapUsed": 57371424,
          "external": 18869329,
          "arrayBuffers": 10080995
        },
        "peakHeapUsed": 62017168,
        "peakRss": 489443328
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 102745.55613603318,
        "avg": 101492.71579020737,
        "best": 105123.01651958644,
        "worst": 96219.48622837372
      },
      "durationMs": {
        "median": 973.3364999999994,
        "avg": 986.2587571428573,
        "best": 1039.3217000000004,
        "worst": 951.2950000000001
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
    "durationMs": 1217.4157000000014,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 82141.21109165906,
    "mbPerSec": 80.2160264566983,
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
        "count": 5,
        "durationMs": 16.227200031280518,
        "byKind": {
          "incremental": 0,
          "major": 0,
          "minor": 5
        }
      },
      "eventLoop": {
        "utilization": 0.9004852499860067,
        "activeMs": 1.2827995000074406,
        "idleMs": 0.1417651999999998
      },
      "eventLoopDelay": {
        "minMs": 19.218432,
        "maxMs": 183.238655,
        "meanMs": 23.526868610169494,
        "stdMs": 21.08398345708043,
        "p50Ms": 20.168703,
        "p99Ms": 32.178175
      },
      "backpressure": {
        "events": 0,
        "drainEvents": 0,
        "maxQueuedBytes": 0
      },
      "batching": {
        "flushes": 13071,
        "avgBuffersPerFlush": 12.380613572029684,
        "avgBytesPerFlush": 12727.270752046516,
        "maxBuffers": 48,
        "maxBytes": 49344
      },
      "transportCalls": {
        "batchWritevCalls": 13069,
        "batchWritevBuffers": 161825,
        "batchWritevBytes": 166356100,
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
        "totalFlushes": 6490,
        "totalBytes": 73534896,
        "backpressureEvents": 12978,
        "availableTokens": 117440.512,
        "policy": {
          "coherence": 0.9,
          "entropyVelocity": 0.1,
          "preferredBatchSize": 64,
          "peerIsNative": true
        },
        "sliceHistory": [
          {
            "timestamp": 1772376438198,
            "size": 12
          },
          {
            "timestamp": 1772376438198,
            "size": 11
          },
          {
            "timestamp": 1772376438198,
            "size": 15
          },
          {
            "timestamp": 1772376438198,
            "size": 10
          },
          {
            "timestamp": 1772376438198,
            "size": 11
          },
          {
            "timestamp": 1772376438198,
            "size": 15
          },
          {
            "timestamp": 1772376438198,
            "size": 12
          },
          {
            "timestamp": 1772376438198,
            "size": 11
          },
          {
            "timestamp": 1772376438198,
            "size": 15
          },
          {
            "timestamp": 1772376438198,
            "size": 10
          }
        ],
        "flushHistory": [],
        "backpressureHistory": [],
        "adaptive": {
          "mode": "aggressive",
          "sliceSize": 10,
          "flushIntervalAvgMs": 0.02986747480088075,
          "bytesPerFlushAvg": 8791.953662664057,
          "eluIdleRatioAvg": 0.9722287290248226,
          "gcPauseMaxMs": 7.293509848875284e-51
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
        "totalFlushes": 13071,
        "totalBytes": 166358156,
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
        "lastFlushTimestamp": 1772376438198,
        "backpressureEvents": 12978,
        "lastBackpressureBytes": 10280,
        "lastBackpressureTimestamp": 1772376438198
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
        "avgMs": 1.4333320000000094,
        "minMs": 1.1934999999975844,
        "maxMs": 4.270000000000437
      },
      "heap": {
        "start": {
          "rss": 482017280,
          "heapTotal": 207568896,
          "heapUsed": 85345384,
          "external": 49725801,
          "arrayBuffers": 40937467
        },
        "end": {
          "rss": 454549504,
          "heapTotal": 208896000,
          "heapUsed": 122511864,
          "external": 33804649,
          "arrayBuffers": 25016315
        },
        "peakHeapUsed": 122964120,
        "peakRss": 483000320
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 82141.21109165906,
        "avg": 83321.47646733493,
        "best": 89463.65910123193,
        "worst": 77762.06379273116
      },
      "durationMs": {
        "median": 1217.4157000000014,
        "avg": 1202.765928571429,
        "best": 1285.9740999999995,
        "worst": 1117.7723000000005
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
    "durationMs": 928.3840000000018,
    "messagesReceived": 100000,
    "bytesReceived": 102400000,
    "framing": "length-prefixed",
    "msgsPerSec": 107714.04935888576,
    "mbPerSec": 105.18950132703688,
    "diagnostics": {
      "gc": {
        "count": 4,
        "durationMs": 5.109400004148483,
        "byKind": {
          "incremental": 2,
          "major": 2,
          "minor": 0
        }
      },
      "eventLoop": {
        "utilization": 0.8009655241998614,
        "activeMs": 0.8670950000098238,
        "idleMs": 0.21546720000000005
      },
      "eventLoopDelay": {
        "minMs": 19.08736,
        "maxMs": 55.574527,
        "meanMs": 22.209906382978723,
        "stdMs": 6.624604778284839,
        "p50Ms": 20.152319,
        "p99Ms": 55.574527
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
        "avgMs": 0.41268000000000027,
        "minMs": 0.2793000000019674,
        "maxMs": 0.9326000000000931
      },
      "heap": {
        "start": {
          "rss": 483127296,
          "heapTotal": 193150976,
          "heapUsed": 56963472,
          "external": 13970793,
          "arrayBuffers": 5182459
        },
        "end": {
          "rss": 515010560,
          "heapTotal": 193413120,
          "heapUsed": 72262104,
          "external": 49261929,
          "arrayBuffers": 40473595
        },
        "peakHeapUsed": 58929800,
        "peakRss": 513101824
      },
      "coherenceTrace": []
    },
    "repeatStats": {
      "runs": 7,
      "successfulRuns": 7,
      "skippedRuns": 0,
      "representative": "median",
      "msgsPerSec": {
        "median": 107714.04935888576,
        "avg": 107494.74881073483,
        "best": 113282.89073342594,
        "worst": 101775.0380842189
      },
      "durationMs": {
        "median": 928.3840000000018,
        "avg": 931.531385714287,
        "best": 982.5592000000033,
        "worst": 882.7988000000041
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
