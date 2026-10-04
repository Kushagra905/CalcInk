import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/public",
  outputDir: "test-results/public",
  workers: 1,
  timeout: 150_000,
  use: {
    baseURL:
      process.env.CALCINK_PUBLIC_URL ??
      "https://kushagra905.github.io/CalcInk/",
    browserName: "chromium",
    channel: process.env.CALCINK_BROWSER_CHANNEL,
    viewport: { width: 1280, height: 1100 },
  },
});
