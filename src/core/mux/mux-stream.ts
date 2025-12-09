import { EventEmitter } from "events";
import { MuxSession } from "./mux-session";

export class MuxStream extends EventEmitter {
  private closed = false;

  constructor(
    public id: number,
    private session: MuxSession,
  ) {
    super();
  }

  write(data: Uint8Array): void {
    if (this.closed) return;
    this.session.sendFrame({
      streamId: this.id,
      type: "data",
      payload: data,
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.session.sendFrame({
      streamId: this.id,
      type: "close",
    });
    this.emit("close");
  }

  _pushData(data?: Uint8Array): void {
    if (data) this.emit("data", data);
  }

  _remoteClose(): void {
    this.closed = true;
    this.emit("close");
  }
}
