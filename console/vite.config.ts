import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react({
  })],
  root: ".",
  resolve: {
    alias: {
      "@console": path.resolve(__dirname, "src"),
      "@features": path.resolve(__dirname, "src/features"),
      "@components": path.resolve(__dirname, "src/components"),
      "@routes": path.resolve(__dirname, "src/routes"),
      "@stores": path.resolve(__dirname, "src/stores"),
    },
  },
  server: {
    port: 4173,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.html'),
      name: "ConsoleApp",
      fileName: "index",
    },
  },
});
