import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    {
      name: "copy-wasm",
      buildStart() {
        // Ensure public directory exists
        const publicDir = resolve(__dirname, "public");
        if (!existsSync(publicDir)) {
          mkdirSync(publicDir, { recursive: true });
        }

        // Copy WASM files to public directory
        const wasmFiles = ["web-ifc.wasm", "web-ifc-mt.wasm", "web-ifc-node.wasm"];
        wasmFiles.forEach((file) => {
          try {
            const src = resolve(__dirname, "node_modules/web-ifc", file);
            const dest = resolve(publicDir, file);
            if (existsSync(src)) {
              copyFileSync(src, dest);
              console.log(`✓ Copied ${file} to public directory`);
            }
          } catch (e) {
            console.warn(`Could not copy ${file}:`, e);
          }
        });

        // Copy JS API files that might be needed
        const jsFiles = ["web-ifc-api.js"];
        jsFiles.forEach((file) => {
          try {
            const src = resolve(__dirname, "node_modules/web-ifc", file);
            const dest = resolve(publicDir, file);
            if (existsSync(src)) {
              copyFileSync(src, dest);
              console.log(`✓ Copied ${file} to public directory`);
            }
          } catch (e) {
            console.warn(`Could not copy ${file}:`, e);
          }
        });
      },
    },
  ],
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
});
