import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type { RecognitionResponse } from "../../src/recognition/protocol";

declare global {
  interface Window {
    calcinkTestResults: RecognitionResponse[];
  }
}
test.use({ viewport: { width: 1280, height: 1100 } });

async function watchResults(page: Page) {
  await page.addInitScript(() => {
    window.calcinkTestResults = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (event.data.type === "RESULT")
            window.calcinkTestResults.push(event.data.response);
        });
      }
    };
  });
}
async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 90_000,
  });
  await expect(page.locator(".mock-notice")).toHaveCount(0);
}
async function stroke(page: Page, points: [number, number][]) {
  const canvas = page.locator('[data-layer="live"]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  const move = async ([x, y]: [number, number]) =>
    page.mouse.move(
      box.x + (x / 960) * box.width,
      box.y + (y / 480) * box.height,
    );
  await move(points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await move(point);
  await page.mouse.up();
}
// Synthetic engineering input; excluded from genuine handwriting evaluation.
async function oneEquals(page: Page) {
  await stroke(page, [
    [120, 55],
    [136, 42],
    [136, 110],
  ]);
  await stroke(page, [
    [180, 68],
    [222, 68],
  ]);
  await stroke(page, [
    [180, 88],
    [222, 88],
  ]);
}
async function bitmap(page: Page) {
  return page
    .locator('[data-layer="ink"]')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}
async function removeWeight(page: Page, corrupt = false) {
  await page.evaluate(async (poison) => {
    const version = document.querySelector<HTMLMetaElement>(
      'meta[name="calcink-build"]',
    )?.content;
    const name = (await caches.keys()).find(
      (key) => key.startsWith("calcink:") && key.endsWith(`:${version}`),
    );
    if (!name) throw new Error("Missing build cache");
    const cache = await caches.open(name);
    const key = (await cache.keys()).find((request) =>
      request.url.endsWith("encoder_int8.onnx"),
    );
    if (!key) throw new Error("Missing weight");
    if (poison) {
      const response = await cache.match(key);
      if (!response) throw new Error("Missing weight response");
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytes[0] ^= 1;
      await cache.put(key, new Response(bytes));
    } else await cache.delete(key);
    navigator.serviceWorker.controller?.postMessage({
      type: "PREPARE",
      version,
      modelId: "ink-on-comer-int8",
    });
  }, corrupt);
}

test("production caches real ink-on under a base path and infers after offline reload", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4183/CalcInk/") &&
      !request.url().startsWith("blob:")
    )
      external.push(request.url());
  });
  await watchResults(page);
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 90_000,
  });
  await oneEquals(page);
  await expect(page.locator(".row-feedback").first()).toHaveClass(/ready/, {
    timeout: 15_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.calcinkTestResults.length), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  const result = await page.evaluate(() => window.calcinkTestResults.at(-1));
  console.log("Actual offline synthetic inference:", JSON.stringify(result));
  expect(result?.modelId).toBe("ink-on-comer-int8");
  expect(result?.transcript.length).toBeGreaterThan(0);
  expect(result?.timing.inferenceMs).toBeGreaterThan(0);
  expect(result?.transcript).not.toBe("18+4*3=");
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
  await stroke(page, [
    [180, 68],
    [222, 68],
  ]);
  await stroke(page, [
    [180, 88],
    [222, 88],
  ]);
  await expect(page.locator(".row-feedback").first()).toHaveClass(/ready/, {
    timeout: 15_000,
  });
  await expect
    .poll(
      () => page.evaluate(() => window.calcinkTestResults.at(-1)?.transcript),
      { timeout: 15_000 },
    )
    .not.toBe(result?.transcript);
  console.log(
    "Actual second offline synthetic inference:",
    JSON.stringify(await page.evaluate(() => window.calcinkTestResults.at(-1))),
  );
  expect(external).toEqual([]);
});

test("verified caches cannot claim readiness when real model initialization fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("TEST_INITIALIZATION_FAILURE");
      }
    } as unknown as typeof Worker;
  });
  await page.goto("./");
  await expect(page.getByTestId("offline-status")).toHaveText(
    "Offline files verified. Waiting for recognition to initialize.",
    { timeout: 90_000 },
  );
  await expect(page.locator(".model-message")).toContainText(
    "TEST_INITIALIZATION_FAILURE",
  );
});

