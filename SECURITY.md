# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in QWormhole, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities.

2. **Email the maintainers directly** with:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes (optional)

3. **Response timeline**:
   - Initial response: within 48 hours
   - Status update: within 7 days
   - Fix timeline: depends on severity (critical: ASAP, high: 14 days, medium: 30 days)

### What to Include

When reporting a vulnerability, please include:

- **Type of vulnerability** (e.g., buffer overflow, injection, authentication bypass)
- **Location** (file path, function name, line number if known)
- **Reproduction steps** with minimal code example
- **Impact assessment** (what an attacker could achieve)
- **Environment details** (OS, Node.js version, native backend if applicable)

## Security Considerations

### Transport Security

QWormhole is a transport layer library. By default, it does **not** encrypt traffic.

**To secure your deployment:**

1. **Enable TLS** - Use the built-in TLS support:
   ```typescript
   const server = new QWormholeServer({
     tls: {
       enabled: true,
       cert: fs.readFileSync('./cert.pem'),
       key: fs.readFileSync('./key.pem'),
     }
   });
   ```

2. **Use WireGuard** - For mesh networks, run QWormhole over WireGuard tunnels.

3. **Network isolation** - Deploy on private networks or VPNs.

See [docs/tls-examples.md](docs/tls-examples.md) for detailed TLS configurations.

### Native Backend Security

The libwebsockets native backend supports TLS with the same options as the TypeScript transport.

> **Important**: The libsocket backend is plaintext-only and will throw if TLS is requested. This prevents accidental security downgrades.

### Handshake & Authentication

QWormhole supports several authentication mechanisms:

1. **Protocol versioning** - Reject clients with incompatible versions
2. **Handshake tags** - Include identity metadata in handshakes
3. **TLS fingerprint pinning** - Validate client certificates
4. **Negentropic signatures** - Cryptographically signed handshakes
5. **Custom verification** - Implement `verifyHandshake` for custom logic

### Rate Limiting & DoS Protection

Built-in protections:

- **Rate limiting** (`rateLimitBytesPerSec`)
- **Backpressure limits** (`maxBackpressureBytes`)
- **Connection limits** (`maxClients`)
- **Idle timeouts** (`idleTimeoutMs`)

### Known Limitations

1. **Native server is experimental** - The libwebsockets server wrapper has ~60% test coverage. Use the TypeScript server for production until parity is achieved.

2. **Session key rotation** - Not yet implemented. Planned for v1.x.

3. **Replay protection** - Not yet implemented. Planned for v1.x.

## Security Roadmap

See [ROADMAP.md](ROADMAP.md) for planned security enhancements:

- [ ] Session key rotation
- [ ] Replay protection
- [ ] Forward secrecy toggle
- [ ] Native server parity with full coverage

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter notifies maintainers privately
2. Maintainers acknowledge and investigate
3. Fix is developed and tested
4. Advisory is prepared
5. Fix is released with advisory
6. Public disclosure after patch is available

## Credits

We appreciate security researchers who help keep QWormhole safe. Contributors will be acknowledged in the release notes (unless they prefer to remain anonymous).
