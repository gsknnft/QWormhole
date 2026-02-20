import { EventEmitter } from "events";
import { MuxStream } from "./mux-stream";
import { MuxFramer } from "./mux-framer";
import { MuxFrame } from "./mux-frame";
import { MuxError } from "./mux-error";

const MUX_DEBUG = process.env.QW_KCP_DEBUG === "1";

export interface MuxSessionOptions {
  allowHalfOpen?: boolean;
  initialStreamId?: number;
  implicitOpen?: boolean; // allow data/close to implicitly create stream (useful for UDP reorder)
}

export class MuxSession extends EventEmitter {
  private streams = new Map<number, MuxStream>();
  private nextStreamId: number;

  constructor(
    private sendRaw: (data: Uint8Array) => void,
    private framer: MuxFramer = new MuxFramer(),
    opts: MuxSessionOptions = {},
  ) {
    super();
    this.nextStreamId = opts.initialStreamId ?? 1;
    this.opts = { implicitOpen: true, ...opts };
  }
  private opts: Required<Pick<MuxSessionOptions, "implicitOpen">> &
    Partial<MuxSessionOptions>;

  createStream(): MuxStream {
    const id = this.nextStreamId++;
    const stream = new MuxStream(id, this);
    this.streams.set(id, stream);
    this.sendFrame({
      streamId: id,
      type: "open",
    });
    return stream;
  }

  receiveRaw(buf: Uint8Array): void {
    const frames = this.framer.decode(buf);
    for (const frame of frames) this.handleFrame(frame);
  }

  private handleFrame(frame: MuxFrame): void {
    let stream = this.streams.get(frame.streamId);

    if (!stream) {
      if (frame.type === "open" || this.opts.implicitOpen) {
        stream = new MuxStream(frame.streamId, this);
        this.streams.set(frame.streamId, stream);
        this.emit("stream", stream);
      } else {
        throw new MuxError(
          "MUX_UNKNOWN_STREAM",
          `Unknown stream ${frame.streamId}`,
        );
      }
    }

    switch (frame.type) {
      case "open":
        // Already handled above (stream creation), nothing else to do
        break;
      case "data":
        stream._pushData(frame.payload);
        break;
      case "close":
      case "reset":
        stream._remoteClose();
        this.streams.delete(frame.streamId);
        break;
      case "window":
        // window/flow-control placeholder
        this.emit("window", frame);
        break;
      default:
        throw new MuxError(
          "MUX_PROTOCOL_VIOLATION",
          `Unhandled frame type ${frame.type}`,
        );
    }
  }

  sendFrame(frame: MuxFrame): void {
    const encoded = this.framer.encode(frame);
    if (MUX_DEBUG) {
      console.log("[mux:sendFrame]", {
        type: frame.type,
        streamId: frame.streamId,
        len: frame.payload?.length ?? 0,
      });
    }
    this.sendRaw(encoded);
  }
}
