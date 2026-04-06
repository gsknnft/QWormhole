# QWormhole Security

## Current posture

`QWormhole` supports:

- TLS transport
- protocol-versioned handshake
- handshake verification
- TLS fingerprint binding inside handshake metadata

Those features were not previously guaranteed by default at runtime. The package now applies env-backed security defaults to both client and server construction.

## Recommended env contract

Set these in the repo root `.env` if multiple services share the same transport policy.

Required for secure transport:

```env
QWORMHOLE_PROTOCOL_VERSION=1.0.0
QWORMHOLE_REQUIRE_HANDSHAKE=1
QWORMHOLE_HANDSHAKE_REQUIRED_TAGS=service
QWORMHOLE_TLS_ENABLED=1
QWORMHOLE_TLS_CERT_PATH=./secrets/qwormhole/server-cert.pem
QWORMHOLE_TLS_KEY_PATH=./secrets/qwormhole/server-key.pem
QWORMHOLE_TLS_CA_PATHS=./secrets/qwormhole/ca-cert.pem
QWORMHOLE_TLS_REJECT_UNAUTHORIZED=1
```

Optional:

```env
QWORMHOLE_TLS_REQUEST_CERT=1
QWORMHOLE_TLS_SERVERNAME=qwormhole.internal
QWORMHOLE_TLS_ALPN=qwormhole
QWORMHOLE_BIND_HOST=127.0.0.1
```

## Behavior

- `QWormholeClient` will pick up:
  - `QWORMHOLE_PROTOCOL_VERSION`
  - TLS material/options
- `QWormholeServer` will pick up:
  - `QWORMHOLE_PROTOCOL_VERSION`
  - TLS material/options
  - env-derived handshake verifier when `QWORMHOLE_REQUIRE_HANDSHAKE=1`
- `QWormholeRuntime.listen()` will use `QWORMHOLE_BIND_HOST` if set
- Secure server options force the TypeScript server path instead of native server mode so TLS and handshake policy are enforced consistently

## Important limitations

- `WorkerShardedServer` and `RoutedShardedServer` do not serialize custom `verifyHandshake` callbacks across workers.
- With the env-backed defaults above, workers still inherit secure server behavior because the verifier is reconstructed inside the server implementation.
- `QWormholeRuntime.listen()` still defaults to `0.0.0.0` if `QWORMHOLE_BIND_HOST` is not set. Set it explicitly.

## Scope recommendation

- Put shared transport env vars in the repo root when:
  - `vera`
  - `vera-torch`
  - `campus`
  - `qwormhole-bridge`
  all use the same internal transport trust policy.

- Put scoped env vars in package-local env files only when a service needs a distinct identity or certificate set.

Practical split:

- root `.env`
  - `QWORMHOLE_*`
  - `VERA_SERVICE_TOKEN`
  - `VERA_ADMIN_TOKEN`
- service-local `.env`
  - service URLs
  - model selection
  - role-specific overrides

