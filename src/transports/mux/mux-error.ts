export type MuxErrorCode =
  | "MUX_DECODE_ERROR"
  | "MUX_UNKNOWN_STREAM"
  | "MUX_PROTOCOL_VIOLATION"
  | "MUX_STREAM_CLOSED"
  | "MUX_INTERNAL_ERROR";

export class MuxError extends Error {
  constructor(public code: MuxErrorCode, message: string) {
    super(message);
    this.name = "MuxError";
  }
}
