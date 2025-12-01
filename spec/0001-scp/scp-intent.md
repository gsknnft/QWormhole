# SCP Intent Protocol

## Overview
All SCP messages above QWormhole are intents. Intents are signed, diff-based, and negotiable.

## Intent Structure
```json
{
  "type": "intent",
  "sid": "<sender>",
  "intent": "<intentName>",
  "payload": "<structured>",
  "ts": "<timestamp>",
  "sig": "<signature>"
}
```

## Intent Types
- gossip
- state
- capability
- sharding
- upgrades
- proposals
- signals
- heartbeat

## Example
```json
{
  "type": "intent",
  "sid": "0xabc...",
  "intent": "offer_capability",
  "payload": {"capability":"fft","version":"v2"},
  "ts": 1700000000,
  "sig": "0x123..."
}
```
