import { writeFile } from "node:fs/promises";
import os from "node:os";
import { expect, type Page, test } from "@playwright/test";
import { PAGE } from "../../src/document/rows";
import type { RecognitionResponse } from "../../src/recognition/protocol";

declare global {
  interface Window {
    calcinkPublicResults: RecognitionResponse[];
  }
}
async function stroke(page: Page, points: [number, number][]) {
  const canvas = page.locator('[data-layer="live"]');
  await page.locator(".row-guide").first().scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing notebook canvas");
  await page.mouse.move(
    box.x + (points[0][0] * box.width) / 960,
    box.y + (points[0][1] * box.height) / PAGE.height,
  );
  await page.mouse.down();
  for (const [x, y] of points.slice(1))
    await page.mouse.move(
      box.x + (x * box.width) / 960,
      box.y + (y * box.height) / PAGE.height,
    );
  await page.mouse.up();
}

test("published build performs input-dependent real WASM inference after disconnected reload", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.calcinkPublicResults = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data.type === "RESULT")
            window.calcinkPublicResults.push(data.response);
        });
      }
    };
  });
  await page.goto("./");
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 100_000,
  });
  const buildVersion = await page
    .locator('meta[name="calcink-build"]')
    .getAttribute("content");
  if (process.env.CALCINK_EXPECTED_VERSION)
    expect(buildVersion).toBe(process.env.CALCINK_EXPECTED_VERSION);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 60_000,
  });
  expect(
    await page.locator('meta[name="calcink-build"]').getAttribute("content"),
  ).toBe(buildVersion);
  const drawEquals = async () => {
    await stroke(page, [
      [180, 68],
      [222, 68],
    ]);
    await stroke(page, [
      [180, 88],
      [222, 88],
    ]);
  };
  await stroke(page, [
    [120, 55],
    [136, 42],
    [136, 110],
  ]);
  await drawEquals();
  await expect(page.locator('[data-row="row-1"]')).toHaveClass(/ready/, {
    timeout: 15_000,
  });
  const first = await page.evaluate(() => window.calcinkPublicResults.at(-1));
  expect(first?.modelId).toBe("ink-on-comer-int8");
  expect(first?.timing.inferenceMs).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await stroke(page, [
    [130, 42],
    [108, 84],
    [152, 84],
  ]);
  await stroke(page, [
    [144, 42],
    [144, 110],
  ]);
  await drawEquals();
  await expect(page.locator('[data-row="row-1"]')).toHaveClass(/ready/, {
    timeout: 15_000,
  });
  const second = await page.evaluate(() => window.calcinkPublicResults.at(-1));
  expect(second?.modelId).toBe("ink-on-comer-int8");
  expect(second?.transcript.length).toBeGreaterThan(0);
  expect(second?.transcript).not.toBe(first?.transcript);
  expect(page.workers()).toHaveLength(1);
  expect(errors).toEqual([]);
  const evidence = {
    recordedAt: new Date().toISOString(),
    url: page.url(),
    buildVersion,
    environment: {
      cpu: os.cpus()[0]?.model,
      os: `${os.platform()} ${os.release()}`,
      browser: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      headless: true,
    },
    cachePreparedOnline: true,
    disconnectedReload: true,
    activeWorkers: page.workers().length,
    first,
    second,
    errors,
    scope:
      "Synthetic engineering inputs on the public production build. Real local inference works after offline reload and changes with ink. No handwriting accuracy or correct-arithmetic claim.",
  };
  await writeFile(
    test.info().outputPath("public-offline.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  console.log(JSON.stringify(evidence, null, 2));
});
