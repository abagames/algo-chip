import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@algo-chip/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@algo-chip/util": resolve(__dirname, "../../packages/util/src/index.ts"),
    },
  },
});
