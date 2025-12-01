# SCP Shards

## . Overview

State in SCP is treated not as a blob, but as a dynamic expression of coherence.
Agents exchange state in three forms:

Snapshot — a full, canonical representation

Delta — CRDT-like changes

Negotiated Merge — when state must be reconciled under conflicting truths

## Shard Structure
```json
{
  "id": "shardId",
  "root": "SID",
  "capabilities": "CapSet",
  "routingHints": ["..."],
  "stateHash": "H(state)"
}
```

## Operations
- Split
- Merge
- Authority negotiation
- State delta
- Intent routing

## Example
```json
{
  "id": "shard-001",
  "root": "0xabc...",
  "capabilities": {"messaging":true},
  "routingHints": ["mainnet", "fast"],
  "stateHash": "0xdeadbeef..."
}
```
