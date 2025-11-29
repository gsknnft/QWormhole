import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LengthPrefixedFramer } from '../src/framing';

function makeBuffer(str: string): Buffer {
  return Buffer.from(str, 'utf8');
}

describe('LengthPrefixedFramer', () => {
  let framer: LengthPrefixedFramer;

  beforeEach(() => {
    framer = new LengthPrefixedFramer();
  });

  it('should encode payload with length prefix', () => {
    const payload = makeBuffer('hello');
    const encoded = framer.encode(payload);
    expect(encoded.length).toBe(payload.length + 4);
    expect(encoded.readUInt32BE(0)).toBe(payload.length);
    expect(encoded.subarray(4).toString()).toBe('hello');
  });

  it('should emit message event for a single frame', () => {
    const payload = makeBuffer('world');
    const encoded = framer.encode(payload);
    const onMessage = vi.fn();
    framer.on('message', onMessage);

    framer.push(encoded);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it('should emit message event for multiple frames in one chunk', () => {
    const payload1 = makeBuffer('foo');
    const payload2 = makeBuffer('bar');
    const encoded1 = framer.encode(payload1);
    const encoded2 = framer.encode(payload2);

    const onMessage = vi.fn();
    framer.on('message', onMessage);

    framer.push(Buffer.concat([encoded1, encoded2]));

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage.mock.calls[0][0]).toEqual(payload1);
    expect(onMessage.mock.calls[1][0]).toEqual(payload2);
  });

  it('should handle partial frames and emit when complete', () => {
    const payload = makeBuffer('partial');
    const encoded = framer.encode(payload);

    const onMessage = vi.fn();
    framer.on('message', onMessage);

    framer.push(encoded.subarray(0, 3)); // partial header
    expect(onMessage).not.toHaveBeenCalled();

    framer.push(encoded.subarray(3, 7)); // rest of header + part of payload
    expect(onMessage).not.toHaveBeenCalled();

    framer.push(encoded.subarray(7)); // rest of payload
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it('should emit error if frame length exceeds maxFrameLength', () => {
    const framer = new LengthPrefixedFramer({ maxFrameLength: 10 });
    const payload = makeBuffer('this is too long');
    const encoded = framer.encode(payload);

    const onError = vi.fn();
    framer.on('error', onError);

    framer.push(encoded);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/exceeds limit/);
  });

  it('should reset buffer on reset()', () => {
    const payload = makeBuffer('reset');
    const encoded = framer.encode(payload);

    framer.push(encoded.subarray(0, 5)); // partial frame
    framer.reset();

    expect((framer as any).buffer.length).toBe(0);
  });

  it('should handle zero-length payload', () => {
    const payload = Buffer.alloc(0);
    const encoded = framer.encode(payload);

    const onMessage = vi.fn();
    framer.on('message', onMessage);

    framer.push(encoded);

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);
  });
});