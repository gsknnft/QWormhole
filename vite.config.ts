import { defineConfig } from "vite";
import path from "path";
import ts from "./tsconfig.json";

const externalDeps = [
  "fs",
  "path",
  "os",
  "http",
  "https",
  "stream",
  "zlib",
  "events",
  "buffer",
  "util",
  "crypto",
  "child_process",
  "readline",
  "node:events",
  "node:net",
  "node:fs",
  "node:path",
  "node:os",
  "node:http",
  "node:https",
  "node:stream",
  "node:zlib",
  "node:buffer",
  "node:util",
  "node:crypto",
  "node:child_process",
  "node:readline",
  // keep only runtime externals here
];

const tsPaths =
  ts.compilerOptions &&
  "paths" in ts.compilerOptions &&
  ts.compilerOptions.paths
    ? Object.keys(ts.compilerOptions.paths).map(key => key.replace("/*", ""))
    : [];

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(process.cwd(), "src/index.ts"),
      name: "qwormhole",
      formats: ["es", "cjs"],
      fileName: format => (format === "es" ? "index.js" : "index.cjs"),
    },
    rollupOptions: {
      external: [...externalDeps, ...tsPaths],
    },
  },
});
