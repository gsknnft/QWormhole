export type QWormholeErrorCode =
  | "E_BACKPRESSURE"
  | "E_CONNECT_TIMEOUT"
  | "E_MAX_CLIENTS"
  | "E_NOT_CONNECTED"
  | "E_NATIVE_UNAVAILABLE"
  | "E_INVALID_HANDSHAKE_SIGNATURE"
  | "E_INVALID_HANDSHAKE"
  | 'E_INVALID_HANDSHAKE_PAYLOAD'
  | "E_INTERFACE_NOT_FOUND";

export class QWormholeError extends Error {
  readonly code: QWormholeErrorCode;

  constructor(code: QWormholeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "QWormholeError";
  }
}
