import { defineConfig } from "vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["src/test/**/*"],
      rollupTypes: true
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "AlgoChip",
      formats: ["es", "umd"],
      fileName: (format) => format === "es" ? "index.js" : "algo-chip.umd.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        exports: "named"
      }
    },
    sourcemap: true
  }
});
