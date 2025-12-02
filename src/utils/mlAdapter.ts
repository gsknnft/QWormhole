// Define JsonValue type if not imported from elsewhere
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface MLAdapter {
  name: string;
  run(metrics: JsonValue): Promise<JsonValue>;
}

let activeAdapter: MLAdapter = createNoopAdapter();

export function setMLAdapter(adapter: MLAdapter) {
  activeAdapter = adapter;
}

export function queryMLLayer(metrics: JsonValue) {
  return activeAdapter.run(metrics);
}

function createNoopAdapter(): MLAdapter {
  return {
    name: "noop",
    async run(metrics: JsonValue): Promise<JsonValue> {
      // No operation: just return the input metrics unchanged
      return metrics;
    }
  };
}
