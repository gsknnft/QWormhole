import type { CoherenceTelemetryEntry } from "./types";

export interface CoherenceTelemetrySink {
  emit: (entry: CoherenceTelemetryEntry) => void;
}

export function createConsoleTelemetrySink(
  prefix = "[coherence]",
): CoherenceTelemetrySink {
  return {
    emit: entry => {
      // Keep the payload JSON so downstream tools can parse it.
       
      console.log(prefix, JSON.stringify(entry));
    },
  };
}
