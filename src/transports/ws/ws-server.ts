import { WSTransportServer } from "./ws-transport";

export class WsServer extends WSTransportServer {
  constructor({port}: {port: number}) {
    super(port);
  }
}
