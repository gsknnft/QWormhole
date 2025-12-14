import { MuxFrame, MuxFrameType } from "./mux-frame";
import { MuxError } from "./mux-error";

// Simple varint helpers (unsigned)
function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  
  return Uint8Array.from(bytes);
}

function decodeVarint(buf: Uint8Array, offset: number): { value: number; read: number } {
  let result = 0;
  let shift = 0;
  let idx = offset;
  while (idx < buf.length) {
    const byte = buf[idx];
    result |= (byte & 0x7f) << shift;
    idx += 1;
    if ((byte & 0x80) === 0) {
      return { value: result, read: idx - offset };
    }
    shift += 7;
    if (shift > 35) break;
  }
  throw new MuxError("MUX_DECODE_ERROR", "Invalid varint");
}

const FRAME_TYPE_MAP: Record<number, MuxFrameType> = {
  0: "open",
  1: "data",
  2: "close",
  3: "reset",
  4: "window",
};

const FRAME_TYPE_CODE: Record<MuxFrameType, number> = {
  open: 0,
  data: 1,
  close: 2,
  reset: 3,
  window: 4,
};

export class MuxFramer {
  encode(frame: MuxFrame): Uint8Array {
    const typeCode = FRAME_TYPE_CODE[frame.type];
    const headerParts: Uint8Array[] = [];
    headerParts.push(Uint8Array.of(typeCode));
    headerParts.push(encodeVarint(frame.streamId));

    if (frame.type === "window") {
      const win = frame.window ?? 0;
      headerParts.push(encodeVarint(win));
      return concatBuffers(headerParts);
    }

    const payload = frame.payload ?? new Uint8Array();
    headerParts.push(encodeVarint(payload.length));
    return concatBuffers([...headerParts, payload]);
  }

  decode(buf: Uint8Array): MuxFrame[] {
    const frames: MuxFrame[] = [];
    let offset = 0;
    while (offset < buf.length) {
      const typeCode = buf[offset];
      offset += 1;
      const type = FRAME_TYPE_MAP[typeCode];
      if (!type) {
        throw new MuxError("MUX_DECODE_ERROR", `Unknown frame type ${typeCode}`);
      }

      const streamIdVar = decodeVarint(buf, offset);
      offset += streamIdVar.read;
      const streamId = streamIdVar.value;

      if (type === "window") {
        const winVar = decodeVarint(buf, offset);
        offset += winVar.read;
        frames.push({ type, streamId, window: winVar.value });
        continue;
      }

      const lenVar = decodeVarint(buf, offset);
      offset += lenVar.read;
      const len = lenVar.value;
      if (offset + len > buf.length) {
        throw new MuxError("MUX_DECODE_ERROR", "Truncated payload");
      }
      const payload = buf.subarray(offset, offset + len);
      offset += len;
      frames.push({ type, streamId, payload });
    }
    return frames;
  }
}

function concatBuffers(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, cur) => acc + cur.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
