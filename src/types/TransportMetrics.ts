// TransportMetrics.ts
// ASIS-aligned, transport-agnostic metrics for QWormhole coherence control

export interface TransportMetrics {
  // Throughput metrics
  bytesSent: number; // Total bytes sent (sender-side)
  bytesAcked: number; // Total bytes acknowledged (receiver-side)
  messagesSent: number; // Total messages sent
  messagesAcked: number; // Total messages acknowledged

  // Batching and framing
  batchSize: number; // Current batch size (bytes)
  batchMessages: number; // Current batch size (messages)
  batchIntervalMs: number; // Time between flushes (ms)

  // Buffering and backpressure
  bufferedBytes: number; // Bytes currently buffered (not yet flushed)
  bufferedMessages: number; // Messages currently buffered
  socketBackpressure: boolean; // True if socket.write() returned false

  // Event loop and GC
  eventLoopJitterMs: number; // Recent event loop jitter (ms, e.g. p95)
  gcPauseMs: number; // Recent GC pause (ms, e.g. p95)

  // Reserve and margin
  marginEstimate: number; // Coherence margin estimate (unitless, e.g. 0-1)
  reserveEstimate: number; // Reserve (bytes or messages)

  // Timing
  rttMs?: number; // Round-trip time (if available)
  timestamp: number; // Wall-clock timestamp (ms)
}

// Example: update metrics on each flush or telemetry tick
// const metrics: TransportMetrics = { ... };
