# RFC-0001: Sovereign Compute Protocol (SCP)

## Status
Draft, v0.1.0

## Authors
G. Skinnft, SigilNet Foundation

## Table of Contents
1. Introduction
2. Terminology
3. Layering Model
4. Sovereign Identity
5. Negentropy Vector
6. Intent Graph
7. Capability Negotiation
8. Shard Topology
9. SCP Handshake
10. State Exchange Protocol
11. Intent Protocol
12. Negentropy-based Trust Model
13. Secure Streams Integration
14. Versioning & Upgrades
15. Reference Implementation
16. Security Considerations
17. IANA Considerations
18. References

---

## 1. Introduction

The Sovereign Compute Protocol (SCP) defines a semantic layer for autonomous agents operating above QWormhole transport. SCP enables agents to negotiate identity, intent, state, and meaning, supporting distributed cognition, sharding, and capability negotiation. SCP is designed for extensibility, security, and future-proof autonomy.

## 2. Terminology
- **Agent**: An autonomous entity participating in SCP.
- **SID**: Sovereign Identity Root.
- **NV**: Negentropy Vector.
- **IG**: Intent Graph.
- **CapSet**: Capability Set.
- **Shard**: A logical partition of agent state and capabilities.
- **SEP**: State Exchange Protocol.
- **IP**: Intent Protocol.

## 3. Layering Model
```
+-----------------------------------------------------------+
|                    Application / Agent                    |
+-----------------------------------------------------------+
|                Sovereign Compute Protocol                 |
|   (Intent, Identity, Negentropy, State, Capability)       |
+-----------------------------------------------------------+
|                     QWormhole Transport                   |
|    (Handshake, framing, codecs, rate-limit, backpressure) |
+-----------------------------------------------------------+
|                TCP / Native LWS / Libsocket               |
+-----------------------------------------------------------+
```

## 4. Sovereign Identity

Each agent MUST expose a Sovereign Identity Root (SID) during the SCP handshake. The SID MUST be computed as:

```
SID = H(seed || negentropyVector || deviceKey || ritualSalt)
```

SID MUST be:
- Non-hierarchical
- Self-issued
- Cryptographically mutable across sharded forms
- Compatible with EVM keypairs, Solana ED25519, and WASM modules

## 5. Negentropy Vector

Agents MUST expose a compressed Negentropy Vector (NV) on handshake. NV MUST combine:
- Shannon entropy
- Kolmogorov complexity
- Spectral flow entropy
- Social/cosmic jitter

Agents MUST use NV to detect peer stability, coherence, drift, hijack, impersonation, or decay.

## 6. Intent Graph

Agents MUST express all actions as signed intents. Intents MUST be serializable, diff-based, and negotiable. Example intents:
- request_state_sync
- offer_capability
- migrate_shard
- yield_authority
- propose_transaction
- emit_signal

## 7. Capability Negotiation

Agents MUST describe capabilities in a CapSet. CapSets MUST be exchanged and negotiated during handshake. Example:
```
capabilities: {
  messaging: true,
  fft: "v2",
  storage: ["slot", "diff"],
  upgrade: ["facet", "diamond", "solanaRouter"],
  sensor: ["gpio", "uart", "i2c"],
  compute: ["wasm", "vm", "local"],
}
```

## 8. Shard Topology

Agents MUST support sharding. Each Shard MUST include:
- id: shardId
- root: SID
- capabilities: CapSet
- routingHints: [...]
- stateHash: H(state)

Agents MUST support split, merge, authority negotiation, state delta, and intent routing via QWormhole.

## 9. SCP Handshake

The SCP handshake MUST extend QWormhole handshake with ritualized negotiation:
```
{
  version: "SCP/1.0",
  sid: <sovereign identity>,
  caps: <capabilities>,
  nv: <negentropy vector>,
  ts: <timestamp>,
  sig: Sign(deviceKey, above)
}
```
Servers MUST verify:
- signature
- entropy coherence
- allowed intent families
- capability compatibility
- sharding alignment

## 10. State Exchange Protocol (SEP)

Agents MUST exchange state in three forms:
- **Snapshot**: Full state hash + summary
- **Delta**: CRDT-like diff
- **Negotiated Merge**: Winner, merge strategy, fallback, arbitration

## 11. Intent Protocol (IP)

All messages above QWormhole MUST be intents:
```
{
  type: "intent",
  sid: <sender>,
  intent: <intentName>,
  payload: <structured>,
  ts: <timestamp>,
  sig: <signature>
}
```
Intent types MUST include: gossip, state, capability, sharding, upgrades, proposals, signals, heartbeat.

## 12. Negentropy-based Trust Model

Agents MUST use NV as a trust gauge:
```
Trust = f( ΔNV / Δt, coherenceScore, stateConsistency )
```
Agents MAY refuse connections, degrade capabilities, switch routing, shadow-ban unstable nodes, mirror state, or request stabilizing signals.

## 13. Secure Streams Integration

SCP MUST support Secure Streams when available. Secure Streams MUST multiplex intents, isolate capabilities, encrypt sub-channels, and provide sovereign TLS termination.

## 14. Versioning & Upgrades

SCP MUST describe capability graphs, upgrade intents, shard migrations, facet updates, and diamond upgrades (Solana/EVM).

## 15. Reference Implementation

A reference implementation MUST be provided in:
```
/spec/0001-scp/
  README.md
  scp-handshake.md
  scp-state.md
  scp-intent.md
  scp-negentropy.md
  scp-capabilities.md
  scp-shards.md
```
And a minimal:
```
packages/scp-ts
```

## 16. Security Considerations

SCP does NOT provide encryption by default. Implementations MUST use WireGuard, SSH tunnels, or TLS as needed. Secure Streams will provide encrypted, multiplexed channels in future versions.

## 17. IANA Considerations

None at this time.

## 18. References
- QWormhole Transport Specification
- Diamond Protocol (Solana/EVM)
- CRDT State Models
- Libwebsockets Secure Streams
- SigilNet Foundation Research

---

**End of RFC-0001: Sovereign Compute Protocol (SCP)**
