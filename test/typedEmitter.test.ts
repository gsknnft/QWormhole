import { describe, expect, it, vi } from "vitest";
import { TypedEventEmitter } from "../src/typedEmitter";

type Events = {
  data: number;
  empty: void;
  error: Error;
};

describe("TypedEventEmitter", () => {
  it("emits typed payloads to listeners", () => {
    const emitter = new TypedEventEmitter<Events>();
    const handler = vi.fn();
    emitter.on("data", handler);
    emitter.emit("data", 42);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it("supports once subscriptions", () => {
    const emitter = new TypedEventEmitter<Events>();
    const handler = vi.fn();
    emitter.once("data", handler);
    emitter.emit("data", 1);
    emitter.emit("data", 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("allows removing listeners via off", () => {
    const emitter = new TypedEventEmitter<Events>();
    const handler = vi.fn();
    emitter.on("data", handler);
    emitter.off("data", handler);
    emitter.emit("data", 5);
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits void events without payload", () => {
    const emitter = new TypedEventEmitter<Events>();
    const handler = vi.fn();
    emitter.on("empty", handler);
    emitter.emit("empty");
    expect(handler).toHaveBeenCalledWith();
  });

  it("surfaces errors when no listener handles error", () => {
    const emitter = new TypedEventEmitter<Events>();
    expect(() => emitter.emit("error", new Error("boom"))).toThrow("boom");
  });

  it("routes error event to handler when registered", () => {
    const emitter = new TypedEventEmitter<Events>();
    const handler = vi.fn();
    emitter.on("error", handler);
    const err = new Error("handled");
    emitter.emit("error", err);
    expect(handler).toHaveBeenCalledWith(err);
  });
});
