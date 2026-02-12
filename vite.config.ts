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

        // Copy only the main WASM file (single-threaded version)
        // web-ifc-mt.wasm requires Web Workers setup (not configured)
        // web-ifc-node.wasm is for Node.js only (not needed in browser)
        const wasmFiles = ["web-ifc.wasm"];
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
      },
    },
  ],
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
});
