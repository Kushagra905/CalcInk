import { expect, type Page, test } from "@playwright/test";
import { PAGE, ROWS } from "../../src/document/rows";
import type { InkOperation } from "../../src/document/types";

test.use({ viewport: { width: 1280, height: 1100 } });

async function move(page: Page, x: number, y: number) {
  const canvas = page.locator('[data-layer="live"]');
  await page
    .locator(".row-guide")
    .nth(Math.min(ROWS.length - 1, Math.floor(y / 160)))
    .scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing notebook canvas");
  await page.mouse.move(
    box.x + (x / 960) * box.width,
    box.y + (y / PAGE.height) * box.height,
  );
}

async function gesture(page: Page, points: [number, number][]) {
  await move(page, ...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await move(page, ...point);
  await page.mouse.up();
}

async function size(page: Page, value: number) {
  const input = page.locator(".pen-width input");
  await input.evaluate((element: HTMLInputElement, amount) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(element, String(amount));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await expect(page.locator(".pen-width output")).toHaveText(String(value));
}

async function alpha(page: Page, x: number, y: number, layer = "ink") {
  return page.locator(`[data-layer="${layer}"]`).evaluate(
    (canvas: HTMLCanvasElement, point) => {
      return (
        canvas
          .getContext("2d")
          ?.getImageData(
            Math.floor((point.x / 960) * canvas.width),
            Math.floor((point.y / point.height) * canvas.height),
            1,
            1,
          ).data[3] ?? 0
      );
    },
    { x, y, height: PAGE.height },
  );
}

async function bitmap(page: Page, layer = "ink", row = 0) {
  return page.locator(`[data-layer="${layer}"]`).evaluate(
    async (canvas: HTMLCanvasElement, { index, count }) => {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No canvas context");
      const data = context.getImageData(
        0,
        Math.floor((canvas.height / count) * index),
        canvas.width,
        Math.floor(canvas.height / count),
      ).data;
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      return {
        hash: [...hash].join(","),
        hasInk: data.some((value, i) => i % 4 === 3 && value > 0),
      };
    },
    { index: row, count: ROWS.length },
  );
}

async function exportInk(page: Page): Promise<InkOperation[]> {
  const panel = page.locator(".fixture-panel");
  await panel
    .getByLabel("Writer", { exact: true })
    .fill("Automated geometry test");
  await panel
    .getByLabel("Expected transcript", { exact: true })
    .fill("18+4×3=");
  await panel.getByLabel("Expected value", { exact: true }).fill("30");
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export fixture JSON" }).click();
  const stream = await (await download).createReadStream();
  if (!stream) throw new Error("Missing download");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString()).operations;
}

async function cancelPointer(page: Page) {
  await page.locator('[data-layer="live"]').evaluate((canvas) => {
    canvas.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: Number(canvas.getAttribute("data-pointer")),
        bubbles: true,
      }),
    );
  });
  await page.mouse.up();
}

test("inline answers clear synchronously on edit, reject late replies and preserve the other row", async ({
  page,
}) => {
  await page.goto("/?delay=600");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load sample fixture" }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
  await gesture(page, [[100, 220]]);
  await expect(page.locator('[data-row="row-2"]')).toContainText("Ready");
  const other = await bitmap(page, "results", 1);
  const worker = page.workers()[0];
  if (!worker) throw new Error("Missing fixture worker");
  // Hold the real fixture worker's next reply until the test has begun editing.
  // This makes stale-result coverage independent of host/browser scheduling.
  await worker.evaluate(() => {
    const scope = self as unknown as { postMessage(message: unknown): void };
    const send = scope.postMessage.bind(scope);
    const replies: unknown[] = [];
    scope.postMessage = (message) => {
      if ((message as { type: string }).type === "RESULT")
        replies.push(message);
      else send(message);
    };
    Reflect.set(self, "hasHeldResult", () => replies.length > 0);
    Reflect.set(self, "releaseResults", () => {
      scope.postMessage = send;
      for (const message of replies) send(message);
    });
  });
  await gesture(page, [
    [100, 60],
    [120, 65],
  ]);
  await expect(page.locator('[data-row="row-1"]')).toContainText("Recognizing");
  await move(page, 150, 70);
  await page.mouse.down();
  expect((await bitmap(page, "results", 0)).hasInk).toBe(false);
  expect(await bitmap(page, "results", 1)).toEqual(other);
  await expect
    .poll(() => worker.evaluate(() => Reflect.get(self, "hasHeldResult")()))
    .toBe(true);
  // Release the obsolete reply while the new pointer is held.
  await worker.evaluate(() => Reflect.get(self, "releaseResults")());
  expect((await bitmap(page, "results", 0)).hasInk).toBe(false);
  await page.mouse.up();
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
  expect(await bitmap(page, "results", 1)).toEqual(other);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  expect((await bitmap(page, "results", 0)).hasInk).toBe(false);
  expect((await bitmap(page, "results", 1)).hasInk).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  await expect(page.locator('[data-row="row-2"]')).toContainText("Ready");
});

