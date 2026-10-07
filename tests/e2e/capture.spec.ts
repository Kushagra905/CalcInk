import { expect, type Page, test } from "@playwright/test";
import { PAGE, ROWS } from "../../src/document/rows";

// Automated marks exercise capture mechanics; they are never genuine handwriting evidence.
async function draw(page: Page, row = 0) {
  const canvas = page.locator('[data-layer="live"]');
  await page.locator(".row-guide").nth(row).scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing handwriting canvas");
  const x = box.x + box.width * 0.15;
  const y = box.y + box.height * ((ROWS[row].top + 38.4) / PAGE.height);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 10, { steps: 4 });
  await page.mouse.up();
}

async function setup(page: Page) {
  const capture = page.getByRole("region", {
    name: "Phase 1 handwriting collection",
  });
  await expect(capture.getByLabel("Writer label")).toBeEnabled();
  await capture.getByLabel("Writer label").fill("Automated test A");
  await capture.getByLabel("Input used").selectOption("mouse");
  await capture
    .getByLabel("Device and browser description")
    .fill("Automated Chromium test; not human evidence");
  return capture;
}

async function exportSet(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Missing capture export");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return {
    filename: download.suggestedFilename(),
    data: JSON.parse(Buffer.concat(chunks).toString()),
  };
}

async function inkPixels(page: Page) {
  return page
    .locator('[data-layer="ink"]')
    .evaluate(
      (canvas: HTMLCanvasElement) =>
        Array.from(
          canvas
            .getContext("2d")
            ?.getImageData(0, 0, canvas.width, canvas.height).data ?? [],
        ).filter((alpha, index) => index % 4 === 3 && alpha > 0).length,
    );
}

test("guided captures persist, preserve other rows, and keep held-out exports and recognition separate", async ({
  page,
}) => {
  await page.goto("/");
  const capture = await setup(page);
  await draw(page, 1);
  await draw(page);
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.getByRole("status")).toContainText("Sample saved");
  await expect(capture.locator(".capture-counts")).toContainText("1/12");
  await expect(page.locator('[data-row="row-2"]')).toContainText("18+4×3=");
  expect(await inkPixels(page)).toBeGreaterThan(0);
  await page.reload();
  await expect(capture.locator(".capture-counts")).toContainText("1/12");
  await expect(capture.getByLabel("Expression to write")).toHaveValue(
    "development-2",
  );
  await expect(capture.getByLabel("Writer label")).toHaveValue(
    "Automated test A",
  );
  const reused = await page.evaluate(async () => {
    const modulePath = "/src/dev/capture.ts";
    const { readSamples, saveSample } = await import(modulePath);
    const samples = await readSamples();
    try {
      await saveSample({
        ...samples[0],
        id: "dev-B-01",
        sampleId: "dev-B-01",
        writerSlot: "B",
        writer: "Automated test B",
      });
      return "accepted";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(reused).toContain("already saved");
  // The notebook now restores row-two ink; changing datasets explicitly clears it.
  page.once("dialog", (dialog) => dialog.accept());
  await capture.getByLabel("Capture dataset").selectOption("held-out");
  await expect(page.getByText("Capture only", { exact: true })).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
  await capture.getByLabel("Input used").selectOption("mouse");
  await capture
    .getByLabel("Device and browser description")
    .fill("Automated Chromium test; not human evidence");
  await draw(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.locator(".capture-counts")).toContainText("1/25");
  const development = await exportSet(page, "Export development set");
  const heldOut = await exportSet(page, "Export held-out set");
  expect(development.filename).toBe("calcink-development.json");
  expect(heldOut.filename).toBe("calcink-held-out.json");
  expect(development.data).toMatchObject({
    dataset: "development",
    targetCount: 24,
    complete: false,
  });
  expect(heldOut.data).toMatchObject({
    dataset: "held-out",
    targetCount: 50,
    complete: false,
  });
  expect(development.data.samples).toHaveLength(1);
  expect(heldOut.data.samples).toHaveLength(1);
  expect(development.data.samples[0].expectedTranscript).toBe("18 + 4 × 3 =");
  expect(heldOut.data.samples[0].expectedTranscript).toBe("21 + 8 × 2 =");
  await capture.getByLabel("Capture dataset").selectOption("development");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  await capture.getByLabel("Capture writer").selectOption("B");
  await capture.getByLabel("Writer label").fill("Automated test B");
  await expect(page.locator(".capture-writing-prompt")).toContainText(
    "Writer B · development · row 1: write 18 + 4 × 3 =",
  );
  await draw(page);
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.locator(".capture-counts")).toContainText("1/12");
  const combined = await exportSet(page, "Export development set");
  expect(combined.data.samples).toHaveLength(2);
  expect(
    combined.data.samples
      .map((sample: { writerSlot: string }) => sample.writerSlot)
      .sort(),
  ).toEqual(["A", "B"]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase-1-mobile.png",
    fullPage: true,
  });
});

