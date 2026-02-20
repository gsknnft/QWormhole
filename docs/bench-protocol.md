// bench-protocol.md
# QWormhole Bench Protocol: Avoiding Measurement Illusions

## 1. Sender vs Receiver Accounting
- Always report both bytes/messages sent (sender-side) and bytes/messages acknowledged (receiver-side).
- Prefer receiver-verified throughput for true pipeline measurement.

## 2. Acked-Bytes Mode
- Implement an "acked-bytes" mode: sender only counts bytes/messages after receiver confirms receipt.
- Use explicit acks or application-level counters.

## 3. Multi-Stream and Backpressure Scenarios
- Run tests with:
  - Single stream (max throughput)
  - Multiple streams (realistic contention)
  - Induced backpressure (receiver slows or pauses)

## 4. Message Size and Distribution
- Log average, p95, and max message size for each run.
- Note if fixed or variable size.

## 5. Loopback vs Network
- Always record whether test is loopback (localhost), LAN, or WAN.
- Note MTU and kernel/network stack details if possible.

## 6. Flush Cadence and Batching
- Log batch size (bytes/messages) and flush interval for each run.
- Record event loop jitter and GC pauses.

## 7. Failure/Collapse Detection
- Mark runs where event loop stalls, GC storms, or buffer runaway occurs.
- Record time to collapse if it happens.

## 8. Sample Output Schema
```json
{
  "mode": "MACRO_BATCH",
  "loopback": true,
  "messageSize": { "avg": 1024, "p95": 2048, "max": 4096 },
  "bytesSent": 100000000,
  "bytesAcked": 99900000,
  "messagesSent": 100000,
  "messagesAcked": 99900,
  "batchSize": 65536,
  "flushIntervalMs": 2,
  "eventLoopJitterMs": 3.2,
  "gcPauseMs": 1.1,
  "collapse": false
}
```

---

**Use this protocol to ensure your benchmarks reflect real, coherent pipeline performance—not measurement artifacts.**
