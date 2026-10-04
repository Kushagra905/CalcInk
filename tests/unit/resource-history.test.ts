import { expect, it } from "vitest";
import { createDocumentStore } from "../../src/document/store";
import type { InkOperation } from "../../src/document/types";

it("200 draw/edit/clear cycles retain bounded replayable history and release redo after a new edit", () => {
  const store = createDocumentStore();
  const stroke = (id: string): InkOperation => ({
    kind: "stroke",
    stroke: {
      id,
      rowId: "row-1",
      width: 3,
      bounds: { x: 100, y: 40, width: 20, height: 40 },
      points: [
        { x: 100, y: 40, pressure: 0.5, t: 0 },
        { x: 120, y: 80, pressure: 0.5, t: 1 },
      ],
    },
  });
  for (let cycle = 0; cycle < 200; cycle++) {
    store.begin("row-1");
    store.commit([stroke(`cycle-${cycle}-draw`)]);
    store.begin("row-1");
    store.commit([
      ...store.getRow("row-1").operations,
      stroke(`cycle-${cycle}-edit`),
    ]);
    store.clear();
  }
  expect(store.getCapacityState()).toMatchObject({ operations: 0, points: 0 });
  let commands = 0;
  const reachableInk = new Map<string, number>();
  while (store.getHistoryState().canUndo) {
    store.undo();
    commands++;
    for (const operation of store.getRow("row-1").operations) {
      if (operation.kind === "stroke")
        reachableInk.set(operation.stroke.id, operation.stroke.points.length);
    }
    if (commands > 100) throw new Error("History exceeded its release bound");
  }
  expect(commands).toBe(100);
  // Reachable snapshots cover recent cycles rather than all 400 old strokes.
  expect(reachableInk.size).toBeLessThanOrEqual(68);
  expect(
    [...reachableInk.values()].reduce((sum, points) => sum + points, 0),
  ).toBeLessThanOrEqual(136);
  store.begin("row-1");
  store.commit([...store.getRow("row-1").operations, stroke("new-edit")]);
  expect(store.getHistoryState().canRedo).toBe(false);
  store.reset();
  expect(store.getCapacityState()).toMatchObject({ operations: 0, points: 0 });
  expect(store.getHistoryState()).toMatchObject({
    canUndo: false,
    canRedo: false,
  });
});
