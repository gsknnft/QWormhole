import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    mockReset: true,
    // Test timeouts to prevent hanging
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    // Use threads pool with single thread for consistent test ordering
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Disable file parallelism to reduce memory usage and ensure clean teardown
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
