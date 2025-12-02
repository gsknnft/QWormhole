# Changelog

## 0.1.0 — Initial public kernel
- TypeScript transport layer (length-prefixed TCP with reconnect)
- Optional native bindings (libwebsockets, libsocket)
- Pluggable serializers/deserializers (Buffer/Text/JSON/CBOR helpers)
- Runtime factory for TS/native selection with interface binding
- Rate limiting and backpressure guard
- Protocol handshake (version + tags) with optional negentropic signer
- Full test suite (TS + native smoke)
- Multi-platform support (Windows/macOS/Linux/WSL)
ch