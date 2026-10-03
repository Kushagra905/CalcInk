import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.CALCINK_BASE_PATH ?? "/",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["ink-on", "onnxruntime-web", "@huggingface/transformers"] },
  build: {
    outDir: "dist-lab",
    rollupOptions: { input: fileURLToPath(new URL("./tools/model-lab/index.html", import.meta.url)) },
  },
});
