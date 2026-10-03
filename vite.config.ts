import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  if (command === "build" && mode === "mock") {
    throw new Error(
      "Mock recognition is development-only. Build without --mode mock.",
    );
  }
  return {
    plugins: [react()],
    base: "./",
    worker: { format: "es" },
    optimizeDeps: {
      exclude: ["ink-on", "onnxruntime-web", "@huggingface/transformers"],
    },
    resolve: {
      alias: {
        "#recognition": fileURLToPath(
          new URL(
            command === "serve" && mode === "mock"
              ? "./src/dev/mockCoordinator.ts"
              : "./src/recognition/connect.ts",
            import.meta.url,
          ),
        ),
      },
    },
    test: { include: ["tests/unit/**/*.test.ts"] },
  };
});
