import nacl from "tweetnacl";
import util from "tweetnacl-util";

const { decodeUTF8, encodeBase64, decodeBase64 } = util;

export function generateKeyPair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey)
  };
}

export function signEvent(evt: object, secretKey: string) {
  const msg = decodeUTF8(JSON.stringify(evt));
  const sig = nacl.sign.detached(msg, decodeBase64(secretKey));
  return encodeBase64(sig);
}

export function verifyEvent(evt: object, sig: string, publicKey: string) {
  try {
    const msg = decodeUTF8(JSON.stringify(evt));
    return nacl.sign.detached.verify(msg, decodeBase64(sig), decodeBase64(publicKey));
  } catch (_) {
    return false;
  }
}
