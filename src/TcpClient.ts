// Default to the pure TypeScript client; native is exposed separately via NativeTcpClient.
export { QWormholeClient as TcpClient } from "./client";
export type { QWormholeClientOptions as TcpClientOptions } from "./types/types";
