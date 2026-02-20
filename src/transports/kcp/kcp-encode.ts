import { KcpHeader } from "./kcp-header";

// Header layout (24 bytes): conv|sn|una|ts|wnd|len|flags
export const KCP_HEADER_BYTES = 24;

export function encodeSegment(h: KcpHeader, payload: Uint8Array): Uint8Array {
  const buf = new Uint8Array(KCP_HEADER_BYTES + payload.length);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  dv.setUint32(0, h.conv >>> 0);
  dv.setUint32(4, h.sn >>> 0);
  dv.setUint32(8, h.una >>> 0);
  dv.setUint32(12, h.ts >>> 0);
  dv.setUint16(16, h.wnd >>> 0);
  dv.setUint16(18, h.len >>> 0);
  dv.setUint16(20, h.flags >>> 0);

  buf.set(payload, KCP_HEADER_BYTES);
  return buf;
}

export function decodeSegments(buf: Uint8Array): Array<{ h: KcpHeader; payload: Uint8Array }> {
  const out: Array<{ h: KcpHeader; payload: Uint8Array }> = [];
  let offset = 0;
  while (offset + KCP_HEADER_BYTES <= buf.length) {
    const dv = new DataView(buf.buffer, buf.byteOffset + offset, buf.byteLength - offset);
    const conv = dv.getUint32(0, false);
    const sn = dv.getUint32(4, false);
    const una = dv.getUint32(8, false);
    const ts = dv.getUint32(12, false);
    const wnd = dv.getUint16(16, false);
    const len = dv.getUint16(18, false);
    const flags = dv.getUint16(20, false);
    const segBytes = KCP_HEADER_BYTES + len;
    if (offset + segBytes > buf.length) break;
    const payload = buf.subarray(offset + KCP_HEADER_BYTES, offset + KCP_HEADER_BYTES + len);
    out.push({ h: { conv, sn, una, ts, wnd, len, flags }, payload });
    offset += segBytes;
  }
  return out;
}
