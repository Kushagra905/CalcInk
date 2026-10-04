import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { evaluateTranscript } from "../../src/math/evaluate";
import { heldOutCases } from "../../tools/model-lab/evaluation";

const execute = promisify(execFile);
test("reject incomplete fixtures, run real WASM through the final coordinator and verify exported failures", async ({
  page,
}) => {
  // Synthetic engineering fixtures. Writer metadata exercises validation only;
  // neither this data nor its report is genuine handwriting acceptance evidence.
  const samples = heldOutCases.map((plan, index) => {
    const outcome = evaluateTranscript(plan.expected).outcome;
    return {
      sampleId: plan.id,
      dataset: "held-out",
      sampleType: "handwritten",
      provenance: "writer-confirmed",
      writerSlot: plan.writer,
      writer: `SYNTHETIC TEST ${plan.writer}`,
      expectedTranscript: plan.expected,
      expectedValue: outcome.kind === "answer" ? outcome.value : "Undefined",
      capturedAt: new Date().toISOString(),
      device: {
        input: "mouse",
        description: "Synthetic engineering test only",
        userAgent: "Synthetic test",
        dpr: 1,
      },
      operations: [
        {
          kind: "stroke",
          stroke: {
            id: `engineering-${index}`,
            rowId: "row-1",
            width: 3,
            bounds: { x: 100 + index, y: 40, width: 3, height: 60 },
            points: [
              { x: 100 + index, y: 40, pressure: 0.5, t: 0 },
              { x: 100 + index, y: 100, pressure: 0.5, t: 100 },
            ],
          },
        },
      ],
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("tools/model-lab/final.html");
  const file = (subset: typeof samples) => ({
    name: "synthetic-engineering-test.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        dataset: "held-out",
        samples: subset,
      }),
    ),
  });
  await page.locator("#files").setInputFiles(file(samples.slice(0, 49)));
  await expect(page.locator("#import-status")).toContainText("ALL_50");
  await expect(page.locator("#run")).toBeDisabled();
  await page.locator("#files").setInputFiles(file(samples));
  await expect(page.locator("#import-status")).toContainText(
    "50 samples validated",
  );
  await page
    .locator("#device")
    .fill("SYNTHETIC ENGINEERING TEST — not accuracy evidence");
  await page.locator("#os").fill("Automated test environment");
  await page.locator("#confirm").check();
  await page.locator("#run").click();
  await expect(page.locator("#status")).toContainText("Completed all 50", {
    timeout: 100_000,
  });
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const path = test.info().outputPath("synthetic-engineering-report.json");
  await (await download).saveAs(path);
  const report = JSON.parse(await readFile(path, "utf8"));
  expect(report.entries).toHaveLength(50);
  expect(
    report.entries.every(
      (entry: { result: { modelId: string } }) =>
        entry.result.modelId === "ink-on-comer-int8",
    ),
  ).toBe(true);
  expect(report.initializationMs).toBeGreaterThan(0);
  expect(report.entries[0].totalUpdateMs).toBeGreaterThanOrEqual(350);
  expect(report.confirmation.manualCorrections).toBe(0);
  const verified = await execute(
    process.execPath,
    ["scripts/phase6-report.mjs", path],
    { maxBuffer: 2_000_000 },
  );
  const summary = JSON.parse(verified.stdout).summary;
  expect(summary.exactCanonical).toBe(0);
  expect(summary.arithmeticCorrect).toBe(0);
  expect(summary.gates.transcription).toBe(false);
  await expect(
    execute(process.execPath, [
      "scripts/phase6-report.mjs",
      path,
      "--require-targets",
    ]),
  ).rejects.toMatchObject({ code: 2 });
  report.fixturesSha256 = "0".repeat(64);
  const tampered = test.info().outputPath("tampered-engineering-report.json");
  await writeFile(tampered, JSON.stringify(report));
  await expect(
    execute(process.execPath, ["scripts/phase6-report.mjs", tampered]),
  ).rejects.toThrow();
  expect(errors).toEqual([]);
});
