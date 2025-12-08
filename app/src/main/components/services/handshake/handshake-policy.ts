import {
  handshakePayloadSchema,
  type HandshakePayload,
} from '../../../../shared/scp';

export { type HandshakePayload } from '../../../../shared/scp';

export const isHandshakePayload = (value: unknown): value is HandshakePayload =>
  handshakePayloadSchema.safeParse(value).success;

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
