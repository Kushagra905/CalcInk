import { expect, type Page, test } from "@playwright/test";
import { PAGE, ROWS } from "../../src/document/rows";
import type { InkOperation } from "../../src/document/types";

async function draw(page: Page, row = 0) {
  const canvas = page.locator('[data-layer="live"]');
  await page.locator(".row-guide").nth(row).scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  await page.mouse.move(
    box.x + box.width * 0.2,
    box.y + box.height * ((ROWS[row].top + 38.4) / PAGE.height),
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.24,
    box.y + box.height * ((ROWS[row].top + 67.2) / PAGE.height),
    { steps: 8 },
  );
  await page.mouse.move(
    box.x + box.width * 0.28,
    box.y + box.height * ((ROWS[row].top + 38.4) / PAGE.height),
    { steps: 8 },
  );
  await page.mouse.up();
}

async function exportInk(page: Page, rowId = "row-1"): Promise<InkOperation[]> {
  const fixture = page.locator(".fixture-panel");
  await fixture.locator(".contract-fields select").selectOption(rowId);
  await fixture
    .getByLabel("Writer", { exact: true })
    .fill("Automated contract test");
  await fixture
    .getByLabel("Expected transcript", { exact: true })
    .fill("test only");
  const pending = page.waitForEvent("download");
  await fixture.getByRole("button", { name: "Export fixture JSON" }).click();
  const stream = await (await pending).createReadStream();
  if (!stream) throw new Error("Missing export");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString()).operations;
}

test("global history, shortcuts, future pen widths and undoable clear restore the exact ink", async ({
  page,
}) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeDisabled();
  await draw(page);
  const first = await exportInk(page);
  await page.getByRole("slider", { name: "Width" }).fill("8");
  await draw(page, 1);
  const second = await exportInk(page, "row-2");
  expect(second[0].kind === "stroke" && second[0].stroke.width).toBe(8);
  expect(first[0].kind === "stroke" && first[0].stroke.width).toBe(3);
  await undo.click();
  await expect(page.locator('[data-row="row-2"]')).toContainText(
    "Write an expression",
  );
  expect(await exportInk(page)).toEqual(first);
  await redo.click();
  expect(await exportInk(page, "row-2")).toEqual(second);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator('[data-row="row-1"]')).toContainText(
    "Write an expression",
  );
  await undo.click();
  expect(await exportInk(page)).toEqual(first);
  expect(await exportInk(page, "row-2")).toEqual(second);
  const canvas = page.locator('[data-layer="live"]');
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-row="row-2"]')).toContainText(
    "Write an expression",
  );
  await page.keyboard.press("Control+Shift+z");
  expect(await exportInk(page, "row-2")).toEqual(second);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await draw(page, 2);
  await expect(redo).toBeDisabled();
  await expect(page.locator('[data-row="row-2"]')).toContainText(
    "Write an expression",
  );
  const writer = page.getByLabel("Writer", { exact: true });
  await writer.fill("Typed text");
  await writer.press("Control+z");
  await expect(page.locator('[data-row="row-3"]')).toContainText("18+4×3=");
  await page.screenshot({
    path: "test-results/phase-2-desktop.png",
    fullPage: true,
  });
});

test("DOM and worker replay produce identical pixels for row-offset curves, dots, masks and later ink", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, 2);
  const operations = await exportInk(page, "row-3");
  const result = await page.evaluate(async (operations) => {
    const rendererPath = "/src/rendering/replay.ts";
    const { replayRow } = await import(rendererPath);
    const composite = [
      ...operations,
      {
        kind: "pixel-mask",
        mask: {
          id: "test-mask",
          rowId: "row-3",
          radius: 4,
          points: [{ x: 230, y: 370, pressure: 0.5, t: 1 }],
        },
      },
      {
        kind: "stroke",
        stroke: {
          id: "test-dot",
          rowId: "row-3",
          width: 4,
          points: [{ x: 230, y: 370, pressure: 0.5, t: 2 }],
          bounds: { x: 228, y: 368, width: 4, height: 4 },
        },
      },
    ];
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing context");
    replayRow(context, "row-3", composite);
    const expected = context.getImageData(0, 320, 960, 136).data;
    const source = `import { replayInk } from '${location.origin}/src/ink/replay.ts'; self.onmessage = event => { const canvas = new OffscreenCanvas(960,136); const context = canvas.getContext('2d'); context.translate(0,-320); replayInk(context,event.data); self.postMessage(context.getImageData(0,0,960,136).data); };`;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    const worker = new Worker(url, { type: "module" });
    try {
      const actual = await new Promise<Uint8ClampedArray>((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage(composite);
      });
      return {
        equal: expected.every((value, index) => value === actual[index]),
        ink: expected.some((value, index) => index % 4 === 3 && value > 0),
      };
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  }, operations);
  expect(result).toEqual({ equal: true, ink: true });
});

