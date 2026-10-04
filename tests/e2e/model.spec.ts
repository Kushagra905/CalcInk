import { expect, test } from "@playwright/test";

test("real local WASM worker initializes, infers and evaluates without remote requests", async ({
  page,
}) => {
  test.skip(
    process.env.CALCINK_MODEL_TEST !== "1",
    "Run after assets:prepare -- ink-on-comer-int8 with CALCINK_MODEL_TEST=1",
  );
  test.setTimeout(90000);
  const remote: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173/") &&
      !request.url().startsWith("blob:")
    )
      remote.push(request.url());
  });
  await page.goto("/tools/model-lab/");
  await expect(page.locator("#model")).toHaveValue("trocr-mathwriting-int8");
  await page.locator("#load").click();
  await expect(page.locator("#status")).toContainText(
    "MODEL_LICENSE_UNRESOLVED",
  );
  await expect.poll(() => page.workers().length).toBe(0);
  await page.locator("#model").selectOption("ink-on-comer-int8");
  await page.locator("#load").click();
  await expect(page.locator("#status")).toContainText("Local model ready", {
    timeout: 60000,
  });
  const canvas = page.locator("#ink");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing lab canvas");
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.7, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.locator("#recognize")).toBeEnabled();
  await page.locator("#recognize").click();
  await expect(page.locator("#result")).toContainText('"outcome"', {
    timeout: 30000,
  });
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(typeof result.transcript).toBe("string");
  expect([
    "answer",
    "undefined",
    "invalid",
    "incomplete",
    "unrecognized",
  ]).toContain(result.outcome.kind);
  for (const timing of Object.values(result.timing))
    expect(Number.isFinite(timing)).toBe(true);
  await page.locator("#split").selectOption("held-out");
  await expect(page.locator("#load")).toBeDisabled();
  await expect(page.locator("#recognize")).toBeDisabled();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(remote).toEqual([]);
});
