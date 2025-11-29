import { TypedEventEmitter } from './typedEmitter';

interface FramerEvents {
  message: Buffer;
  error: Error;
}

export interface LengthPrefixedFramerOptions {
  maxFrameLength?: number;
}

const HEADER_LENGTH = 4;
const DEFAULT_MAX_FRAME_LENGTH = 4 * 1024 * 1024; // 4 MiB

export class LengthPrefixedFramer extends TypedEventEmitter<FramerEvents> {
  private readonly maxFrameLength: number;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(options?: LengthPrefixedFramerOptions) {
    super();
    this.maxFrameLength = options?.maxFrameLength ?? DEFAULT_MAX_FRAME_LENGTH;
  }

  encode(payload: Buffer): Buffer {
    const header = Buffer.allocUnsafe(HEADER_LENGTH);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= HEADER_LENGTH) {
      const frameLength = this.buffer.readUInt32BE(0);
      if (frameLength > this.maxFrameLength) {
        this.buffer = Buffer.alloc(0);
        this.emit('error', new Error(`Frame length ${frameLength} exceeds limit ${this.maxFrameLength}`));
        return;
      }

      if (this.buffer.length < HEADER_LENGTH + frameLength) break;

      const start = HEADER_LENGTH;
      const end = HEADER_LENGTH + frameLength;
      const frame = this.buffer.subarray(start, end);
      this.buffer = this.buffer.subarray(end);
      this.emit('message', frame);
    }
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
