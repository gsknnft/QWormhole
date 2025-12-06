import type { QWormholeTelemetry } from "src/types/types";

/**
 * Simple console telemetry logger; pass to onTelemetry to trace backpressure and bytes.
 */
export const createConsoleTelemetryLogger = (prefix = "QWormhole") => {
  return (metrics: QWormholeTelemetry) => {
    const msg = [
      `[${prefix}]`,
      `conn=${metrics.connections}`,
      `in=${metrics.bytesIn}`,
      `out=${metrics.bytesOut}`,
      `bp=${metrics.backpressureEvents}`,
      `drain=${metrics.drainEvents}`,
    ].join(" ");
    console.log(msg);
  };
};
