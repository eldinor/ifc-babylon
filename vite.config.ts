import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    wasm(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/web-ifc/web-ifc.wasm",
          dest: ".",
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ["web-ifc"], // Critical: Prevents esbuild from choking on WASM/native modules
  },
  assetsInclude: ["**/*.wasm"], // Ensures Vite processes .wasm files correctly
  // Optional: If using multi-threaded version (web-ifc-mt)
  worker: {
    format: "es", // Required for WASM workers in some setups
  },
});
