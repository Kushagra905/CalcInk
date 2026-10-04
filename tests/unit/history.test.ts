import { expect, it } from "vitest";
import { createDocumentStore } from "../../src/document/store";
import type { InkOperation } from "../../src/document/types";
import { strokeBounds } from "../../src/ink/geometry";

function draw(
  document: ReturnType<typeof createDocumentStore>,
  id: string,
  rowId = "row-1",
) {
  const points = [
    { x: 40, y: rowId === "row-1" ? 40 : 200, pressure: 0.5, t: 1 },
  ];
  const operation: InkOperation = {
    kind: "stroke",
    stroke: {
      id,
      rowId,
      width: 4,
      points,
      bounds: strokeBounds(points, 4, rowId),
    },
  };
  document.begin(rowId);
  document.commit([...document.getRow(rowId).operations, operation]);
}

it("restores multi-row geometry in global edit order and keeps clear epochs and revisions increasing", () => {
  const document = createDocumentStore();
  draw(document, "first");
  const first = document.getRow("row-1").operations;
  draw(document, "second", "row-2");
  const second = document.getRow("row-2").operations;
  document.undo();
  expect(document.getRow("row-2").operations).toHaveLength(0);
  expect(document.getRow("row-1").operations).toBe(first);
  document.redo();
  expect(document.getRow("row-2").operations).toBe(second);
  document.clear();
  const clearedRevision = document.getRow("row-2").rowRevision;
  expect(document.getEpoch()).toBe(1);
  document.undo();
  expect(document.getRow("row-1").operations).toBe(first);
  expect(document.getRow("row-2").operations).toBe(second);
  expect(document.getEpoch()).toBe(1);
  expect(document.getRow("row-2").rowRevision).toBeGreaterThan(clearedRevision);
  document.redo();
  expect(document.getRows().every((row) => !row.operations.length)).toBe(true);
  document.undo();
  document.undo();
  draw(document, "branch");
  expect(document.getHistoryState().canRedo).toBe(false);
  expect(document.getRow("row-2").operations).toHaveLength(0);
  expect(document.getRow("row-1").operations[0]).toBe(first[0]);
});

it("does not record cancelled/no-op gestures and drops capture history at a reset boundary", () => {
  const document = createDocumentStore();
  draw(document, "original");
  document.undo();
  document.begin("row-2");
  document.cancel();
  expect(document.getHistoryState().canRedo).toBe(true);
  document.redo();
  document.begin("row-1");
  document.commit(document.getRow("row-1").operations);
  document.undo();
  expect(document.getRow("row-1").operations).toHaveLength(0);
  document.redo();
  draw(document, "other", "row-2");
  const epoch = document.getEpoch();
  const otherRevision = document.getRow("row-2").rowRevision;
  document.reset("row-1");
  expect(document.getEpoch()).toBe(epoch);
  expect(document.getRow("row-2").rowRevision).toBe(otherRevision);
  expect(document.getRow("row-2").operations).toHaveLength(1);
  expect(document.getHistoryState()).toMatchObject({
    canUndo: false,
    canRedo: false,
  });
  document.undo();
  expect(document.getRow("row-1").operations).toHaveLength(0);
});

it("caps undo history at 100 commands while preserving committed ink", () => {
  const document = createDocumentStore();
  for (let index = 0; index < 105; index++) draw(document, String(index));
  for (let index = 0; index < 100; index++) document.undo();
  expect(document.getHistoryState().canUndo).toBe(false);
  expect(document.getRow("row-1").operations).toHaveLength(5);
  for (let index = 0; index < 100; index++) document.redo();
  expect(document.getRow("row-1").operations).toHaveLength(105);
});

it("bounds the actual quadratic extrema and pen width rather than the control-point envelope", () => {
  const points = [
    { x: 10, y: 10 },
    { x: 60, y: 130 },
    { x: 110, y: 10 },
    { x: 160, y: 10 },
  ].map((point) => ({ ...point, t: 1, pressure: 0.5 }));
  const bounds = strokeBounds(points, 4, "row-1");
  expect(bounds.x).toBe(8);
  expect(bounds.width).toBe(154);
  expect(bounds.y).toBe(8);
  expect(bounds.height).toBeCloseTo(84);
});
