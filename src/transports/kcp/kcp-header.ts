export interface KcpHeader {
  conv: number; // session ID
  sn: number;   // sequence number of this segment
  una: number;  // lowest unacknowledged sequence
  ts: number;   // timestamp
  wnd: number;  // receive window
  len: number;  // payload length
  flags: number; // bit flags
}

export const FLAG_DATA = 0x1;
export const FLAG_ACK = 0x2;
export const FLAG_PING = 0x4;

export const ENV_MAX_BUFFERS = process.env.QW_WRITEV_MAX_BUFFERS
  ? Number(process.env.QW_WRITEV_MAX_BUFFERS)
  : undefined;
export const ENV_MAX_BYTES = process.env.QW_WRITEV_MAX_BYTES
  ? Number(process.env.QW_WRITEV_MAX_BYTES)
  : undefined;