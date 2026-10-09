import { expect, type Page, test } from "@playwright/test";

async function ready(page: Page, transcript = "y=x^2") {
  await page.goto(`/?transcript=${encodeURIComponent(transcript)}`);
  await expect(page.getByTestId("save-status")).toHaveText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.getByLabel("Graph equation")).toBeVisible();
}
async function curvePixels(page: Page) {
  return page
    .getByRole("img", { name: /^Interactive graph/ })
    .evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels) throw new Error("Missing graph pixels");
      let blue = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 80 && pixels[i + 1] < 140 && pixels[i + 2] > 170)
          blue++;
      return blue;
    });
}

test("plots explicit and implicit equations and clears stale curves for invalid input", async ({
  page,
}) => {
  await ready(page);
  const equation = page.getByLabel("Graph equation");
  await equation.fill("y = x^2");
  await expect(page.locator("#graph-equation-status")).toContainText(
    "Plotted below",
  );
  await expect.poll(() => curvePixels(page)).toBeGreaterThan(500);
  await equation.fill("x^2 + y^2 = 9");
  await expect.poll(() => curvePixels(page)).toBeGreaterThan(500);
  await equation.fill("y = window.alert(1)");
  await expect(equation).toHaveAttribute("aria-invalid", "true");
  await expect.poll(() => curvePixels(page)).toBe(0);
  await equation.fill("y = 1/x");
  await expect(equation).toHaveAttribute("aria-invalid", "false");
  await expect.poll(() => curvePixels(page)).toBeGreaterThan(500);
});

test("pans and zooms with mouse, wheel, buttons and keyboard", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Graph equation").fill("x^2+y^2=9");
  const canvas = page.getByRole("img", { name: /^Interactive graph/ });
  const view = page.getByTestId("graph-view");
  await canvas.scrollIntoViewIfNeeded();
  let box = await canvas.boundingBox();
  if (!box) throw new Error("Missing graph");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 40,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(view).toHaveAttribute("data-x", "-2");
  await expect(view).toHaveAttribute("data-y", "1");
  await page.getByRole("button", { name: "Zoom graph in" }).click();
  await expect(view).toHaveAttribute("data-scale", "50");
  await page.getByRole("button", { name: "Zoom graph out" }).click();
  await expect(view).toHaveAttribute("data-scale", "40");
  await canvas.scrollIntoViewIfNeeded();
  box = await canvas.boundingBox();
  if (!box) throw new Error("Missing graph");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => Number(await view.getAttribute("data-scale")))
    .toBeGreaterThan(40);
  await canvas.focus();
  await page.keyboard.press("Home");
  await expect(view).toHaveAttribute("data-scale", "40");
  await page.keyboard.press("ArrowRight");
  await expect(view).toHaveAttribute("data-x", "1");
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(view).toHaveAttribute("data-x", "0");
  await expect(view).toHaveAttribute("data-y", "0");
});

test("routes handwriting to the graph, protects manual corrections and separates notebook ink", async ({
  page,
}) => {
  await ready(page, "x^2+y^2=9");
  const pad = page.getByLabel("Graph handwriting canvas");
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error("Missing writing pad");
  await page.mouse.click(
    box.x + (120 / 960) * box.width,
    box.y + (60 / 280) * box.height,
  );
  await expect(page.getByLabel("Graph equation")).toHaveValue("x^2+y^2=9");
  await expect.poll(() => curvePixels(page)).toBeGreaterThan(500);
  await page.getByLabel("Graph equation").fill("y=2x+1");
  await page.getByRole("button", { name: "Notebook", exact: true }).click();
  await expect(page.locator('[data-layer="ink"]')).toBeVisible();
  const empty = await page
    .locator('[data-layer="ink"]')
    .evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels?.some((value, index) => index % 4 === 3 && value !== 0);
    });
  expect(empty).toBe(false);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.getByLabel("Graph equation")).toHaveValue("y=2x+1");
  await expect(page.locator(".model-badge")).toHaveText(/Mock ready/);
  await page.waitForTimeout(800);
  await expect(page.getByLabel("Graph equation")).toHaveValue("y=2x+1");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Graph equation")).toHaveValue("");
  await expect.poll(() => curvePixels(page)).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Graph equation")).toHaveValue("x^2+y^2=9");
  await page
    .getByRole("button", { name: "Stroke eraser", exact: true })
    .click();
  await pad.scrollIntoViewIfNeeded();
  const restoredBox = await pad.boundingBox();
  if (!restoredBox) throw new Error("Missing restored writing pad");
  await page.mouse.click(
    restoredBox.x + (120 / 960) * restoredBox.width,
    restoredBox.y + (60 / 280) * restoredBox.height,
  );
  await expect(page.getByLabel("Graph equation")).toHaveValue("");
  await expect.poll(() => curvePixels(page)).toBe(0);
});

test.describe("phone controls", () => {
  test.use({ viewport: { width: 390, height: 960 }, hasTouch: true });
  test("custom colour palette fits the screen and graph supports touch pinch", async ({
    page,
  }, testInfo) => {
    await ready(page);
    await page.getByLabel("Choose pen colour").click();
    const palette = page.getByRole("group", { name: "Pen colours" });
    await expect(palette).toBeVisible();
    const box = await palette.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Blue", exact: true }).click();
    await page.getByLabel("Choose pen colour").click();
    await page.getByLabel("Pen colour", { exact: true }).fill("#63a55d");
    await expect(page.getByLabel("Pen colour", { exact: true })).toHaveValue(
      "#63a55d",
    );
    await page.getByRole("slider", { name: "Hue", exact: true }).fill("280");
    await expect(
      page.getByLabel("Pen colour", { exact: true }),
    ).not.toHaveValue("#63a55d");
    await page.screenshot({
      path: testInfo.outputPath("colour-palette-mobile.png"),
    });
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await page.getByRole("button", { name: "Move", exact: true }).click();
    const pad = page.getByLabel("Graph handwriting canvas");
    await pad.scrollIntoViewIfNeeded();
    const padBox = await pad.boundingBox();
    if (!padBox) throw new Error("Missing writing pad");
    await page.mouse.move(padBox.x + 200, padBox.y + 50);
    await page.mouse.down();
    await page.mouse.move(padBox.x + 140, padBox.y + 50, { steps: 3 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page
          .locator(".graph-pad-viewport")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(40);
    await page.getByLabel("Graph equation").fill("x^2+y^2=9");
    const canvas = page.getByRole("img", { name: /^Interactive graph/ });
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    if (!rect) throw new Error("Missing graph");
    const cdp = await page.context().newCDPSession(page);
    const y = rect.y + rect.height / 2,
      middle = rect.x + rect.width / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: middle - 35, y, id: 1 },
        { x: middle + 35, y, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: middle - 70, y, id: 1 },
        { x: middle + 70, y, id: 2 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () =>
        Number(await page.getByTestId("graph-view").getAttribute("data-scale")),
      )
      .toBeGreaterThan(60);
    await cdp.detach();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("graph-mobile.png"),
      fullPage: true,
    });
  });
});
