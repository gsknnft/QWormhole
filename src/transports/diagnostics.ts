import type { QWormholeTransport } from "./transport";

type MetricsEvent = { transport: string; [key: string]: unknown };

export function attachTransportDiagnostics(
  transport: QWormholeTransport,
  sink: (m: MetricsEvent) => void = m => console.log("[transport]", m),
): void {
  const base = { transport: transport.type };

  transport.on("data", buf => {
    sink({ ...base, event: "data", bytes: buf.byteLength, ts: Date.now() });
  });
  transport.on("error", err => {
    sink({ ...base, event: "error", error: err instanceof Error ? err.message : String(err) });
  });
  transport.on?.("close", () => sink({ ...base, event: "close" }));

  // KCP-specific metrics hook
  transport.on?.("kcp:metrics", metrics => {
    sink({ ...base, event: "kcp:metrics", ...metrics });
  });
}
