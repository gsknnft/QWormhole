import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, '../src/renderer'),
  base: './',
  cacheDir: path.resolve(__dirname, '../node_modules/.vite-renderer'),

  plugins: [react({}), tsconfigPaths()],

  build: {
    outDir: path.resolve(__dirname, '../app/dist/renderer'),
    emptyOutDir: true,
    target: 'esnext', // Electron can run ES2022+ fine
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: true,
    assetsInlineLimit: 4096, // inline small assets
    rollupOptions: {
      input: path.resolve(__dirname, '../src/renderer/index.html'),
      output: {
        format: 'esm', // ✅ Still ESM
        manualChunks: {
          // Split vendor chunks for better caching
          react: ['react', 'react-dom'],
        },
      },
      external: [
        ...builtinModules,                 // Node core modules
        ...builtinModules.map(m => `node:${m}`), // Node-prefixed
        'electron',
        '@gsknnft/bigint-buffer',
        '@sigilnet/fft-legacy',
        'path',
        'fs'
      ],
    },
  },

  resolve: {
    alias: {
      '@app': path.resolve(__dirname, '../src/app'),
      '@components': path.resolve(__dirname, '../src/app/components'),
      '@': path.resolve(__dirname, '../src'),
    },
  },

  optimizeDeps: {
    include: ['react', 'react-dom'],
  },

  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
