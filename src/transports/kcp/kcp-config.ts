export interface KcpNodelay {
  nodelay: number; // 0: normal, 1: nodelay
  interval: number; // internal update interval (ms)
  resend: number; // fast resend
  nc: number; // 0: normal congestion control, 1: disable
}

export interface KcpConfig {
  conv: number;
  mtu?: number;
  sndWnd?: number;
  rcvWnd?: number;
  nodelay?: Partial<KcpNodelay>;
  stream?: boolean;
  ackNodelay?: boolean;
  updateIntervalMs?: number;
}

export const DEFAULT_KCP_CONFIG: Required<Omit<KcpConfig, "conv">> = {
  mtu: 1350,
  sndWnd: 128,
  rcvWnd: 128,
  stream: true,
  ackNodelay: false,
  updateIntervalMs: 10,
  nodelay: {
    nodelay: 1,
    interval: 10,
    resend: 2,
    nc: 1,
  },
};
