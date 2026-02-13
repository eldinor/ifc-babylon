import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["web-ifc"], // Critical: Prevents esbuild from choking on WASM/native modules
  },
  assetsInclude: ["**/*.wasm"], // Ensures Vite processes .wasm files correctly
  // Optional: If using multi-threaded version (web-ifc-mt)
  worker: {
    format: "es", // Required for WASM workers in some setups
  },
});