test("supported model LaTeX displays readable arithmetic beside an inline answer", async ({
  page,
}) => {
  await page.goto(
    `/?transcript=${encodeURIComponent(String.raw`\(18 + 4 \times 3 =\)`)}`,
  );
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await gesture(page, [
    [100, 60],
    [140, 65],
  ]);
  const row = page.locator('[data-row="row-1"]');
  await expect(row).toContainText("Ready");
  await expect(row.locator(".row-transcript")).toHaveText("18+4×3=");
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
});

test("repeated equals produce one completion marker and an inline answer", async ({
  page,
}) => {
  await page.goto(`/?transcript=${encodeURIComponent("2+3= = =")}`);
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await gesture(page, [[150, 60]]);
  const row = page.locator('[data-row="row-1"]');
  await expect(row).toContainText("Ready");
  await expect(row.locator(".row-transcript")).toHaveText("2+3=");
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
});

test("answer ink uses Comic Sans and matches the expression height beside the handwriting", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const writes: {
      text: string;
      font: string;
      x: number;
      top: number;
      bottom: number;
    }[] = [];
    Reflect.set(window, "answerTypography", writes);
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      const metrics = this.measureText(text);
      writes.push({
        text,
        font: this.font,
        x,
        top: y - metrics.actualBoundingBoxAscent,
        bottom: y + metrics.actualBoundingBoxDescent,
      });
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto(`/?transcript=${encodeURIComponent("2+3=")}`);
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await gesture(page, [
    [100, 60],
    [140, 100],
  ]);
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  const answer = await page.evaluate(() => {
    const writes = Reflect.get(window, "answerTypography") as {
      text: string;
      font: string;
      x: number;
      top: number;
      bottom: number;
    }[];
    return writes.findLast((entry) => entry.text === "5");
  });
  if (!answer) throw new Error("Missing rendered answer");
  expect(answer.font).toContain("Comic Sans MS");
  expect(answer.x).toBeGreaterThan(140);
  expect(answer.bottom - answer.top).toBeGreaterThan(40);
  expect(Math.abs((answer.top + answer.bottom) / 2 - 80)).toBeLessThan(2);
});

test("recognition failure retries without losing ink or history", async ({
  page,
}) => {
  await page.goto("/?mock=error");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await gesture(page, [
    [100, 60],
    [140, 65],
  ]);
  const ink = await bitmap(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "MOCK_RECOGNITION_FAILED",
  );
  expect((await bitmap(page, "results", 0)).hasInk).toBe(false);
  await page.getByRole("button", { name: "Retry recognition" }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  expect(await bitmap(page)).toEqual(ink);
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await bitmap(page)).hasInk).toBe(false);
  expect((await bitmap(page, "results", 0)).hasInk).toBe(false);
});

test("one automatic worker restart recovers a timeout while preserving committed ink", async ({
  page,
}) => {
  test.setTimeout(25000);
  await page.goto("/?mock=timeout-once");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  await gesture(page, [
    [100, 60],
    [140, 65],
  ]);
  const ink = await bitmap(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready", {
    timeout: 17000,
  });
  expect(await bitmap(page)).toEqual(ink);
  expect((await bitmap(page, "results", 0)).hasInk).toBe(true);
});

test("division by zero renders Undefined; overflow never overwrites ink", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.assign(window, { answerWrites: writes });
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      writes.push(text);
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto("/?transcript=4%2F0%3D");
  await page.getByRole("button", { name: "Load sample fixture" }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText("Ready");
  expect(
    await page.evaluate(() => Reflect.get(window, "answerWrites")),
  ).toContain("Undefined");
  expect((await bitmap(page, "results")).hasInk).toBe(true);
  await page.goto("/");
  await gesture(page, [[925, 70]]);
  const ink = await bitmap(page);
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Leave room after =",
  );
  expect((await bitmap(page, "results")).hasInk).toBe(false);
  expect(await bitmap(page)).toEqual(ink);
  await page.screenshot({
    path: "test-results/phase-3-overflow.png",
    fullPage: true,
  });
});

