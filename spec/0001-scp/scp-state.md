# SCP State Exchange Protocol (SEP)

## Overview
Agents exchange state using SCP in three forms: snapshot, delta, and negotiated merge.

## State Forms

- **Snapshot**: The full structural description of an agent’s current state:

    - Full hash
    - Summary
    - Timestamp
    - Signature
        - (see payload spec below)

- **Delta**: CRDT-like diff.
    - Minimal diffs sufficient to reconstruct or update state.
    - Delta is preferred in stable or long-lived connections.

- **Negotiated Merge**: 
    - Used when two agents disagree on truth, authority, or causality.
    - Merging requires both:
        - Declared strategy
        - Cryptographic acknowledgement

## State Payload Example
```json
{
  "type": "state",
  "sid": "<sender>",
  "snapshot": {
    "stateHash": "0xabc...",
    "summary": "..."
  },
  "delta": {
    "changes": ["...diffs..."]
  },
  "merge": {
    "winner": "<sid>",
    "strategy": "arbitrate"
  },
  "ts": "<timestamp>",
  "sig": "<signature>"
}
```

## Merge Strategies
- Winner-takes-all
    Fast, final, deterministic. Ideal for executor shards.
- Arbitration
    Agents negotiate resolution through provided rulesets, entropy profiles, or capability weights.
- Fallback
    When no strategy resolves conflict, agents revert to last mutually coherent snapshot.

## Security Requirements

All state payloads MUST be:

- Signed
- Timestamped
- Versioned

Ensuring agents cannot accept stale, poisoned, or divergent state.