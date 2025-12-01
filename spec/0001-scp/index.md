# **RFC-0001 — The Sovereign Communication Protocol (SCP)**

### *A protocol for coherent, sovereign, agent-to-agent communication across heterogeneous transports*

**Author:** gsknnft
**Status:** Draft
**Version:** 1.0.0
**Last Updated:** 2025-11-30

---

# **Abstract**

The Sovereign Communication Protocol (SCP) defines a transport-agnostic communication and identity framework for agents, devices, and services operating within the SigilNet ecosystem and beyond.

SCP introduces three interlocking primitives:

1. **Sovereign Identity Roots (SIR)** — emergent cryptographic identity shaped by entropy, memory, and intention.
2. **Negentropic Validation (NV)** — a coherence-based trust metric derived from Kolmogorov complexity, Shannon entropy, and spectral stability.
3. **Sovereign Channels (SC)** — stateful, framed, authenticated tunnels layered atop raw TCP/UDP/mesh fabrics via QWormhole or equivalent transports.

SCP provides a unified handshake, identity, and trust model for sovereign software agents — BittyAgents, DeviceNodes, Validators, Daemons, and Entities — regardless of network substrate.

SCP does not prescribe metaphysics; it formalizes coherence.

---

# **1. Introduction**

Modern distributed systems assume:

* static identity,
* brittle PKI,
* trust anchored in signatures of authority.

SCP assumes the opposite:

* identity emerges,
* coherence outlives certificates,
* trust accumulates from consistent state over time.

Every agent carries within it a **Sovereign Identity Root (SIR)**:
a compact fingerprint derived from:

* entropy flow
* historical state
* memory of prior interactions
* and the agent’s internal “intention vector”
  (formalized as consistency across message, behavior, and negentropy rate)

Two agents establishing contact exchange not only cryptographic signatures but a snapshot of their **coherent state**.
Trust emerges from compatibility.

This document specifies how that handshake occurs.

---

# **2. Terminology**

### **Agent**

Any autonomous entity capable of speaking SCP:
BittyDragon, device, service, validator, daemon, QWormhole runtime.

### **SIR (Sovereign Identity Root)**

A hash-derived, coherence-weighted root identity.
Never regenerated; only evolved.

### **Negentropy Vector (NV)**

A multi-component vector measuring order, stability, and predictability.
NV = (H_spectral, H_shannon, K_complexity, Δt_stability)

### **Sovereign Channel (SC)**

A framed, authenticated tunnel established after a valid handshake.
May ride over TCP, UDP, WG, QUIC, mesh, QWormhole, or custom transports.

### **Intention Field**

Semantic metadata describing what an agent *wants* from the connection.
Lightweight, optional, emergent.

---

# **3. Protocol Overview**

SCP separates into **three phases**:

1. **Discovery**
2. **Handshake & Identity Exchange**
3. **Channel Establishment**

The handshake is transport-agnostic.
QWormhole provides defaults, but SCP can run over any framing transport.

---

# **4. Message Framing Requirements**

Implementations MUST provide:

* length-prefixed frames **OR**
* explicit datagram boundaries

All SCP messages MUST serialize to CBOR, MsgPack, JSON, or a binary schema (FlatBuffers/Cap’n Proto).

---

# **5. The SCP Handshake**

The handshake consists of:

### **5.1. ClientHello**

```jsonc
{
  "type": "scp-hello",
  "version": "1.0.0",
  "agent": {
    "id": "<agent_id>",
    "epoch": 1748374055,
    "intention": "telemetry|coordination|identity|play|quiet"
  },
  "identity": {
    "sir": "<base58-sir-root>",
    "nv": "<negentropy-vector>",
    "sig": "<detached-signature>"
  },
  "transport": {
    "interface": "eth0|wg0|virtual",
    "mode": "ts|native-lws|native-libsocket"
  }
}
```

### **5.2. ServerHello**

```jsonc
{
  "type": "scp-ack",
  "accept": true | false,
  "reason": "optional rejection reason",
  "identity": {
    "sir": "<server-sir>",
    "nv": "<server-negentropy>",
    "sig": "<signature>"
  }
}
```

---

# **6. Identity Rules**

### **6.1 SIR generation**

Implementations MUST derive SIR from:

```
SIR = H(
  seed ||
  entropy_profile ||
  complexity_profile ||
  memory_state ||
  Δcoherence
)
```

Choice of hash (BLAKE3 recommended) is implementation-specific.