test("unfinished and malformed expressions keep answers empty and offer distinct feedback", async ({
  page,
}) => {
  for (const [transcript, status] of [
    ["18+4", "Keep writing; finish with ="],
    ["18++=", "Invalid expression"],
  ]) {
    await page.goto(`/?transcript=${encodeURIComponent(transcript)}`);
    await gesture(page, [[150, 60]]);
    await expect(page.locator('[data-row="row-1"]')).toContainText(status);
    expect((await bitmap(page, "results")).hasInk).toBe(false);
    expect((await bitmap(page)).hasInk).toBe(true);
  }
});

test("a narrow pixel mask preserves the stroke, restores exact pixels and matches worker replay", async ({
  page,
}) => {
  await page.goto("/");
  await size(page, 12);
  await gesture(page, [
    [100, 70],
    [500, 70],
  ]);
  const original = await bitmap(page);
  await page.getByRole("button", { name: "Pixel eraser", exact: true }).click();
  await size(page, 2);
  await gesture(page, [
    [300, 40],
    [300, 100],
  ]);
  await expect.poll(() => alpha(page, 300, 70)).toBe(0);
  expect(await alpha(page, 295, 70)).toBeGreaterThan(0);
  const erased = await bitmap(page);
  const operations = await exportInk(page);
  expect(operations.map((operation) => operation.kind)).toEqual([
    "stroke",
    "pixel-mask",
  ]);
  const mask = operations[1];
  if (mask.kind !== "pixel-mask") throw new Error("Missing mask");
  expect(mask.mask.radius).toBe(1);
  const comparison = await page.evaluate(
    async ({ ops, logicalHeight }) => {
      const ink =
        document.querySelector<HTMLCanvasElement>('[data-layer="ink"]');
      if (!ink) throw new Error("Missing ink canvas");
      const url = URL.createObjectURL(
        new Blob(
          [
            `import { replayRow } from '${location.origin}/src/rendering/replay.ts';
       onmessage = ({ data }) => { const canvas = new OffscreenCanvas(data.width, data.height);
       const ctx = canvas.getContext('2d'); ctx.setTransform(data.width / 960, 0, 0, data.height / ${logicalHeight}, 0, 0);
       replayRow(ctx, 'row-1', data.operations); const pixels = ctx.getImageData(0, 0, data.width, data.height).data;
       postMessage(pixels, [pixels.buffer]); };`,
          ],
          { type: "text/javascript" },
        ),
      );
      const worker = new Worker(url, { type: "module" });
      try {
        const pixels = await new Promise<Uint8ClampedArray>(
          (resolve, reject) => {
            worker.onmessage = ({ data }) => resolve(data);
            worker.onerror = () => reject(new Error("Bitmap worker failed"));
            worker.postMessage({
              width: ink.width,
              height: ink.height,
              operations: ops,
            });
          },
        );
        const displayed = ink
          .getContext("2d")
          ?.getImageData(0, 0, ink.width, ink.height).data;
        if (!displayed) throw new Error("Missing displayed bitmap");
        let alpha = 0,
          premultiplied = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          alpha = Math.max(alpha, Math.abs(pixels[i + 3] - displayed[i + 3]));
          for (let channel = 0; channel < 3; channel++)
            premultiplied = Math.max(
              premultiplied,
              Math.abs(
                Math.round((pixels[i + channel] * pixels[i + 3]) / 255) -
                  Math.round((displayed[i + channel] * displayed[i + 3]) / 255),
              ),
            );
        }
        return { alpha, premultiplied };
      } finally {
        worker.terminate();
        URL.revokeObjectURL(url);
      }
    },
    { ops: operations, logicalHeight: PAGE.height },
  );
  // Chromium's DOM/Offscreen antialias readback differs by one premultiplied byte at scaled edges.
  expect(comparison.alpha).toBeLessThanOrEqual(1);
  expect(comparison.premultiplied).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await bitmap(page)).toEqual(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(await bitmap(page)).toEqual(erased);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await gesture(page, [[300, 70]]);
  expect(await alpha(page, 300, 70)).toBeGreaterThan(0);
});

