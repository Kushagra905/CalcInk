import { expect, it } from "vitest";
import {
  createHandwritingSample,
  exportSamples,
  samplePlan,
} from "../../src/dev/capture";
import { createFixture } from "../../src/dev/fixture";
import { createDocumentStore } from "../../src/document/store";
import { strokeBounds } from "../../src/ink/geometry";
import { evaluateTranscript } from "../../src/math/evaluate";
import { parseFixtures } from "../../tools/model-lab/fixtures";

const options = {
  dataset: "development" as const,
  writerSlot: "A" as const,
  writer: " Automated test only ",
  promptId: "development-1",
  device: {
    input: "mouse" as const,
    description: "Unit test",
    userAgent: "test",
    dpr: 2,
  },
};

it("reserves 24 development and 50 held-out captures with disjoint expressions and required-symbol coverage", () => {
  const development = samplePlan("development");
  const heldOut = samplePlan("held-out");
  expect(development.length * 2).toBe(24);
  expect(heldOut.length * 2).toBe(50);
  const known = new Set<string>(development.map((prompt) => prompt.transcript));
  expect(heldOut.every((prompt) => !known.has(prompt.transcript))).toBe(true);
  expect(
    new Set([...development, ...heldOut].map((prompt) => prompt.id)).size,
  ).toBe(37);
  const symbols = development.map((prompt) => prompt.transcript).join("");
  for (const symbol of "0123456789+-×÷.=") expect(symbols).toContain(symbol);
  expect(development.some((prompt) => prompt.spacing === "cramped")).toBe(true);
});

it("exports immutable captured ink with reference labels, and rejects missing metadata, empty or synthetic ink", () => {
  const document = createDocumentStore();
  expect(() =>
    createHandwritingSample(document.getRow("row-1"), options),
  ).toThrow("Draw");
  document.begin("row-1");
  document.commit(createFixture());
  expect(() =>
    createHandwritingSample(document.getRow("row-1"), options),
  ).toThrow("Synthetic");
  document.clear();
  const points = [{ x: 30, y: 40, t: 1, pressure: 0.5 }];
  document.begin("row-1");
  document.commit([
    {
      kind: "stroke",
      stroke: {
        id: "unit-test-ink",
        rowId: "row-1",
        width: 3,
        points,
        bounds: strokeBounds(points, 3, "row-1"),
      },
    },
  ]);
  const row = document.getRow("row-1");
  const sample = createHandwritingSample(row, options);
  expect(sample).toMatchObject({
    id: "dev-A-01",
    sampleId: "dev-A-01",
    writer: "Automated test only",
    expectedTranscript: "18 + 4 × 3 =",
    expectedValue: "30",
    provenance: "writer-confirmed",
  });
  expect(sample.operations).toBe(row.operations);
  expect(() =>
    createHandwritingSample(row, { ...options, writer: " " }),
  ).toThrow("writer");
  expect(() =>
    createHandwritingSample(row, { ...options, promptId: "held-out-1" }),
  ).toThrow("prompt");
  expect(() =>
    createHandwritingSample(row, {
      ...options,
      device: { ...options.device, description: "" },
    }),
  ).toThrow("device");
});

it("translates row-three captures into B's import format without changing stored ink or losing metadata", () => {
  const document = createDocumentStore();
  const points = [{ x: 30, y: 365, t: 1, pressure: 0.5 }];
  document.begin("row-3");
  document.commit([
    {
      kind: "stroke",
      stroke: {
        id: "row-three",
        rowId: "row-3",
        width: 3,
        points,
        bounds: strokeBounds(points, 3, "row-3"),
      },
    },
  ]);
  const sample = createHandwritingSample(document.getRow("row-3"), {
    ...options,
    writerSlot: "B",
    writer: "Test B",
  });
  const bundle = exportSamples([sample], "development");
  expect(parseFixtures(bundle).samples[0].sampleId).toBe("dev-B-01");
  expect(bundle.samples[0].captureRowId).toBe("row-3");
  expect(bundle.samples[0].device).toEqual(options.device);
  const operation = bundle.samples[0].operations[0];
  if (operation.kind !== "stroke") throw new Error("Expected stroke");
  expect(operation.stroke.points[0].y).toBe(45);
  expect(operation.stroke.bounds.y).toBe(43.5);
  expect(sample.operations[0]).toEqual(document.getRow("row-3").operations[0]);
  expect(sample.rowId).toBe("row-3");
  expect(() =>
    exportSamples([{ ...sample, expectedTranscript: "wrong" }], "development"),
  ).toThrow("labels");
});

it("keeps reference values consistent with the shared expression list", () => {
  for (const dataset of ["development", "held-out"] as const) {
    for (const prompt of samplePlan(dataset)) {
      const outcome = evaluateTranscript(prompt.transcript).outcome;
      expect(
        outcome.kind === "answer"
          ? outcome.value
          : outcome.kind === "undefined"
            ? "Undefined"
            : outcome.kind,
      ).toBe(prompt.value);
    }
  }
});