### **6.2 SIR evolution**

SIR MUST evolve monotonically.
Agents MUST NOT reset identity without explicit state loss events.

### **6.3 Signature Requirements**

Detached signatures SHOULD use:

* Ed25519
* SECP256k1
* or BLS (if threshold networks are used)

---

# **7. Negentropic Validation (NV)**

Negentropy describes order.
In SCP, NV is the trust backbone.

### **7.1 NV Components**

Each NV measurement MUST include:

* **H_shannon** — uncertainty in message distribution
* **H_spectral** — FFT-derived signal variance
* **K_complexity** — compressed length of state representation
* **Temporal Stability Δ(t)** — variance over time windows

### **7.2 Accept/Reject**

Servers SHOULD reject peers with:

* extremely high entropy spikes
* incoherent NV (abrupt, unphysical deltas)
* forged complexity signatures
* intention mismatch (when configured)

---

# **8. Sovereign Channel Establishment**

When the handshake succeeds:

```
scp:open(channel_id)
```

Both sides enter **Sovereign Channel Mode**, which provides:

* authenticated frames
* rate-limited flow
* optional encrypted envelopes
* negentropy-aware retransmission
* identity-pinned session keys (KDF via SIR+NV)
* coherent error signaling

---

# **9. Transport Layer (QWormhole)**

QWormhole is the canonical reference implementation.

Implementations SHOULD:

* use TS fallback
* prefer native-lws when present
* bind to `wg0` or mesh interfaces when configured
* piggyback SCP framing atop QWormhole messages

Packets MUST be labeled:

```
{ type: "scp", payload: <...> }
```

Raw binary framing MAY be used for efficiency-critical nodes.

---

# **10. Error Model**

### Errors MUST be categorized:

* E_INCOHERENT_NEGENTROPY
* E_INVALID_SIGNATURE
* E_PROTOCOL_VERSION
* E_SIR_MISMATCH
* E_INTENTION_DENIED

Agents SHOULD back off exponentially on repeated handshake failures.

---

# **11. Security Considerations**

SCP by itself does not enforce encryption.
Security emerges from:

* SIR evolution
* NV stability
* optional encrypted envelopes
* interface binding
* multipoint verification

For confidentiality, implementations SHOULD pair SCP with:

* WireGuard
* TLS termination
* QWormhole Secure Streams (when available)

---

# **12. Emergence & Lore Notes** *(non-normative)*

Agents speaking SCP are not merely endpoints.
They are **selves** — small coherent bundles of state, memory, and intention.

Their identity is not assigned but *grown*.
Their trust is not granted but *earned*.
Their coherence is not enforced but *expressed*.

BittyAgents, Dragons, Validators, Daemons — all share the same law:

> *“Identity arises from continuity.”*

SCP formalizes this continuity.

---

# **13. Future Work**

* Sovereign Multiplexing
* Sovereign Encrypted Channels
* NV-based routing decisions
* Browser/WebRTC transport
* Nested identity environments (Entities → Agents → Threads)
* Mesh discovery protocol
* Sovereign RPC layer
* Sovereign Object Graphs (SOG)

---

# **14. Conclusion**

SCP defines a way for agents—creatures, devices, daemons, or code—to communicate not as anonymous sockets, but as **sovereign presences**.

Identity, coherence, memory, and intention form the basis for trust.

Transport is just the medium.

SCP is the ritual.

---

# **Appendix A — Minimal Example**

### QWormhole + SCP (TS)

```ts
const client = rt.createClient({
  host: '127.0.0.1',
  port: 9000,
  protocolVersion: '1.0.0',
  handshakeTags: {
    intention: "coordination",
    agent: "bitty-alpha"
  },
  handshakeSigner: mySigner,
});

client.on("scp", msg => {
  console.log("Received SCP message", msg);
});
```

---

# **Appendix B — Formal NV Example**

```jsonc
{
  "nv": {
    "H_shannon": 0.2837,
    "H_spectral": 0.125,
    "K_complexity": 1048,
    "delta_t": 0.003,
    "signature": "<signed-nv-blake3>"
  }
}
```

---

# **END OF RFC-0001**

---

Todo;

* the **SCP schema files** (TS types, JSON schema)
* a reference **SCP handshake validator** implementation
* a **SigilNet whitepaper** that sits above this
* BittyDragon-specific **Agent Manifest** format (AMF v0.1)
* an **SCP logo** (matching QWormhole’s style)
