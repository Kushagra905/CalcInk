import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  outputDir: "test-results/offline",
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4183/CalcInk/",
    browserName: "chromium",
    channel: process.env.CALCINK_BROWSER_CHANNEL,
    deviceScaleFactor: 2,
  },
  webServer:
    process.env.CALCINK_EXTERNAL_SERVER === "1"
      ? undefined
      : {
          command:
            "npm run preview -- --port 4183 --strictPort --base /CalcInk/",
          url: "http://127.0.0.1:4183/CalcInk/",
          reuseExistingServer: false,
        },
});
