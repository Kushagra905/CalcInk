import { expect, it } from "vitest";
import { createNotebookCollection } from "../../src/document/notebooks";
import type { InkOperation, PenStyle } from "../../src/document/types";
import { strokeBounds } from "../../src/ink/geometry";
import { groupBounds, writingGroup } from "../../src/ink/groups";
import { sampleCases } from "../../tools/model-lab/cases";
import { parseFixtures } from "../../tools/model-lab/fixtures";

function stroke(style?: PenStyle, color?: string): InkOperation {
  const points = [{ x: 100, y: 100, pressure: 0.5, t: 1 }];
  const width = style === "highlighter" ? 24 : 3;
  return {
    kind: "stroke",
    stroke: {
      id: style ?? "legacy",
      rowId: "row-1",
      width,
      style,
      color,
      points,
      bounds: strokeBounds(points, width, "row-1"),
    },
  };
}

it("retains styled capture metadata and rejects invalid appearance at the lab boundary", () => {
  const bundle = {
    schemaVersion: 1,
    samples: [
      {
        sampleId: sampleCases[0].id,
        capturedAt: "2026-10-09T09:00:00Z",
        operations: [stroke("pencil", "#2155cd")],
      },
    ],
  };
  expect(parseFixtures(bundle)).toBe(bundle);
  const invalid = JSON.parse(JSON.stringify(bundle));
  invalid.samples[0].operations[0].stroke.style = "unknown";
  expect(() => parseFixtures(invalid)).toThrow("INVALID_APPEARANCE");
});

it("preserves appearance through undo, redo, backup and restore, including legacy ink", () => {
  const notebook = createNotebookCollection();
  const document = notebook.document;
  for (const operation of [
    stroke(),
    stroke("pen", "#2155cd"),
    stroke("pencil", "#c2343d"),
    stroke("highlighter", "#f2c94c"),
  ]) {
    document.begin("row-1");
    document.commit([...document.getRow("row-1").operations, operation]);
  }
  const original = document.getRow("row-1").operations;
  document.undo();
  expect(document.getRow("row-1").operations).toHaveLength(3);
  document.redo();
  expect(document.getRow("row-1").operations).toBe(original);
  const saved = JSON.parse(JSON.stringify(notebook.serialize()));
  const restored = createNotebookCollection();
  restored.restore(saved);
  expect(
    JSON.parse(JSON.stringify(restored.document.getRow("row-1").operations)),
  ).toEqual(saved.pages[0].rows[0].operations);
});

it.each([
  { color: "red" },
  { color: 123 },
  { style: "unknown" },
  { style: null },
])("rejects malformed appearance atomically: %j", (appearance) => {
  const notebook = createNotebookCollection();
  notebook.document.begin("row-1");
  notebook.document.commit([stroke("pen", "#2155cd")]);
  const original = notebook.serialize();
  const broken = JSON.parse(JSON.stringify(original));
  Object.assign(broken.pages[0].rows[0].operations[0].stroke, appearance);
  expect(() => notebook.restore(broken)).toThrow("Invalid stroke appearance");
  expect(notebook.serialize()).toEqual(original);
});

it("keeps highlighter bounds out of arithmetic grouping without losing annotations", () => {
  const notebook = createNotebookCollection();
  const document = notebook.document;
  document.begin("row-1");
  document.commit([stroke("pen")]);
  const bounds = groupBounds(document.getRow("row-1"));
  document.begin("row-1");
  document.commit([
    ...document.getRow("row-1").operations,
    stroke("highlighter"),
  ]);
  expect(groupBounds(document.getRow("row-1"))).toEqual(bounds);
  expect(writingGroup(document.getRows(), { x: 150, y: 100 })).toBe("row-1");
  document.undo();
  document.undo();
  document.begin("row-1");
  document.commit([stroke("highlighter")]);
  expect(groupBounds(document.getRow("row-1"))).toBeNull();
  expect(document.getHistoryState().canClear).toBe(true);
});
