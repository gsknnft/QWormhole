import { EventEmitter } from "node:events";

export interface RuntimeOptions {
  id?: string;
  protocolVersion?: string;
  handshakeTags?: Record<string, string | number>;
  preferNative?: boolean;
  forceTs?: boolean;
  detectNative?: boolean;
  debug?: boolean;
}

export abstract class BaseRuntime<
  TMessage = unknown,
  TOptions extends RuntimeOptions = RuntimeOptions,
> extends EventEmitter {
  protected readonly opts: TOptions;
  protected started = false;

  constructor(options: TOptions = {} as TOptions) {
    super();
    this.opts = options;
  }

  abstract listen(port?: number): Promise<void>;
  abstract connect(url: string): Promise<void>;
  abstract send(msg: TMessage): Promise<void>;
  abstract close(): Promise<void>;

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.opts.debug) {
      console.log(`[${this.constructor.name}] init with`, this.opts);
    }
    this.emit("init", this.opts);
  }

  protected log(...args: any[]) {
    if (this.opts.debug) console.log(`[${this.constructor.name}]`, ...args);
  }

  // Async iterator for messages
  async *messages(): AsyncGenerator<TMessage> {
    const queue: TMessage[] = [];
    const push = (m: TMessage) => queue.push(m);
    this.on("message", push);
    try {
      while (true) {
        if (queue.length > 0) yield queue.shift()!;
        else await new Promise((r) => setTimeout(r, 10));
      }
    } finally {
      this.off("message", push);
    }
  }
}
