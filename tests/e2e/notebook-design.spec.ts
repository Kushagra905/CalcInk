import { expect, type Page, test } from "@playwright/test";
import { PAGE, ROWS } from "../../src/document/rows";
import type { InkOperation } from "../../src/document/types";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
}
async function backup(page: Page) {
  await page.getByLabel("Export and help").click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download notebook backup" }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Missing backup");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  await page.getByLabel("Export and help").click();
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function dot(page: Page, row = 0) {
  await page.locator(".row-guide").nth(row).scrollIntoViewIfNeeded();
  const box = await page.locator('[data-layer="live"]').boundingBox();
  if (!box) throw new Error("Missing page");
  await page.mouse.click(
    box.x + box.width * 0.25,
    box.y + ((ROWS[row].top + 60) / PAGE.height) * box.height,
  );
}

async function pagePoint(page: Page, x: number, y: number) {
  const box = await page.locator('[data-layer="live"]').boundingBox();
  if (!box) throw new Error("Missing page");
  return {
    x: box.x + (x / PAGE.width) * box.width,
    y: box.y + (y / PAGE.height) * box.height,
  };
}
async function centerPageAt(page: Page, y: number) {
  await page.locator('[data-layer="live"]').evaluate((element, logicalY) => {
    const box = element.getBoundingClientRect();
    window.scrollTo(
      0,
      window.scrollY +
        box.top +
        (logicalY / 1280) * box.height -
        innerHeight / 2,
    );
  }, y);
}

async function colour(page: Page, value: string) {
  await page.getByLabel("Choose pen colour").click();
  await page.getByLabel("Pen colour", { exact: true }).fill(value);
  await expect(page.getByLabel("Pen colour", { exact: true })).toHaveValue(
    value,
  );
  await page.keyboard.press("Escape");
}

test("coloured writing tools preserve rendered appearance, history, saving and PNG export", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Pen style").selectOption("highlighter");
  await dot(page);
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await expect(page.locator(".row-feedback.ready")).toHaveCount(0);
  await page.getByLabel("Pen style").selectOption("pencil");
  await colour(page, "#c2343d");
  await page.getByRole("slider", { name: "Width", exact: true }).fill("5");
  await page.locator(".row-guide").first().scrollIntoViewIfNeeded();
  const pencil = await pagePoint(page, 180, 60);
  await page.mouse.click(pencil.x, pencil.y);
  await page.getByLabel("Pen style").selectOption("pen");
  await colour(page, "#2155cd");
  await page.locator(".row-guide").first().scrollIntoViewIfNeeded();
  const pen = await pagePoint(page, 100, 60);
  await page.mouse.click(pen.x, pen.y);
  const saved = await backup(page);
  const operations: InkOperation[] = saved.pages[0].rows[0].operations;
  expect(
    operations.map(
      (op) =>
        op.kind === "stroke" && [
          op.stroke.style,
          op.stroke.color,
          op.stroke.width,
        ],
    ),
  ).toEqual([
    ["highlighter", "#f2c94c", 24],
    ["pencil", "#c2343d", 5],
    ["pen", "#2155cd", 3],
  ]);
  const pixels = await page
    .locator('[data-layer="ink"]')
    .evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Missing ink context");
      return [100, 180, 240].map((x) =>
        Array.from(
          ctx.getImageData(
            Math.round((x / 960) * canvas.width),
            Math.round((60 / 1280) * canvas.height),
            1,
            1,
          ).data,
        ),
      );
    });
  expect(pixels[0]).toEqual([33, 85, 205, 255]);
  expect(pixels[1][3]).toBeCloseTo(0.58 * 255, 0);
  expect(pixels[2][3]).toBeCloseTo(0.28 * 255, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).pages[0].rows[0].operations).toHaveLength(2);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await backup(page)).pages[0].rows[0].operations).toEqual(operations);
  await page.getByLabel("Pen style").selectOption("pencil");
  await expect(page.getByLabel("Pen colour", { exact: true })).toHaveValue(
    "#c2343d",
  );
  await expect(
    page.getByRole("slider", { name: "Width", exact: true }),
  ).toHaveValue("5");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  expect((await backup(page)).pages[0].rows[0].operations).toEqual(operations);
  await page.getByLabel("Export and help").click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export page PNG" }).click();
  const stream = await (await pending).createReadStream();
  if (!stream) throw new Error("Missing PNG");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Missing export context");
    ctx.drawImage(image, 0, 0);
    return [100, 180, 240].map((x) =>
      Array.from(ctx.getImageData(x + 32, 180, 1, 1).data),
    );
  }, Buffer.concat(chunks).toString("base64"));
  expect(exported[0]).toEqual([33, 85, 205, 255]);
  for (let i = 1; i < 3; i++) {
    const paper = [255, 254, 248];
    for (let channel = 0; channel < 3; channel++) {
      const alpha = pixels[i][3] / 255;
      expect(
        Math.abs(
          exported[i][channel] -
            (pixels[i][channel] * alpha + paper[channel] * (1 - alpha)),
        ),
      ).toBeLessThanOrEqual(2);
    }
  }
});

