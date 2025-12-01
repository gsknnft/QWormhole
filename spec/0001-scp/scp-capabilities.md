# SCP Capabilities

## Overview
Agents describe capabilities in a CapSet, exchanged and negotiated during handshake.

## CapSet Example
```json
{
  "messaging": true,
  "fft": "v2",
  "storage": ["slot", "diff"],
  "upgrade": ["facet", "diamond", "solanaRouter"],
  "sensor": ["gpio", "uart", "i2c"],
  "compute": ["wasm", "vm", "local"]
}
```

## Negotiation
- CapSets are exchanged during handshake.
- Agents MUST negotiate compatible capabilities.
- Incompatible capabilities MAY be degraded or rejected.
