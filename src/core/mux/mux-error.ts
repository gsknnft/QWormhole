export type MuxErrorCode =
  | "MUX_DECODE_ERROR"
  | "MUX_UNKNOWN_STREAM"
  | "MUX_PROTOCOL_VIOLATION";

export class MuxError extends Error {
  constructor(public code: MuxErrorCode, message: string) {
    super(message);
    this.name = "MuxError";
  }
}
