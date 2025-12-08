import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import { builtinModules } from 'node:module';

export default defineConfig({
  cacheDir: path.resolve(__dirname, '../node_modules/.vite-preload'),
  
  build: {
    outDir: path.resolve(__dirname, '../app/dist/preload'),
    emptyOutDir: true,
    target: 'esnext',
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, '../src/preload/index.ts'),
      external: [
        ...builtinModules,                 // Node core modules
        ...builtinModules.map(m => `node:${m}`), // Node-prefixed
        'electron',
        '@gsknnft/bigint-buffer',
        "@sigilnet/QWave",
        '@sigilnet/fft-legacy',
        'path',
        'fs'
      ],
      
      output: {
        format: 'cjs', // ✅ Pure ESM
        entryFileNames: 'index.js',
      },
    },
  },
  
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../src/app'),
      '@': path.resolve(__dirname, '../src'),
    },
  },
  
  plugins: [tsconfigPaths()],
});
