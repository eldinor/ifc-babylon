import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
    },
  },
  plugins: [
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
  // Library build configuration
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "BabylonIfcLoader",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["@babylonjs/core", "web-ifc"],
      output: {
        globals: {
          "@babylonjs/core": "BABYLON",
          "web-ifc": "WebIFC",
        },
      },
    },
    outDir: "dist",
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
