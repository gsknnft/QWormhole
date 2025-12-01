# SCP Handshake

## Overview
The SCP handshake extends QWormhole's handshake, enabling agents to negotiate identity, capabilities, negentropy, and sharding alignment.

## Handshake Structure
```json
{
  "version": "SCP/1.0",
  "sid": "<sovereign identity>",
  "caps": "<capabilities>",
  "nv": "<negentropy vector>",
  "ts": "<timestamp>",
  "sig": "Sign(deviceKey, above)"
}
```

## Steps
1. Exchange handshake payloads.
2. Verify signature and entropy coherence.
3. Negotiate allowed intent families and capabilities.
4. Align sharding topology.

## Validation
- Signature MUST be valid.
- NV MUST be coherent and non-degenerate.
- Capabilities MUST be compatible.
- Sharding MUST be aligned or negotiated.

## Failure Modes
- Invalid signature: reject.
- Entropy mismatch: request stabilizing signal or reject.
- Capability conflict: degrade or reject.
- Shard misalignment: propose merge/split or reject.

## Example
```json
{
  "version": "SCP/1.0",
  "sid": "0xabc...",
  "caps": {"messaging":true,"fft":"v2"},
  "nv": "0xdeadbeef...",
  "ts": 1700000000,
  "sig": "0x123..."
}
```
