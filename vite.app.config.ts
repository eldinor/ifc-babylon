import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Vite config for building the web application (not the library)
 * This builds the demo app with IFC viewer functionality
 */
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
  worker: {
    format: "es", // Required for WASM workers in some setups
  },
  // App build configuration (not library mode)
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    copyPublicDir: true,
    sourcemap: true,
    minify: "esbuild",
    rollupOptions: {
      input: {
        main: "index.html",
        "index-main": "index-main.html",
      },
    },
  },
});
