import { defineConfig } from "@playwright/test";
import offline from "./playwright.offline.config";

export default defineConfig({
  ...offline,
  testDir: "./tests/performance",
  outputDir: "test-results/performance",
  timeout: 600_000,
});