test("missing and corrupted cached weights prevent readiness and recover without losing ink", async ({
  page,
  context,
}) => {
  await ready(page);
  await stroke(page, [
    [100, 60],
    [120, 100],
  ]);
  const ink = await bitmap(page);
  await context.setOffline(true);
  await removeWeight(page);
  await expect(page.getByTestId("offline-status")).toContainText(
    "could not be verified",
    { timeout: 15_000 },
  );
  expect(await bitmap(page)).toBe(ink);
  await context.setOffline(false);
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 60_000,
  });
  await context.setOffline(true);
  await removeWeight(page, true);
  await expect(page.getByTestId("offline-status")).toContainText(
    "could not be verified",
    { timeout: 15_000 },
  );
  expect(await bitmap(page)).toBe(ink);
  await context.setOffline(false);
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 60_000,
  });
  expect(await bitmap(page)).toBe(ink);
});

test("quota failure is visible and retry preserves committed ink", async ({
  page,
  context,
}) => {
  await ready(page);
  await stroke(page, [
    [100, 60],
    [120, 100],
  ]);
  const ink = await bitmap(page);
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error("Missing service worker");
  await worker.evaluate(() => {
    const target = globalThis as typeof globalThis & {
      originalPut: typeof Cache.prototype.put;
    };
    target.originalPut = Cache.prototype.put;
    Cache.prototype.put = function (...args) {
      if (String(args[0]).includes("encoder_int8.onnx"))
        return Promise.reject(
          new DOMException("Quota full", "QuotaExceededError"),
        );
      return target.originalPut.apply(this, args);
    };
  });
  await removeWeight(page);
  await expect(page.getByTestId("offline-status")).toContainText(
    "Storage is full",
    { timeout: 30_000 },
  );
  expect(await bitmap(page)).toBe(ink);
  await worker.evaluate(() => {
    Cache.prototype.put = (
      globalThis as typeof globalThis & {
        originalPut: typeof Cache.prototype.put;
      }
    ).originalPut;
  });
  await page.getByRole("button", { name: "Retry offline preparation" }).click();
  await expect(page.getByTestId("offline-status")).toHaveText("Ready offline", {
    timeout: 60_000,
  });
  expect(await bitmap(page)).toBe(ink);
});

test("updates preserve ink, require other tabs to close and retire old caches after activation", async ({
  page,
  context,
}) => {
  const files = [
    "dist/index.html",
    "dist/service-worker.js",
    "dist/offline-manifest.json",
  ];
  const originals = await Promise.all(files.map((path) => readFile(path)));
  try {
    await ready(page);
    await stroke(page, [
      [100, 60],
      [120, 100],
    ]);
    const ink = await bitmap(page);
    const oldVersion = await page
      .locator('meta[name="calcink-build"]')
      .getAttribute("content");
    await writeFile(
      files[0],
      originals[0].toString().replace("<title>", "<title>Update QA "),
    );
    const build = spawnSync(process.execPath, ["scripts/offline-build.mjs"], {
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    const update = page.getByRole("button", { name: "Reload to update" });
    await expect(update).toBeVisible({ timeout: 30_000 });
    await expect(update).toBeDisabled();
    expect(await bitmap(page)).toBe(ink);
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(update).toBeEnabled();
    const other = await context.newPage();
    await ready(other);
    await update.click();
    await expect(page.getByTestId("offline-status")).toContainText(
      "Close other CalcInk tabs",
    );
    expect(
      await page.locator('meta[name="calcink-build"]').getAttribute("content"),
    ).toBe(oldVersion);
    await other.close();
    await update.click();
    await expect(
      page.locator('meta[name="calcink-build"]'),
    ).not.toHaveAttribute("content", oldVersion ?? "");
    await expect(page.getByTestId("offline-status")).toHaveText(
      "Ready offline",
      { timeout: 90_000 },
    );
    const names = await page.evaluate(() => caches.keys());
    expect(names.filter((name) => name.startsWith("calcink:"))).toHaveLength(1);
    expect(names.some((name) => name.endsWith(`:${oldVersion}`))).toBe(false);
  } finally {
    for (let i = 0; i < files.length; i++)
      await writeFile(files[i], originals[i]);
  }
});