test("recognition normalizes coloured pencil ink and ignores highlighting while retaining erase order", async ({
  page,
}) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const { rasterizeRow, prepareComer } = (await import(
      `${location.origin}/src/recognition/rasterize.ts`
    )) as typeof import("../../src/recognition/rasterize");
    const { replayInk } = (await import(
      `${location.origin}/src/ink/replay.ts`
    )) as typeof import("../../src/ink/replay");
    const base: InkOperation = {
      kind: "stroke",
      stroke: {
        id: "engineering-input",
        rowId: "row-1",
        width: 3,
        points: [
          { x: 100, y: 60, pressure: 0.5, t: 1 },
          { x: 150, y: 60, pressure: 0.5, t: 2 },
        ],
        bounds: { x: 98.5, y: 58.5, width: 53, height: 3 },
      },
    };
    const pencil: InkOperation = {
      kind: "stroke",
      stroke: { ...base.stroke, style: "pencil", color: "#c2343d" },
    };
    const highlighted: InkOperation = {
      kind: "stroke",
      stroke: {
        ...base.stroke,
        id: "annotation",
        style: "highlighter",
        color: "#f2c94c",
        width: 24,
      },
    };
    const mask: InkOperation = {
      kind: "pixel-mask",
      mask: {
        id: "eraser",
        rowId: "row-1",
        radius: 40,
        points: [{ x: 125, y: 60, pressure: 0.5, t: 3 }],
      },
    };
    function tensor(operations: InkOperation[]) {
      const { canvas, visibleInkBounds } = rasterizeRow(operations, "row-1");
      if (!canvas) return null;
      const input = prepareComer(canvas);
      canvas.width = canvas.height = 0;
      return { input, visibleInkBounds };
    }
    const original = tensor([base]);
    const styled = tensor([pencil, highlighted]);
    if (!original || !styled) throw new Error("Missing writing raster");
    const display = new OffscreenCanvas(960, 136);
    const ctx = display.getContext("2d");
    if (!ctx) throw new Error("Missing display context");
    replayInk(ctx, [pencil, mask, highlighted]);
    return {
      sameTensor: original.input.tensor.every(
        (value, index) => value === styled.input.tensor[index],
      ),
      sameMask: original.input.mask.every(
        (value, index) => value === styled.input.mask[index],
      ),
      sameBounds:
        JSON.stringify(original.visibleInkBounds) ===
        JSON.stringify(styled.visibleInkBounds),
      annotationOnly: tensor([highlighted]),
      erasedWriting: tensor([pencil, mask, highlighted]),
      laterWritingSurvives: tensor([pencil, mask, base]) !== null,
      annotationAlpha: ctx.getImageData(125, 60, 1, 1).data[3],
    };
  });
  expect(result).toMatchObject({
    sameTensor: true,
    sameMask: true,
    sameBounds: true,
    annotationOnly: null,
    erasedWriting: null,
    laterWritingSurvives: true,
  });
  expect(result.annotationAlpha).toBeCloseTo(0.28 * 255, 0);
});

test("one continuous page preserves boundary-crossing strokes and ink in former gaps through saving and zoom", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".row-number")).toHaveCount(0);
  await expect(page.locator(".baseline")).toHaveCount(0);
  await expect(page.locator(".paper-rules")).toHaveCount(1);
  await centerPageAt(page, 230);
  const start = await pagePoint(page, 100, 110);
  const end = await pagePoint(page, 150, 350);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  const gap = await pagePoint(page, 250, 150);
  await page.mouse.click(gap.x, gap.y);
  const before = await backup(page);
  const row = before.pages[0].rows.find(
    (row: { rowId: string }) => row.rowId === "row-1",
  );
  expect(row.operations).toHaveLength(2);
  expect(
    Math.max(
      ...row.operations[0].stroke.points.map((point: { y: number }) => point.y),
    ),
  ).toBeCloseTo(350);
  expect(row.operations[1].stroke.points[0].y).toBeCloseTo(150);
  const bounds = await page.evaluate(async (row) => {
    const { rasterizeRow } = await import(
      `${location.origin}/src/recognition/rasterize.ts`
    );
    const result = rasterizeRow(row.operations, row.rowId);
    if (result.canvas) result.canvas.width = result.canvas.height = 0;
    return result.visibleInkBounds;
  }, row);
  expect(bounds.height).toBeGreaterThan(230);
  await page.getByLabel("Page zoom").selectOption("150");
  expect((await backup(page)).pages[0].rows[0].operations).toEqual(
    row.operations,
  );
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  expect((await backup(page)).pages[0].rows[0].operations).toEqual(
    row.operations,
  );
});

