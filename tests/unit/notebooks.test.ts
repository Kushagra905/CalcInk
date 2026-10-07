import { describe, expect, it } from "vitest";
import { createFixture } from "../../src/dev/fixture";
import {
  createNotebookCollection,
  MAX_PAGES,
} from "../../src/document/notebooks";
import { ROWS } from "../../src/document/rows";
import { createDocumentStore } from "../../src/document/store";
import { strokeBounds } from "../../src/ink/geometry";
import { rowTop } from "../../src/recognition/rasterize";

describe("notebook pages", () => {
  it("isolates ink and undo histories and never reuses an epoch across page switches", () => {
    const collection = createNotebookCollection();
    const document = collection.document;
    const firstId = collection.getInfo().activePageId;
    document.begin("row-1");
    document.commit(createFixture());
    const original = document.getRow("row-1").operations;
    const epoch = document.getEpoch();
    collection.addPage();
    const secondId = collection.getInfo().activePageId;
    expect(document.getEpoch()).toBeGreaterThan(epoch);
    expect(document.getRow("row-1").operations).toHaveLength(0);
    expect(document.getHistoryState().canUndo).toBe(false);
    document.begin("row-1");
    document.commit(createFixture());
    collection.activate(firstId);
    const switched = document.getEpoch();
    expect(document.getRow("row-1").operations).toEqual(original);
    document.undo();
    expect(document.getRow("row-1").operations).toHaveLength(0);
    collection.activate(secondId);
    expect(document.getEpoch()).toBeGreaterThan(switched);
    expect(document.getRow("row-1").operations).toEqual(original);
    collection.activate(firstId);
    document.redo();
    expect(document.getRow("row-1").operations).toEqual(original);
  });
  it("restores immutable last-line ink without trusting saved revisions or exposing restore as Undo", () => {
    const collection = createNotebookCollection();
    const row = ROWS.at(-1);
    if (!row) throw new Error("Missing last line");
    const points = [{ x: 200, y: row.top + 50, pressure: 0.5, t: 1 }];
    collection.document.begin(row.id);
    collection.document.commit([
      {
        kind: "stroke",
        stroke: {
          id: "last-row",
          rowId: row.id,
          width: 3,
          points,
          bounds: strokeBounds(points, 3, row.id),
        },
      },
    ]);
    collection.rename("Saved page");
    const saved = JSON.parse(JSON.stringify(collection.serialize()));
    saved.pages[0].rows.at(-1).rowRevision = 999;
    const restored = createNotebookCollection();
    restored.restore(saved);
    expect(restored.document.getRow(row.id).rowRevision).toBe(1);
    expect(restored.document.getRow(row.id).operations).toEqual(
      collection.document.getRow(row.id).operations,
    );
    expect(restored.document.getHistoryState().canUndo).toBe(false);
    expect(
      Object.isFrozen(restored.document.getRow(row.id).operations[0]),
    ).toBe(true);
    expect(rowTop(row.id)).toBe(row.top);
  });
  it("rejects incompatible, duplicate and malformed saved data atomically", () => {
    const collection = createNotebookCollection();
    collection.document.begin("row-1");
    collection.document.commit(createFixture());
    const original = collection.serialize();
    const invalid = JSON.parse(JSON.stringify(original));
    invalid.pages.push(invalid.pages[0]);
    expect(() => collection.restore(invalid)).toThrow("Invalid notebook page");
    expect(collection.serialize()).toEqual(original);
    expect(() =>
      collection.restore({
        ...original,
        geometry: { width: 960, height: 480 },
      }),
    ).toThrow("Unsupported notebook");
    const broken = JSON.parse(JSON.stringify(original));
    broken.pages[0].rows[0].operations[0].stroke.points[0].y = 5000;
    expect(() => collection.restore(broken)).toThrow("Invalid ink point");
    expect(collection.serialize()).toEqual(original);
    expect(() =>
      createDocumentStore([
        { rowId: "row-1", rowRevision: 0, operations: [] },
        { rowId: "row-1", rowRevision: 0, operations: [] },
      ]),
    ).toThrow("Duplicate saved row");
  });
  it("bounds page count and retains the active page when the limit is reached", () => {
    const collection = createNotebookCollection();
    for (let index = 1; index < MAX_PAGES; index++) collection.addPage();
    const active = collection.getInfo().activePageId;
    expect(() => collection.addPage()).toThrow("page limit");
    expect(collection.getInfo().activePageId).toBe(active);
  });
});
