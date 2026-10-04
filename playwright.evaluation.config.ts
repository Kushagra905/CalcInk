import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/evaluation",
  outputDir: "test-results/evaluation",
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4193/",
    browserName: "chromium",
    channel: process.env.CALCINK_BROWSER_CHANNEL,
  },
  webServer:
    process.env.CALCINK_EXTERNAL_SERVER === "1"
      ? undefined
      : {
          command: "npm run preview:lab -- --port 4193 --strictPort",
          url: "http://127.0.0.1:4193/tools/model-lab/final.html",
          reuseExistingServer: false,
        },
});
