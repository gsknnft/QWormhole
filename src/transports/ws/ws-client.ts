import { WSTransport } from "./ws-transport";

export class WsClient extends WSTransport {
  constructor({url}: {url: string}) {
    super(url);
  }
}