test("stroke hit testing handles tangency, dots and curved paths; eraser taps and cancellation preserve history", async ({
  page,
}) => {
  await page.goto("/");
  const hits = await page.evaluate(async () => {
    const eraser = await import(`${location.origin}/src/ink/eraser.ts`);
    const geometry = await import(`${location.origin}/src/ink/geometry.ts`);
    const context = new OffscreenCanvas(1, 1).getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) throw new Error("No hit context");
    const point = (x: number, y: number) => ({ x, y, pressure: 0.5, t: 1 });
    const operations = (points: ReturnType<typeof point>[], width: number) => [
      {
        kind: "stroke",
        stroke: {
          id: "test",
          rowId: "row-1",
          points,
          width,
          bounds: geometry.strokeBounds(points, width, "row-1"),
        },
      },
    ];
    const line = operations([point(100, 60), point(500, 60)], 10);
    const dot = operations([point(100, 60)], 4);
    const curve = operations(
      [point(100, 80), point(500, 0), point(100, 80)],
      4,
    );
    return {
      tangent: eraser.hitVisibleStroke(
        context,
        line,
        0,
        point(300, 50),
        point(300, 50),
        5,
      ),
      outside: eraser.hitVisibleStroke(
        context,
        line,
        0,
        point(300, 49),
        point(300, 49),
        5,
      ),
      dot: eraser.hitVisibleStroke(
        context,
        dot,
        0,
        point(100, 60),
        point(100, 60),
        1,
      ),
      distantControl: eraser.hitVisibleStroke(
        context,
        curve,
        0,
        point(500, 0),
        point(500, 0),
        5,
      ),
    };
  });
  expect(hits).toEqual({
    tangent: true,
    outside: false,
    dot: true,
    distantControl: false,
  });
  await size(page, 12);
  await gesture(page, [[200, 70]]);
  const original = await bitmap(page);
  await page.getByRole("button", { name: "Pixel eraser", exact: true }).click();
  await size(page, 2);
  await gesture(page, [[200, 70]]);
  expect(await alpha(page, 200, 70)).toBe(0);
  expect(await alpha(page, 204, 70)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await bitmap(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await page.locator('[data-layer="live"]').evaluate((canvas) => {
    canvas.addEventListener(
      "pointerdown",
      (event) =>
        canvas.setAttribute(
          "data-pointer",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    );
  });
  await move(page, 200, 70);
  await page.mouse.down();
  await expect.poll(async () => (await bitmap(page)).hasInk).toBe(false);
  await cancelPointer(page);
  expect(await bitmap(page)).toEqual(original);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await bitmap(page)).hasInk).toBe(false);
});

test("pixel previews cancel exactly and whole-stroke erasing ignores already erased regions", async ({
  page,
}) => {
  await page.goto("/");
  await size(page, 12);
  await gesture(page, [
    [100, 70],
    [500, 70],
  ]);
  const original = await bitmap(page);
  await page.getByRole("button", { name: "Pixel eraser", exact: true }).click();
  await size(page, 20);
  await page.locator('[data-layer="live"]').evaluate((canvas) => {
    canvas.addEventListener(
      "pointerdown",
      (event) =>
        canvas.setAttribute(
          "data-pointer",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    );
  });
  await move(page, 300, 70);
  await page.mouse.down();
  await expect.poll(() => alpha(page, 300, 70)).toBe(0);
  await cancelPointer(page);
  expect(await bitmap(page)).toEqual(original);
  await gesture(page, [
    [300, 45],
    [300, 100],
  ]);
  const partial = await bitmap(page);
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await size(page, 2);
  await gesture(page, [[300, 70]]);
  expect(await bitmap(page)).toEqual(partial);
  await gesture(page, [
    [450, 40],
    [450, 100],
  ]);
  expect((await bitmap(page)).hasInk).toBe(false);
  expect((await bitmap(page, "results")).hasInk).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await bitmap(page)).toEqual(partial);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await bitmap(page)).hasInk).toBe(false);
});

test("a fast whole-stroke sweep crosses the page and remains one global history command", async ({
  page,
}) => {
  await page.goto("/");
  await gesture(page, [
    [100, 60],
    [500, 60],
  ]);
  await gesture(page, [
    [100, 90],
    [500, 90],
  ]);
  await gesture(page, [[200, 220]]);
  const first = await bitmap(page),
    second = await bitmap(page, "ink", 1);
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await size(page, 10);
  await gesture(page, [
    [200, 30],
    [200, 230],
  ]);
  expect((await bitmap(page)).hasInk).toBe(false);
  expect((await bitmap(page, "ink", 1)).hasInk).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await bitmap(page)).toEqual(first);
  expect(await bitmap(page, "ink", 1)).toEqual(second);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await bitmap(page)).hasInk).toBe(false);
  await page.screenshot({
    path: "test-results/phase-4-desktop.png",
    fullPage: true,
  });
});
