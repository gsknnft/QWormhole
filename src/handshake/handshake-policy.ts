export interface HandshakePayload {
  type: "handshake";
  version?: string;
  tags?: Record<string, unknown>;
  nIndex?: number;
  negHash?: string;
  [key: string]: unknown;
}

export const isHandshakePayload = (
  value: unknown,
): value is HandshakePayload => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.type === "handshake";
};

export interface HandshakePolicyOptions {
  allowedVersions?: string[];
  validateTags?: (tags: Record<string, unknown> | undefined) => boolean;
}

/**
 * Build a simple handshake verifier you can pass to verifyHandshake.
 * Rejects on version mismatch or tag validation failure.
 */
export function createHandshakeVerifier(options: HandshakePolicyOptions = {}) {
  const { allowedVersions, validateTags } = options;
  return (payload: unknown): boolean => {
    if (!isHandshakePayload(payload)) return false;
    if (allowedVersions && allowedVersions.length > 0) {
      if (!payload.version || !allowedVersions.includes(payload.version)) {
        return false;
      }
    }
    if (validateTags && !validateTags(payload.tags)) {
      return false;
    }
    return true;
  };
}