test("a page-wide pixel sweep undoes once and its older mask cannot remove another group's later ink", async ({
  page,
}) => {
  await ready(page);
  await centerPageAt(page, 210);
  for (const y of [110, 300]) {
    const from = await pagePoint(page, 100, y),
      to = await pagePoint(page, 300, y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
  }
  const before = await backup(page);
  await page.getByRole("button", { name: "Pixel eraser", exact: true }).click();
  const from = await pagePoint(page, 200, 90),
    to = await pagePoint(page, 200, 320);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const after = await backup(page);
  for (const row of after.pages[0].rows.slice(0, 2))
    expect(row.operations.at(-1).kind).toBe("pixel-mask");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await backup(page);
  for (const row of undone.pages[0].rows.slice(0, 2))
    expect(row.operations).toEqual(
      before.pages[0].rows.find(
        (old: { rowId: string }) => old.rowId === row.rowId,
      ).operations,
    );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await centerPageAt(page, 110);
  const ink = await pagePoint(page, 200, 110);
  await page.mouse.click(ink.x, ink.y);
  expect(
    await page
      .locator('[data-layer="ink"]')
      .evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing ink context");
        return context.getImageData(
          Math.round((200 / 960) * canvas.width),
          Math.round((110 / 1280) * canvas.height),
          1,
          1,
        ).data[3];
      }),
  ).toBeGreaterThan(0);
});

test("pages, per-page history, last-line recognition and local recovery work through the shared worker", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel("Page title", { exact: true })
    .fill("First calculations");
  await dot(page, 7);
  await expect(page.locator('[data-row="row-8"]')).toHaveClass(/ready/);
  const before = await backup(page);
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await page
    .getByLabel("Page title", { exact: true })
    .fill("Second calculations");
  await dot(page);
  await expect(page.locator('[data-row="row-1"]')).toHaveClass(/ready/);
  const second = await backup(page);
  expect(second.pages[0].rows[7].operations).toEqual(
    before.pages[0].rows[7].operations,
  );
  expect(second.pages[1].rows[0].operations).toHaveLength(1);
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await backup(page)).pages[0].rows[7].operations).toHaveLength(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    "First calculations",
  );
  await expect(page.locator('[data-row="row-8"]')).toHaveClass(/ready/);
  expect((await backup(page)).pages[0].rows[7].operations).toEqual(
    before.pages[0].rows[7].operations,
  );
  expect(page.workers()).toHaveLength(1);
});

test("zoom, Focus mode, Move mode and responsive layouts keep the same stroke coordinates", async ({
  page,
}) => {
  await ready(page);
  await dot(page);
  const before = await backup(page);
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Notebook pages" }),
  ).toHaveCount(0);
  await page.getByLabel("Page zoom").selectOption("150");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await dot(page);
  expect((await backup(page)).pages[0].rows[0].operations).toEqual(
    before.pages[0].rows[0].operations,
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const style = await page.locator(".wordmark").evaluate((element) => ({
      font: getComputedStyle(element).fontFamily,
      style: getComputedStyle(element).fontStyle,
    }));
    expect(style.font).toContain("Georgia");
    expect(style.style).toBe("italic");
    expect((await backup(page)).pages[0].rows[0].operations).toEqual(
      before.pages[0].rows[0].operations,
    );
  }
});

test("PNG export contains a complete page and Inter loads from this origin", async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".woff2")) fonts.push(request.url());
  });
  await ready(page);
  await dot(page);
  await page.getByLabel("Export and help").click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export page PNG" }).click();
  const stream = await (await pending).createReadStream();
  if (!stream) throw new Error("Missing PNG");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(PAGE.width + 64);
  expect(png.readUInt32BE(20)).toBe(PAGE.height + 170);
  expect(fonts.length).toBeGreaterThan(0);
  expect(
    fonts.every((url) => new URL(url).origin === new URL(page.url()).origin),
  ).toBe(true);
});

test("a second tab cannot overwrite the notebook saved by the first tab", async ({
  page,
  context,
}) => {
  await ready(page);
  await page
    .getByLabel("Page title", { exact: true })
    .fill("Original notebook");
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByTestId("save-status")).toContainText("Session only");
  await other.getByLabel("Page title", { exact: true }).fill("Other tab draft");
  await other.close();
  await page.reload();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    "Original notebook",
  );
});

test("backup restore is validated before replacing ink and rejects corrupt files without data loss", async ({
  page,
}) => {
  await ready(page);
  await dot(page, 7);
  const original = await backup(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByLabel("Notebook backup file").setInputFiles({
    name: "notebook.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(page.locator('[data-row="row-8"]')).toHaveClass(/ready/);
  expect((await backup(page)).pages[0].rows[7].operations).toEqual(
    original.pages[0].rows[7].operations,
  );
  await page.getByLabel("Notebook backup file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"invalid"}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Your notebook is preserved",
  );
  expect((await backup(page)).pages[0].rows[7].operations).toEqual(
    original.pages[0].rows[7].operations,
  );
});
