
# RFC-0001: Negentropic Transport Protocol (v0.2.0 — Diagnostics Release)

## Introduction
This RFC formalizes the Negentropic Transport Protocol, grounded in the mathematical framework defined in [Negentropic Coupling Theory](https://github.com/gsknnft/NegentropicCouplingTheory/tree/dev). It describes the coupling operators, invariants, and entropy/coherence mappings that power the QWormhole transport stack.

**v0.2.0 Release:**
- Negentropic diagnostics (entropy, negentropy, coherence/velocity enums) are now integrated in FlowController, client/server, and telemetry.
- Implementation ↔ theory mapping is formalized and covered by CI.

## Theory & Coupling Table
- **Definitions & Axioms:** See [Negentropic Coupling Theory](https://github.com/gsknnft/NegentropicCouplingTheory/tree/dev) for formal definitions, axioms, and operator formalism.
- **Coupling Table:** Maps entropy, negentropy, coherence, and velocity to transport policy.

## FlowController & SessionFlowPolicy
- **FlowController:** Implements adaptive batching, slice sizing, and negentropic index computation.
- **SessionFlowPolicy:** Maps session state to transport parameters using theory-driven invariants.

## Zero-Copy Batching, writev, io_uring
- **Zero-copy batching:** Uses writev/io_uring for efficient flushes and minimal GC overhead.
- **Batching logic:** Adapts slice size based on entropy, negentropy, and coherence.

## Micro/Macro Slicing, Peer Modes
- **Micro-slicing:** For low-coherence, high-entropy sessions.
- **Macro-slicing:** For high-coherence, low-entropy sessions.
- **Peer modes:** Native vs TS, with adaptive policy.

## Entropy-Aware Codecs
- **Codec selection:** Adapts between JSON, CBOR, FlatBuffers based on entropy and message type histogram.

## Implementation ↔ Theory Mapping
- Each transport policy and diagnostic is mapped to a formal definition in the theory repo.
- NeganticIndex, entropy velocity, and coherence enums are computed as per theory.

---
*This RFC is the canonical reference for distributed systems engineers and future publications. Cite the theory repo for all mathematical formalism.*