test("mouse, pen and touch retain logical coordinates and clipped dots at DPR 1, 2 and 3 after resize", async ({
  browser,
}) => {
  for (const dpr of [1, 2, 3]) {
    const context = await browser.newContext({
      deviceScaleFactor: dpr,
      hasTouch: true,
      viewport: { width: 1000, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/");
    const canvas = page.locator('[data-layer="live"]');
    await page.locator(".row-guide").nth(2).scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Missing canvas");
    await page.touchscreen.tap(
      box.x + box.width * 0.2,
      box.y + box.height * (360 / PAGE.height),
    );
    const original = await exportInk(page, "row-3");
    if (original[0].kind !== "stroke") throw new Error("Missing dot");
    expect(original[0].stroke.points[0].x).toBeCloseTo(192, 0);
    expect(original[0].stroke.points[0].y).toBeCloseTo(360, 0);
    const session = await context.newCDPSession(page);
    await page.locator(".row-guide").first().scrollIntoViewIfNeeded();
    const nextBox = await canvas.boundingBox();
    if (!nextBox) throw new Error("Missing canvas");
    const x = nextBox.x + nextBox.width * 0.3,
      y = nextBox.y + nextBox.height * (38.4 / PAGE.height);
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
      pointerType: "pen",
      force: 0.5,
    });
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + 20,
      y: y + 5,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.8,
    });
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x + 20,
      y: y + 5,
      button: "left",
      clickCount: 1,
      pointerType: "pen",
    });
    const pen = await exportInk(page);
    if (pen[0].kind !== "stroke") throw new Error("Missing pen stroke");
    expect(pen[0].stroke.points.some((point) => point.pressure > 0)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await exportInk(page, "row-3")).toEqual(original);
    await expect(canvas).toBeVisible();
    expect(
      await canvas.evaluate(
        (element: HTMLCanvasElement) =>
          element.width ===
          Math.round(element.getBoundingClientRect().width * devicePixelRatio),
      ),
    ).toBe(true);
    await draw(page, 1);
    expect((await exportInk(page, "row-2")).length).toBe(1);
    await context.close();
  }
});

test("coalesced points cross old row boundaries, second pointers are ignored, and commits repaint the page", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator('[data-layer="live"]');
  await page.locator(".row-guide").first().scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  await page.getByRole("slider", { name: "Width" }).fill("6");
  await canvas.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (event) =>
        element.setAttribute(
          "data-pointer",
          String((event as PointerEvent).pointerId),
        ),
      { once: true },
    ),
  );
  await page.mouse.move(
    box.x + box.width * 0.2,
    box.y + box.height * (38.4 / PAGE.height),
  );
  await page.mouse.down();
  await page.evaluate(() => {
    const clears: unknown[] = [];
    (window as unknown as { testClears: unknown[] }).testClears = clears;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (
      x,
      y,
      width,
      height,
    ) {
      if (this.canvas.dataset.layer === "ink")
        clears.push([x, y, width, height]);
      original.call(this, x, y, width, height);
    };
  });
  await canvas.evaluate((element, height) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 999,
        isPrimary: true,
        button: 0,
        clientX: box.x + 20,
        clientY: box.y + box.height * (336 / height),
      }),
    );
    const event = new PointerEvent("pointermove", {
      pointerId: Number(element.getAttribute("data-pointer")),
    });
    Object.defineProperty(event, "getCoalescedEvents", {
      value: () => [
        new PointerEvent("pointermove", {
          clientX: box.x + box.width * 0.25,
          clientY: box.y + box.height * (72 / height),
          pressure: 0.4,
        }),
        new PointerEvent("pointermove", {
          clientX: box.x + box.width * 0.3,
          clientY: box.y + box.height * (240 / height),
          pressure: 0.7,
        }),
      ],
    });
    element.dispatchEvent(event);
  }, PAGE.height);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { testClears: unknown[] }).testClears.length,
      ),
    )
    .toBe(0);
  await page
    .getByRole("slider", { name: "Width" })
    .evaluate((input: HTMLInputElement) => {
      input.value = "2";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await page.mouse.up();
  const operations = await exportInk(page);
  if (operations[0].kind !== "stroke") throw new Error("Expected stroke");
  expect(operations).toHaveLength(1);
  expect(operations[0].stroke.width).toBe(6);
  expect(
    operations[0].stroke.points.some(
      (point) =>
        Math.abs(point.pressure - 0.7) < 0.000001 &&
        Math.abs(point.y - 240) < 0.001,
    ),
  ).toBe(true);
  expect(
    operations[0].stroke.points.every((point) => point.y <= PAGE.height),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { testClears: unknown[] }).testClears,
    ),
  ).toEqual([[0, 0, PAGE.width, PAGE.height]]);
});
