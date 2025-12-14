import { WSTransportServer } from "./ws-transport";

export class WsServer extends WSTransportServer {

  constructor({port}: {port: number}) {
    super(port);
  }
  

  initialize(): void {
    this.start();
  }

  close(): void {
    this.stop();
  }

  ensureConnected(): Promise<void> {
    return Promise.resolve();
  }
}
