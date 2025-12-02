/**
 * Session Key Management
 *
 * Provides X25519 key exchange and ChaCha20-Poly1305 encryption for
 * secure peer-to-peer communication between SigilNet nodes.
 *
 * Based on the sovereign tunnel architecture:
 * - Ed25519 signing keys for authentication
 * - X25519 derived keys for ephemeral session encryption
 * - ChaCha20-Poly1305 for payload encryption
 */

import nacl from "tweetnacl";
import util from "tweetnacl-util";
import { EncryptedPayload } from "./types/sigilnet.types";

const { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } = util;

/**
 * Session key pair for X25519 encryption
 */
type Base64String = string & { __brand: "base64" };
export interface b64SessionKeyPair {
  publicKey: Base64String;
  secretKey: Base64String;
}

export interface SessionKeyPair {
  publicKey: string; // Base64 encoded X25519 public key
  secretKey: string; // Base64 encoded X25519 secret key
}

/**
 * Generate an X25519 keypair for session encryption
 */
export function generateSessionKeyPair(): SessionKeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

/**
 * Convert Ed25519 signing key to X25519 encryption key
 *
 * Note: This uses the standard nacl.sign.keyPair.fromSeed() approach.
 * For production, you may want to use a dedicated conversion library
 * or maintain separate keypairs for signing and encryption.
 *
 * @param ed25519SecretKey Base64 encoded Ed25519 secret key (64 bytes)
 * @returns X25519 secret key for encryption
 */
export function ed25519ToX25519SecretKey(ed25519SecretKey: string): string {
  const secretKeyBytes = decodeBase64(ed25519SecretKey);

  // Extract the 32-byte seed from the 64-byte Ed25519 secret key
  const seed = secretKeyBytes.slice(0, 32);

  // Generate X25519 keypair from the same seed
  // This is a simple approach; in production, use proper key derivation
  const x25519KeyPair = nacl.box.keyPair.fromSecretKey(seed);

  return encodeBase64(x25519KeyPair.secretKey);
}

/**
 * Convert Ed25519 public key to X25519 public key
 *
 * Note: This is a simplified approach. In production, you should either:
 * 1. Maintain separate signing and encryption keypairs
 * 2. Use a proper Ed25519→X25519 conversion library
 * 3. Exchange X25519 public keys explicitly during handshake
 *
 * For this implementation, we generate from the same seed.
 */
export function ed25519ToX25519PublicKey(_ed25519PublicKey: string): string {
  // This is a placeholder - in real implementation, you'd need the secret key
  // or a proper conversion function. For now, we'll document that peers should
  // exchange their X25519 public keys explicitly.
  throw new Error(
    "Converting Ed25519 public key to X25519 requires additional context. " +
      "Use explicit X25519 key exchange during handshake instead.",
  );
}

/**
 * Derive a shared secret between two peers using X25519
 *
 * @param mySecretKey My X25519 secret key (Base64)
 * @param theirPublicKey Their X25519 public key (Base64)
 * @returns Shared secret (Base64)
 */
export function deriveSharedSecret(
  mySecretKey: string,
  theirPublicKey: string,
): string {
  const secretBytes = decodeBase64(mySecretKey);
  const publicBytes = decodeBase64(theirPublicKey);

  // Use nacl.box.before to derive the shared secret
  const sharedSecret = nacl.box.before(publicBytes, secretBytes);

  return encodeBase64(sharedSecret);
}

/**
 * Encrypt a payload using a shared secret
 *
 * Uses ChaCha20-Poly1305 for authenticated encryption
 *
 * @param data Data to encrypt (can be string or object)
 * @param sharedSecret Shared secret derived from key exchange (Base64)
 * @returns Encrypted payload with nonce
 */
export function encryptPayload(
  data: string | object,
  sharedSecret: string,
): EncryptedPayload {
  const message = typeof data === "string" ? data : JSON.stringify(data);
  const messageBytes = decodeUTF8(message);
  const sharedSecretBytes = decodeBase64(sharedSecret);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Encrypt using the shared secret
  const ciphertext = nacl.box.after(messageBytes, nonce, sharedSecretBytes);

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a payload using a shared secret
 *
 * @param encrypted Encrypted payload with nonce
 * @param sharedSecret Shared secret derived from key exchange (Base64)
 * @returns Decrypted data as string, or null if decryption failed
 */
export function decryptPayload(
  encrypted: EncryptedPayload,
  sharedSecret: string,
): string | null {
  try {
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const nonce = decodeBase64(encrypted.nonce);
    const sharedSecretBytes = decodeBase64(sharedSecret);

    const decrypted = nacl.box.open.after(ciphertext, nonce, sharedSecretBytes);

    if (!decrypted) {
      return null;
    }

    // Convert Uint8Array to string - encodeUTF8 converts bytes to string
    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}

/**
 * Encrypt data for a specific peer (convenience function)
 *
 * @param data Data to encrypt
 * @param myX25519SecretKey My X25519 secret key (Base64)
 * @param theirX25519PublicKey Their X25519 public key (Base64)
 * @returns Encrypted payload
 */
export function encryptForPeer(
  data: string | object,
  myX25519SecretKey: string,
  theirX25519PublicKey: string,
): EncryptedPayload {
  const mySecretBytes = decodeBase64(myX25519SecretKey);
  const theirPublicBytes = decodeBase64(theirX25519PublicKey);
  const message = typeof data === "string" ? data : JSON.stringify(data);
  const messageBytes = decodeUTF8(message);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Direct encryption without pre-computing shared secret
  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    theirPublicBytes,
    mySecretBytes,
  );

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt data from a specific peer (convenience function)
 *
 * @param encrypted Encrypted payload
 * @param myX25519SecretKey My X25519 secret key (Base64)
 * @param theirX25519PublicKey Their X25519 public key (Base64)
 * @returns Decrypted data as string, or null if decryption failed
 */
export function decryptFromPeer(
  encrypted: EncryptedPayload,
  myX25519SecretKey: string,
  theirX25519PublicKey: string,
): string | null {
  try {
    const mySecretBytes = decodeBase64(myX25519SecretKey);
    const theirPublicBytes = decodeBase64(theirX25519PublicKey);
    const ciphertext = decodeBase64(encrypted.ciphertext);
    const nonce = decodeBase64(encrypted.nonce);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      theirPublicBytes,
      mySecretBytes,
    );

    if (!decrypted) {
      return null;
    }

    // Convert Uint8Array to string - encodeUTF8 converts bytes to string
    return encodeUTF8(decrypted);
  } catch {
    return null;
  }
}
