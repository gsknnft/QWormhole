import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import ts from "./tsconfig.json";

const externalDeps = [
  "fs", "path", "os", "http", "https", "stream", "zlib",
  "events", "buffer", "util", "crypto", "child_process", "readline",
  "@sigilnet/fft-legacy", "@gsknnft/bigint-buffer"
  // keep only runtime externals here
];

const tsPaths =
  ts.compilerOptions && "paths" in ts.compilerOptions && ts.compilerOptions.paths
    ? Object.keys(ts.compilerOptions.paths).map(key => key.replace("/*", ""))
    : [];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
    },
    external: [...externalDeps, ...tsPaths],
  },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

