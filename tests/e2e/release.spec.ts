import { expect, test } from "@playwright/test";

test("narrow layouts retain readable text, 44px controls and visible keyboard focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("Mock ready", { exact: true })).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const audit = await page.evaluate(() => {
      function luminance(color: string) {
        const channels = color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (!channels) throw new Error(`Unexpected color: ${color}`);
        const linear = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      }
      const text = [
        ...document.querySelectorAll<HTMLElement>(
          ".eyebrow, #writing-help, .pen-width, .row-feedback, .feedback-row, .page-footer, .model-badge",
        ),
      ].filter((element) => element.getBoundingClientRect().height > 0);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        controls: [
          ...document.querySelectorAll<HTMLElement>(
            ".notebook-tools button, .notebook-tools input",
          ),
        ].map((element) => ({
          name: element.textContent || element.getAttribute("type"),
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        })),
        contrast: text.map((element) => {
          let parent: HTMLElement | null = element;
          let background = "rgb(255, 255, 255)";
          while (parent) {
            const color = getComputedStyle(parent).backgroundColor;
            if (color !== "rgba(0, 0, 0, 0)") {
              background = color;
              break;
            }
            parent = parent.parentElement;
          }
          const foreground = luminance(getComputedStyle(element).color);
          const back = luminance(background);
          return {
            text: element.textContent,
            ratio:
              (Math.max(foreground, back) + 0.05) /
              (Math.min(foreground, back) + 0.05),
          };
        }),
      };
    });
    expect(audit.overflow).toBe(false);
    for (const control of audit.controls) {
      expect(control.width, control.name ?? "control").toBeGreaterThanOrEqual(
        44,
      );
      expect(control.height, control.name ?? "control").toBeGreaterThanOrEqual(
        44,
      );
    }
    for (const text of audit.contrast)
      expect(text.ratio, text.text ?? "text").toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole("link", { name: "CalcInk home" }).focus();
  await page.keyboard.press("Tab");
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await expect(pen).toBeFocused();
  expect(
    await pen.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focus: element.matches(":focus-visible"),
        outline: style.outlineWidth,
        animation: style.animationName,
        transition: style.transitionDuration,
      };
    }),
  ).toEqual({
    focus: true,
    outline: "3px",
    animation: "none",
    transition: "0s",
  });
  await expect(
    page.getByRole("button", { name: "Clear", exact: true }),
  ).toHaveAttribute("title", "Clear all rows (undoable)");
});

test("live DPR changes cancel provisional erasing, replay ink and preserve history shortcuts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const queries: MediaQueryList[] = [];
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (query.startsWith("(resolution:")) queries.push(result);
      return result;
    };
    Reflect.set(window, "testDprQueries", queries);
  });
  await page.goto("/");
  const canvas = page.locator('[data-layer="live"]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas");
  const point = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.08 };
  const ink = () =>
    page
      .locator('[data-layer="ink"]')
      .evaluate((element: HTMLCanvasElement) => {
        const context = element.getContext("2d");
        if (!context) throw new Error("Missing context");
        return context
          .getImageData(0, 0, element.width, element.height)
          .data.some((value, index) => index % 4 === 3 && value > 0);
      });
  await page.mouse.click(point.x, point.y);
  expect(await ink()).toBe(true);
  await page.getByRole("button", { name: "Pixel eraser", exact: true }).click();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect.poll(ink).toBe(false);
  const cdp = await page.context().newCDPSession(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 3,
    mobile: false,
  });
  // Chromium's CDP override updates DPR/matches without emitting change events
  // (also reproduced on a blank page). Supply the browser event explicitly.
  await page.evaluate(() => {
    for (const query of [
      ...(Reflect.get(window, "testDprQueries") as MediaQueryList[]),
    ])
      if (!query.matches)
        query.dispatchEvent(
          new MediaQueryListEvent("change", {
            matches: query.matches,
            media: query.media,
          }),
        );
  });
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => ({
        dpr: devicePixelRatio,
        scaled:
          element.width ===
          Math.round(element.getBoundingClientRect().width * devicePixelRatio),
      })),
    )
    .toEqual({ dpr: 3, scaled: true });
  await page.mouse.up();
  await expect.poll(ink).toBe(true);
  await canvas.focus();
  for (const [undo, redo] of [
    ["Control+z", "Control+y"],
    ["Meta+z", "Meta+Shift+z"],
  ]) {
    await page.keyboard.press(undo);
    await expect.poll(ink).toBe(false);
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press(redo);
    await expect.poll(ink).toBe(true);
  }
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.click(point.x + 20, point.y);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await ink()).toBe(true);
});
