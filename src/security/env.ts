import fs from "node:fs";
import type {
  QWTlsOptions,
  QWormholeClientOptions,
  QWormholeServerOptions,
} from "../types/types";
import { createHandshakeVerifier } from "../handshake/handshake-policy";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const readEnvBoolean = (name: string): boolean | undefined => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return undefined;
};

const csv = (raw?: string): string[] =>
  (raw ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

const readTlsMaterial = (
  inlineEnv: string,
  pathEnv: string,
): string | Buffer | undefined => {
  const inline = process.env[inlineEnv];
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }
  const filePath = process.env[pathEnv];
  if (filePath) {
    return fs.readFileSync(filePath);
  }
  return undefined;
};

const readTlsCa = (): Array<string | Buffer> | string | Buffer | undefined => {
  const inline = process.env.QWORMHOLE_TLS_CA;
  if (inline) {
    return inline.includes("-----BEGIN")
      ? inline.replace(/\\n/g, "\n")
      : csv(inline);
  }

  const paths = csv(process.env.QWORMHOLE_TLS_CA_PATHS);
  if (paths.length > 0) {
    return paths.map(filePath => fs.readFileSync(filePath));
  }

  const singlePath = process.env.QWORMHOLE_TLS_CA_PATH;
  if (singlePath) {
    return fs.readFileSync(singlePath);
  }
  return undefined;
};

const mergeCommonTlsOptions = (
  merged: QWTlsOptions,
): QWTlsOptions | undefined => {
  const envEnabled = readEnvBoolean("QWORMHOLE_TLS_ENABLED");
  const ca = readTlsCa();
  const requestCert = readEnvBoolean("QWORMHOLE_TLS_REQUEST_CERT");
  const rejectUnauthorized = readEnvBoolean(
    "QWORMHOLE_TLS_REJECT_UNAUTHORIZED",
  );
  const servername = process.env.QWORMHOLE_TLS_SERVERNAME?.trim();
  const passphrase = process.env.QWORMHOLE_TLS_PASSPHRASE;
  const alpnProtocols = csv(process.env.QWORMHOLE_TLS_ALPN);

  if (envEnabled !== undefined && merged.enabled === undefined) {
    merged.enabled = envEnabled;
  }
  if (merged.ca === undefined && ca !== undefined) merged.ca = ca;
  if (merged.requestCert === undefined && requestCert !== undefined) {
    merged.requestCert = requestCert;
  }
  if (
    merged.rejectUnauthorized === undefined &&
    rejectUnauthorized !== undefined
  ) {
    merged.rejectUnauthorized = rejectUnauthorized;
  }
  if (merged.servername === undefined && servername) {
    merged.servername = servername;
  }
  if (merged.passphrase === undefined && passphrase) {
    merged.passphrase = passphrase;
  }
  if (
    merged.alpnProtocols === undefined &&
    alpnProtocols.length > 0
  ) {
    merged.alpnProtocols = alpnProtocols;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeClientTlsOptions = (
  existing?: QWTlsOptions,
): QWTlsOptions | undefined => {
  const merged: QWTlsOptions = {
    ...(existing ?? {}),
  };

  const clientKey = readTlsMaterial(
    "QWORMHOLE_TLS_CLIENT_KEY",
    "QWORMHOLE_TLS_CLIENT_KEY_PATH",
  );
  const clientCert = readTlsMaterial(
    "QWORMHOLE_TLS_CLIENT_CERT",
    "QWORMHOLE_TLS_CLIENT_CERT_PATH",
  );
  const clientPassphrase = process.env.QWORMHOLE_TLS_CLIENT_PASSPHRASE;

  if (merged.key === undefined && clientKey !== undefined) merged.key = clientKey;
  if (merged.cert === undefined && clientCert !== undefined) merged.cert = clientCert;
  if (merged.passphrase === undefined && clientPassphrase) {
    merged.passphrase = clientPassphrase;
  }

  return mergeCommonTlsOptions(merged);
};

const mergeServerTlsOptions = (
  existing?: QWTlsOptions,
): QWTlsOptions | undefined => {
  const merged: QWTlsOptions = {
    ...(existing ?? {}),
  };
  const key = readTlsMaterial("QWORMHOLE_TLS_KEY", "QWORMHOLE_TLS_KEY_PATH");
  const cert = readTlsMaterial("QWORMHOLE_TLS_CERT", "QWORMHOLE_TLS_CERT_PATH");

  if (merged.key === undefined && key !== undefined) merged.key = key;
  if (merged.cert === undefined && cert !== undefined) merged.cert = cert;

  return mergeCommonTlsOptions(merged);
};

const buildEnvHandshakeVerifier = () => {
  const allowedVersions =
    csv(process.env.QWORMHOLE_HANDSHAKE_ALLOWED_VERSIONS).length > 0
      ? csv(process.env.QWORMHOLE_HANDSHAKE_ALLOWED_VERSIONS)
      : csv(process.env.QWORMHOLE_PROTOCOL_VERSION);
  const requiredTags = csv(process.env.QWORMHOLE_HANDSHAKE_REQUIRED_TAGS);
  const requireHandshake =
    readEnvBoolean("QWORMHOLE_REQUIRE_HANDSHAKE") === true ||
    allowedVersions.length > 0 ||
    requiredTags.length > 0;

  if (!requireHandshake) {
    return undefined;
  }

  return createHandshakeVerifier({
    allowedVersions: allowedVersions.length > 0 ? allowedVersions : undefined,
    validateTags:
      requiredTags.length > 0
        ? tags => {
            const record = tags ?? {};
            return requiredTags.every(rule => {
              const [key, expected] = rule.split("=", 2);
              if (!key) return false;
              const actual = record[key];
              if (expected === undefined) {
                return actual !== undefined;
              }
              return String(actual) === expected;
            });
          }
        : undefined,
  });
};

export const resolveProtocolVersion = (
  explicit?: string,
): string | undefined => explicit ?? process.env.QWORMHOLE_PROTOCOL_VERSION;

export const resolveBindHost = (fallback: string): string =>
  process.env.QWORMHOLE_BIND_HOST?.trim() || fallback;

export const applyQWormholeClientSecurityDefaults = <TMessage>(
  options: QWormholeClientOptions<TMessage>,
): QWormholeClientOptions<TMessage> => ({
  ...options,
  protocolVersion: resolveProtocolVersion(options.protocolVersion),
  tls: mergeClientTlsOptions(options.tls),
});

export const applyQWormholeServerSecurityDefaults = <TMessage>(
  options: QWormholeServerOptions<TMessage>,
): QWormholeServerOptions<TMessage> => ({
  ...options,
  protocolVersion: resolveProtocolVersion(options.protocolVersion),
  tls: mergeServerTlsOptions(options.tls),
  verifyHandshake: options.verifyHandshake ?? buildEnvHandshakeVerifier(),
});

export const shouldForceTsSecureServer = <TMessage>(
  options: QWormholeServerOptions<TMessage>,
): boolean => {
  const resolved = applyQWormholeServerSecurityDefaults(options);
  return Boolean(
    resolved.tls?.enabled || resolved.verifyHandshake || resolved.protocolVersion,
  );
};
