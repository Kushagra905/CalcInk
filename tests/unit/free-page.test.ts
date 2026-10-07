import { describe, expect, it } from "vitest";
import { PAGE } from "../../src/document/rows";
import { createDocumentStore } from "../../src/document/store";
import type { InkOperation } from "../../src/document/types";
import { strokeBounds } from "../../src/ink/geometry";
import { writingGroup } from "../../src/ink/groups";

function stroke(
  id: string,
  rowId: string,
  startY: number,
  endY = startY,
): InkOperation {
  const points = [
    { x: 100, y: startY, pressure: 0.5, t: 1 },
    { x: 130, y: endY, pressure: 0.5, t: 2 },
  ];
  return {
    kind: "stroke",
    stroke: {
      id,
      rowId,
      points,
      width: 3,
      bounds: strokeBounds(points, 3, rowId),
    },
  };
}

describe("continuous notebook ink", () => {
  it("preserves strokes across former boundaries and formerly inactive gaps", () => {
    const document = createDocumentStore();
    document.begin("row-1");
    document.commit([stroke("across", "row-1", 145, 900)]);
    const saved = document.getRow("row-1").operations[0];
    if (saved.kind !== "stroke") throw new Error("Missing pen stroke");
    expect(saved.stroke.points.map(({ y }) => y)).toEqual([145, 900]);
    expect(saved.stroke.bounds).toMatchObject({ y: 143.5, height: 758 });
    const restored = createDocumentStore(document.getRows());
    expect(restored.getRow("row-1").operations).toEqual(
      document.getRow("row-1").operations,
    );
    document.begin("row-1");
    expect(() =>
      document.commit([stroke("outside", "row-1", PAGE.height + 1)]),
    ).toThrow("Invalid ink point");
    document.cancel();
    expect(document.getRow("row-1").operations).toHaveLength(1);
  });

  it("groups a nearby character across an old band edge and separates another equation in the same band", () => {
    const document = createDocumentStore();
    document.begin("row-1");
    document.commit([stroke("digit", "row-1", 125, 175)]);
    expect(writingGroup(document.getRows(), { x: 200, y: 165 })).toBe("row-1");
    expect(writingGroup(document.getRows(), { x: 100, y: 40 })).toBe("row-2");
  });

  it("keeps a raised exponent with its base without absorbing a distant or separate line", () => {
    const document = createDocumentStore();
    document.begin("row-1");
    document.commit([stroke("base", "row-1", 100, 160)]);
    expect(writingGroup(document.getRows(), { x: 155, y: 60 })).toBe("row-1");
    expect(writingGroup(document.getRows(), { x: 800, y: 60 })).not.toBe(
      "row-1",
    );
    expect(writingGroup(document.getRows(), { x: 100, y: 40 })).not.toBe(
      "row-1",
    );
    expect(writingGroup(document.getRows(), { x: 155, y: 220 })).not.toBe(
      "row-1",
    );
  });

  it("keeps a sweep over several groups as one undo command and validates atomically", () => {
    const document = createDocumentStore();
    for (const [id, y] of [
      ["row-1", 60],
      ["row-2", 300],
    ] as const) {
      document.begin(id);
      document.commit([stroke(id, id, y)]);
    }
    const before = document.getRows();
    document.begin(["row-1", "row-2"], "erase-stroke");
    document.commitRows(
      new Map([
        ["row-1", []],
        ["row-2", []],
      ]),
    );
    expect(document.getRow("row-1").operations).toHaveLength(0);
    expect(document.getRow("row-2").operations).toHaveLength(0);
    document.undo();
    for (const id of ["row-1", "row-2"])
      expect(document.getRow(id).operations).toEqual(
        before.find((row) => row.rowId === id)?.operations,
      );
    document.begin(["row-1", "row-2"], "erase-pixel");
    expect(() =>
      document.commitRows(
        new Map([
          ["row-1", []],
          ["row-2", [stroke("bad", "row-2", -1)]],
        ]),
      ),
    ).toThrow("Invalid ink point");
    document.cancel();
    expect(document.getRow("row-1").operations).toHaveLength(1);
    expect(document.getRow("row-2").operations).toHaveLength(1);
  });

  it("supports additional expression identities without enlarging or subdividing the paper", () => {
    const document = createDocumentStore();
    expect(document.getRows()).toHaveLength(32);
    document.begin("row-32");
    document.commit([stroke("last", "row-32", 1200)]);
    expect(document.getRow("row-32").operations).toHaveLength(1);
    expect(PAGE.height).toBe(1280);
  });
});
