export type MuxFrameType = "open" | "data" | "close" | "reset" | "window";

export interface MuxFrame {
  streamId: number;
  type: MuxFrameType;
  flags?: number;
  window?: number;
  payload?: Uint8Array;
}
