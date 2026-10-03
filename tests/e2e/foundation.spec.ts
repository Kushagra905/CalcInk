import { expect, test } from "@playwright/test";

test("fixture passes through the real module worker; layers scale and export is labeled synthetic", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(3);
  const layers = await page.locator("canvas").evaluateAll((canvases) =>
    canvases.map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      if (!(canvas instanceof HTMLCanvasElement))
        throw new Error("Expected a canvas");
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr: devicePixelRatio,
      };
    }),
  );
  expect(
    layers.every(
      (layer) =>
        layer.width === Math.round(layer.cssWidth * layer.dpr) &&
        layer.height === Math.round(layer.cssHeight * layer.dpr),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Load sample fixture" }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
  await expect(page.locator('[data-row="row-2"]')).toContainText(
    "Write an expression",
  );
  await page.getByLabel("Writer", { exact: true }).fill("Writer A");
  await page.getByLabel("Expected transcript", { exact: true }).fill("18+4×3=");
  await page.getByLabel("Expected value", { exact: true }).fill("30");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export fixture JSON" }).click();
  const downloaded = await download;
  const stream = await downloaded.createReadStream();
  if (!stream) throw new Error("Missing fixture download");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const fixture = JSON.parse(Buffer.concat(chunks).toString());
  expect(fixture).toMatchObject({
    dataset: "contract",
    sampleType: "synthetic",
    writer: "Writer A",
    expectedTranscript: "18+4×3=",
    expectedValue: "30",
  });
  expect(fixture.operations.length).toBeGreaterThan(0);
  const ink = await page
    .locator('[data-layer="ink"]')
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0),
    );
  expect(ink).toBe(true);
  await page.screenshot({
    path: "test-results/phase-0-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("pointer cancellation discards provisional ink and a pen tap commits a visible dot", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  const canvas = page.locator('[data-layer="live"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas is not visible");
  await canvas.evaluate((input) => {
    input.addEventListener(
      "pointerdown",
      (event) => {
        input.setAttribute(
          "data-test-pointer",
          String((event as PointerEvent).pointerId),
        );
      },
      { once: true },
    );
  });
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await canvas.evaluate((input) => {
    input.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: Number(input.getAttribute("data-test-pointer")),
        bubbles: true,
      }),
    );
  });
  await page.mouse.up();
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  await page.mouse.click(box.x + 45, box.y + 45);
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
  await page.getByRole("button", { name: "Reset fixtures" }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
});

test("initialization failure can retry without losing the drawing interface", async ({
  page,
}) => {
  await page.goto("/?mock=init-error");
  await expect(page.getByText("Retry needed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load sample fixture" }).click();
  await page.getByRole("button", { name: "Retry recognition" }).click();
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
  await page.screenshot({
    path: "test-results/phase-0-mobile.png",
    fullPage: true,
  });
});
