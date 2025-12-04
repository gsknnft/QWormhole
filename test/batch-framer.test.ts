import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BatchFramer, createBatchFramer } from "../src/batch-framer";
import net from "node:net";

describe("BatchFramer", () => {
  let framer: BatchFramer;

  beforeEach(() => {
    framer = new BatchFramer();
  });

  afterEach(() => {
    framer.reset();
  });

  describe("encode", () => {
    it("encodes payload with 4-byte length prefix", () => {
      const payload = Buffer.from("hello");
      const encoded = framer.encode(payload);
      expect(encoded.length).toBe(4 + payload.length);
      expect(encoded.readUInt32BE(0)).toBe(payload.length);
      expect(encoded.subarray(4).toString()).toBe("hello");
    });

    it("handles empty payload", () => {
      const payload = Buffer.alloc(0);
      const encoded = framer.encode(payload);
      expect(encoded.length).toBe(4);
      expect(encoded.readUInt32BE(0)).toBe(0);
    });
  });

  describe("push (decode)", () => {
    it("emits message event for complete frame", () => {
      const payload = Buffer.from("world");
      const onMessage = vi.fn();
      framer.on("message", onMessage);

      const encoded = framer.encode(payload);
      framer.push(encoded);

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(payload);
    });

    it("handles multiple frames in one chunk", () => {
      const payload1 = Buffer.from("foo");
      const payload2 = Buffer.from("bar");
      const onMessage = vi.fn();
      framer.on("message", onMessage);

      const combined = Buffer.concat([
        framer.encode(payload1),
        framer.encode(payload2),
      ]);
      framer.push(combined);

      expect(onMessage).toHaveBeenCalledTimes(2);
      expect(onMessage.mock.calls[0][0]).toEqual(payload1);
      expect(onMessage.mock.calls[1][0]).toEqual(payload2);
    });

    it("handles partial frames across multiple pushes", () => {
      const payload = Buffer.from("partial test");
      const encoded = framer.encode(payload);
      const onMessage = vi.fn();
      framer.on("message", onMessage);

      // Push in chunks
      framer.push(encoded.subarray(0, 2)); // partial header
      expect(onMessage).not.toHaveBeenCalled();

      framer.push(encoded.subarray(2, 6)); // rest of header + partial payload
      expect(onMessage).not.toHaveBeenCalled();

      framer.push(encoded.subarray(6)); // rest of payload
      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(payload);
    });

    it("emits error for oversized frames", () => {
      const smallFramer = new BatchFramer({ maxFrameLength: 10 });
      const payload = Buffer.alloc(20); // Too large
      const onError = vi.fn();
      smallFramer.on("error", onError);

      const encoded = smallFramer.encode(payload);
      smallFramer.push(encoded);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toMatch(/exceeds limit/);
    });
  });

  describe("batch operations", () => {
    it("queues frames for batching", () => {
      const payload = Buffer.from("batch me");
      framer.encodeToBatch(payload);
      expect(framer.pendingBatchSize).toBe(1);
      expect(framer.pendingBatchBytes).toBe(4 + payload.length);
    });

    it("accumulates multiple frames in batch", () => {
      framer.encodeToBatch(Buffer.from("one"));
      framer.encodeToBatch(Buffer.from("two"));
      framer.encodeToBatch(Buffer.from("three"));

      expect(framer.pendingBatchSize).toBe(3);
    });
  });

  describe("reset", () => {
    it("clears all buffers and state", () => {
      framer.encodeToBatch(Buffer.from("test"));
      framer.push(Buffer.from([0, 0, 0, 5, 104])); // partial frame

      framer.reset();

      expect(framer.pendingBatchSize).toBe(0);
      expect(framer.pendingBatchBytes).toBe(0);
    });
  });

  describe("createBatchFramer helper", () => {
    it("creates framer with custom batch size", () => {
      const customFramer = createBatchFramer(32);
      // Verify it's a valid BatchFramer
      expect(customFramer).toBeInstanceOf(BatchFramer);
    });

    it("creates framer with default batch size", () => {
      const defaultFramer = createBatchFramer();
      expect(defaultFramer).toBeInstanceOf(BatchFramer);
    });
  });

  describe("options", () => {
    it("respects maxFrameLength option", () => {
      const customFramer = new BatchFramer({ maxFrameLength: 100 });
      const onError = vi.fn();
      customFramer.on("error", onError);

      // Create a frame that exceeds the limit
      const header = Buffer.alloc(4);
      header.writeUInt32BE(200, 0);
      customFramer.push(header);

      expect(onError).toHaveBeenCalled();
    });

    it("respects batchSize option for auto-flush", async () => {
      const smallBatchFramer = new BatchFramer({
        batchSize: 2,
        flushIntervalMs: 0, // disable timer flush
      });

      const mockSocket = {
        write: vi.fn(() => true),
        cork: vi.fn(),
        uncork: vi.fn(),
        destroyed: false,
        on: vi.fn(),
      } as unknown as net.Socket;

      smallBatchFramer.attachSocket(mockSocket);

      // Use flush event for deterministic synchronization
      const flushPromise = new Promise<void>(resolve => {
        smallBatchFramer.once("flush", () => resolve());
      });

      // Add frames - should not flush yet
      smallBatchFramer.encodeToBatch(Buffer.from("one"));
      expect(smallBatchFramer.pendingBatchSize).toBe(1);

      // Adding second frame should trigger flush at batchSize=2
      smallBatchFramer.encodeToBatch(Buffer.from("two"));

      // Wait for the flush event instead of arbitrary timeout
      await flushPromise;

      expect(mockSocket.write).toHaveBeenCalled();
    });
  });
});
