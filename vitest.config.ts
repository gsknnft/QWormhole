import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    mockReset: true,
    // Test timeouts to prevent hanging
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    // Use isolate mode to ensure complete process isolation
    isolate: true,
    // Pool isolation to prevent memory leaks between tests
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        // Limit max forks to reduce memory pressure
        maxForks: 4,
        minForks: 1,
      },
    },
    // Disable file parallelism to reduce memory usage
    fileParallelism: false,
    coverage: {
      enabled: false, // Disabled by default to prevent memory issues; enable with --coverage
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    alias: {
      qwormhole: path.resolve(__dirname, "src"),
    },
  },
});