test("ink added while an IndexedDB save is pending is retained", async ({
  page,
}) => {
  await page.goto("/");
  const capture = await setup(page);
  await draw(page);
  const before = await inkPixels(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const result =
        key === undefined
          ? original.call(this, value)
          : original.call(this, value, key);
      const deadline = performance.now() + 5000;
      const hold = () => {
        const request = this.get("dev-A-01");
        request.onsuccess = () => {
          if (performance.now() < deadline) hold();
        };
      };
      hold();
      return result;
    };
  });
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.getByRole("status")).toContainText(
    "Saving handwriting sample",
  );
  await draw(page, 1);
  await expect(capture.getByRole("status")).toContainText(
    "canvas changed during saving",
    { timeout: 10000 },
  );
  expect(await inkPixels(page)).toBeGreaterThan(before);
  const exported = await exportSet(page, "Export development set");
  expect(exported.data.samples).toHaveLength(1);
  expect(exported.data.samples[0].rowId).toBe("row-1");
});

test("synthetic input and failed storage writes do not count or discard ink", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const capture = await setup(page);
  await page.getByRole("button", { name: "Load sample fixture" }).click();
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.getByRole("status")).toContainText("Synthetic or mixed");
  await page.getByRole("button", { name: "Reset fixtures" }).click();
  await draw(page);
  const before = await inkPixels(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Test quota exhausted", "QuotaExceededError");
    };
  });
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.getByRole("status")).toContainText(
    "Test quota exhausted",
  );
  await expect(capture.locator(".capture-counts")).toContainText("0/12");
  expect(await inkPixels(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("drawing remains available while initialization is loading and survives readiness", async ({
  page,
}) => {
  await page.goto("/?mock=slow-init");
  await expect(
    page.getByRole("progressbar", { name: "Model loading" }),
  ).toHaveAttribute("value", "0.25");
  await draw(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  const before = await inkPixels(page);
  expect(before).toBeGreaterThan(0);
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
  expect(await inkPixels(page)).toBe(before);
});

test("external fixture reset cancels an active pointer and prevents ink from reappearing", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator('[data-layer="live"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing handwriting canvas");
  await page.mouse.move(box.x + 50, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 40);
  await page
    .getByRole("button", { name: "Reset fixtures" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.mouse.up();
  expect(await inkPixels(page)).toBe(0);
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  await draw(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText("18+4×3=");
});

test("row-two capture imports directly into B's lab and held-out ink cannot return through Undo", async ({
  page,
}) => {
  await page.goto("/");
  const capture = await setup(page);
  await capture.getByLabel("Capture row").selectOption("row-2");
  await draw(page, 1);
  await capture.getByLabel("I personally wrote").check();
  await capture
    .getByRole("button", { name: "Save handwriting sample", exact: true })
    .click();
  await expect(capture.locator(".capture-counts")).toContainText("1/12");
  const exported = await exportSet(page, "Export development set");
  expect(exported.data.schemaVersion).toBe(1);
  expect(exported.data.samples[0].sampleId).toBe("dev-A-01");
  expect(exported.data.samples[0].captureRowId).toBe("row-2");
  await capture.getByLabel("Capture dataset").selectOption("held-out");
  await draw(page, 1);
  page.once("dialog", (dialog) => dialog.accept());
  await capture.getByLabel("Capture dataset").selectOption("development");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  expect(await inkPixels(page)).toBe(0);
  await page.goto("/tools/model-lab/");
  await page.locator("#import-samples").setInputFiles({
    name: exported.filename,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported.data)),
  });
  await expect(page.locator("#counts")).toContainText("1/24 development");
  await page.locator("#writer").selectOption("A");
  await expect(page.locator("#sample")).toHaveValue("dev-A-01");
  expect(
    await page.locator("#ink").evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value > 0),
    ),
  ).toBe(true);
  await page.locator("#split").selectOption("held-out");
  await expect(page.locator("#load")).toBeDisabled();
  await expect(page.locator("#recognize")).toBeDisabled();
});
