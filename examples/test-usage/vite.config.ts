import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/web-ifc/web-ifc.wasm",
          dest: ".",
        },
        {
          // Copy WASM from babylon-ifc-loader package
          src: "node_modules/babylon-ifc-loader/dist/web-ifc.wasm",
          dest: ".",
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    port: 5174,
  },
});
