import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
// import fs from 'node:fs';

export default defineConfig({
  cacheDir: path.resolve(__dirname, '../node_modules/.vite-main'),

  build: {
    outDir: path.resolve(__dirname, '../app/dist/main'),
    emptyOutDir: true,
    target: 'esnext',
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: true,
      lib: {
        entry: '../src/main/index.ts',
        formats: ['cjs'],        // 👈 CommonJS
        fileName: () => 'index.js',
      },

    rollupOptions: {
      input: {
        main: path.resolve(__dirname, '../src/main/index.ts'),
      },
      external: [
        ...builtinModules,                 // Node core modules
        ...builtinModules.map(m => `node:${m}`), // Node-prefixed
        'electron',
        '@sigilnet/fft-legacy',
        '@gsknnft/bigint-buffer',
        "@sigilnet/QWave",
        'path',
        'fs'
      ],
      output: {
        format: 'es', // ✅ Pure ESM
      },
    },
  },
  
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../src/app'),
      '@': path.resolve(__dirname, '../src'),
    },
  },
  
  plugins: [tsconfigPaths({ projects: [path.resolve(__dirname, '../tsconfig.main.json')] })],
});
