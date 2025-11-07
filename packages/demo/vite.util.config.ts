import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib/umd.ts"),
      name: "AlgoChipUtil",
      formats: ["umd"],
      fileName: () => "algo-chip-util-umd.js",
    },
    outDir: "dist/util",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external: ["@algo-chip/core"],
      output: {
        globals: {
          "@algo-chip/core": "AlgoChip",
        },
      },
    },
  },
});
