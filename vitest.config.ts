import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    mockReset: true,
    coverage: {
      enabled: true,
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    alias: {
      qwormhole: path.resolve(__dirname, "src"),
    },
  },
});
