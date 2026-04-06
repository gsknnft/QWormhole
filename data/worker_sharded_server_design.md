# Worker-Thread Sharded QWormhole Server

## Goal

Scale QWormhole beyond the current single-event-loop ceiling while keeping:

- binary framed transport semantics
- stable batching and backpressure behavior
- transport telemetry and coherence sidecar integration
- predictable connection ownership

## Current Constraints

QWormhole does not currently expose the two hooks a clean sharded runtime needs:

1. `QWormholeServer` owns its own listener
2. `QWormholeServer` cannot adopt an already-accepted socket

Relevant current behavior:

- `packages/QWormhole/src/server/index.ts`
  - `listen()` binds internally
  - `handleConnection(socket)` is private
  - `createConnection(socket)` is private
- `packages/QWormhole/src/core/factory.ts`
  - `createQWormholeServer()` returns a ready-to-listen server, not an attachable connection handler

That means a true worker-thread sharded design is not a thin wrapper around the current API. It needs one of these enabling changes:

1. `reusePort` listener support so each worker can bind directly
2. socket adoption support so a front-door router can pass accepted connections into a worker-owned QWormhole server

## Recommended Architecture

### Preferred path: reuse-port worker shards

This is the cleanest worker-thread model if QWormhole adds listener options for `reusePort`.

Topology:

- main thread:
  - starts N workers
  - coordinates lifecycle
  - aggregates telemetry
  - does not own accepted sockets
- each worker:
  - creates its own `QWormholeServer`
  - listens on the same host/port with `reusePort`
  - owns its own client map, flow controllers, framers, and coherence adapters

Why this is preferred:

- no socket handoff layer
- no extra front-door copy/handoff cost
- ownership is clear
- kernel distributes incoming connections

Required QWormhole surface change:

- `QWormholeServerOptions`
  - add `reusePort?: boolean`
- `QWormholeServer.listen()`
  - pass `reusePort` through to `net.Server.listen`
- native server backends
  - either support the same option or be explicitly unsupported in sharded mode initially

### Secondary path: front-door router + attachable workers

If `reusePort` is not acceptable, the next design is a main-thread acceptor that assigns connections to workers.

Topology:

- main thread:
  - accepts raw TCP sockets
  - chooses shard
  - transfers/adopts socket into a worker
- worker:
  - owns a QWormhole connection registry
  - adopts the accepted socket
  - runs normal QWormhole connection lifecycle

Required QWormhole surface change:

1. expose an attach/adopt API
   - `QWormholeServer.attachSocket(socket: net.Socket): QWormholeServerConnection`
   - or extract a `QWormholeConnectionHost`
2. make `handleConnection` / `createConnection` reusable by a worker host

This is more invasive than `reusePort`.

## Shard Selection

Use deterministic sticky routing per connection.

Recommended order:

1. explicit routing key from handshake tags if present
2. remote address + remote port hash
3. round-robin fallback

Why:

- keeps connection-local state stable
- prevents cross-shard oscillation
- makes cross-shard pub/sub the exception instead of the default

## Cross-Shard Semantics

Each worker should be authoritative only for its own live connections.

Main thread responsibilities:

- shard registry
- telemetry aggregation
- broadcast fanout control
- cluster health

Worker responsibilities:

- connection lifecycle
- per-connection batching and flow control
- local broadcast
- local coherence sampling

Cross-shard operations:

1. `broadcast(payload)`
   - main thread sends broadcast command to all workers
2. `sendTo(connectionId, payload)`
   - main thread consults connection-to-shard map
3. telemetry snapshots
   - workers emit periodic summaries
4. coherence summaries
   - workers publish low-rate summaries only, not hot-path frame events

## Telemetry Contract

Worker telemetry should be aggregated, not raw-streamed.

Per worker:

- `connections`
- `bytesIn`
- `bytesOut`
- `msgsIn`
- `msgsOut`
- `flushes`
- `backpressureEvents`
- `drainEvents`
- `eventLoopUtilization`
- `heapUsed`
- optional transport coherence summary

Main thread:

- totals
- per-worker breakdown
- worst-worker p99 style values
- shard imbalance indicator

## Native Backends

Initial sharded target should be TS server first.

Reason:

- TS server is already strong
- current native paths are tuned but more operationally sensitive
- worker sharding already increases concurrency materially without mixing in native backend complexity

Recommended rollout:

1. TS server sharding first
2. benchmark and stabilize
3. then evaluate native-lws worker shards

## Phased Implementation Plan

### Phase 1: shard-ready server surface

Minimal required code changes:

1. `QWormholeServerOptions`
   - add `reusePort?: boolean`
2. `QWormholeServer.listen()`
   - honor `reusePort`
3. `createQWormholeServer()`
   - pass through shard-related options cleanly

Deliverable:

- multiple workers can bind the same port with `reusePort`

### Phase 2: shard coordinator

New module:

- `packages/QWormhole/src/sharding/worker-sharded-server.ts`

Responsibilities:

- spawn workers
- propagate config
- collect worker telemetry
- expose unified `broadcast`, `shutdown`, `stats`

Suggested public shape:

```ts
type WorkerShardedServerOptions<T> = QWormholeServerOptions<T> & {
  workers?: number;
  reusePort?: boolean;
  telemetryIntervalMs?: number;
  routing?: "sticky-ip" | "round-robin";
};

type WorkerShardedServer<T> = {
  listen(): Promise<void>;
  shutdown(gracefulMs?: number): Promise<void>;
  broadcast(payload: Payload): void;
  getStats(): WorkerShardStats;
};
```

### Phase 3: cross-shard control plane

Add:

- worker command bus
- connection ownership map
- targeted send routing
- shard health and imbalance reporting

### Phase 4: optional attach-socket path

Only if `reusePort` is not enough or you need a smart ingress router.

## Benchmark Plan

The benchmark runner now supports concurrency through:

- `QWORMHOLE_BENCH_CLIENTS`

New report entry points:

- `pnpm --filter @gsknnft/qwormhole run bench:core:multi:report`
- `pnpm --filter @gsknnft/qwormhole run bench:core:highconcurrency:report`
- `pnpm --filter @gsknnft/qwormhole run bench:compare:multi:report`
- `pnpm --filter @gsknnft/qwormhole run bench:compare:highconcurrency:report`

Defaults:

- multi:
  - `16` clients
  - `160000` messages
- high concurrency:
  - `64` clients
  - `320000` messages

These are still single-process benchmarks. They are the correct gate before adding worker sharding, because they tell you:

- whether batching remains stable with many concurrent clients
- whether p99 grows under concurrency
- whether one path collapses before sharding is even introduced

## Decision

The pragmatic sequence is:

1. keep `balanced` as default transport tuning
2. use the new multi-client/high-concurrency bench modes as the concurrency regression gate
3. implement shard-ready listener support with `reusePort`
4. build a TS-server-first `WorkerShardedServer`
5. only then evaluate native server sharding

This keeps the next step implementable and avoids inventing a worker-thread abstraction that the current QWormhole server cannot actually support.
