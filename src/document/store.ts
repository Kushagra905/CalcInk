import { getRowConfig, PAGE, ROWS } from "./rows";
import type {
  DocumentEditEvent,
  HistoryCommand,
  InkOperation,
  RowSnapshot,
} from "./types";

const EMPTY = Object.freeze([]) as readonly InkOperation[];

function freezeOperation(operation: InkOperation, rowId: string): InkOperation {
  const ink = operation.kind === "stroke" ? operation.stroke : operation.mask;
  const size =
    operation.kind === "stroke"
      ? operation.stroke.width
      : operation.mask.radius;
  const row = getRowConfig(rowId);
  if (
    !ink.id ||
    ink.rowId !== rowId ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !ink.points.length
  ) {
    throw new RangeError("Invalid ink operation");
  }
  const points = Object.freeze(
    ink.points.map((point) => {
      if (
        ![point.x, point.y, point.pressure, point.t].every(Number.isFinite) ||
        point.x < 0 ||
        point.x > PAGE.width ||
        point.y < row.top ||
        point.y > row.top + row.writingHeight ||
        point.pressure < 0 ||
        point.pressure > 1 ||
        point.t < 0
      ) {
        throw new RangeError("Invalid ink point");
      }
      return Object.freeze({ ...point });
    }),
  );
  if (operation.kind === "stroke") {
    const bounds = operation.stroke.bounds;
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(
        Number.isFinite,
      ) ||
      bounds.width < 0 ||
      bounds.height < 0
    ) {
      throw new RangeError("Invalid stroke bounds");
    }
    return Object.freeze({
      kind: "stroke",
      stroke: Object.freeze({
        ...operation.stroke,
        points,
        bounds: Object.freeze({ ...bounds }),
      }),
    });
  }
  return Object.freeze({
    kind: "pixel-mask",
    mask: Object.freeze({ ...operation.mask, points }),
  });
}

export function createDocumentStore() {
  let epoch = 0;
  const rows = new Map<string, RowSnapshot>(
    ROWS.map((row) => [
      row.id,
      Object.freeze({ rowId: row.id, rowRevision: 0, operations: EMPTY }),
    ]),
  );
  const listeners = new Set<(event: DocumentEditEvent) => void>();
  let gesture: {
    rowId: string;
    reason: "draw" | "erase-stroke" | "erase-pixel";
  } | null = null;

  function getRow(rowId: string) {
    const row = rows.get(rowId);
    if (!row) throw new RangeError(`Unknown row: ${rowId}`);
    return row;
  }

  function advance(rowId: string, operations = getRow(rowId).operations) {
    rows.set(
      rowId,
      Object.freeze({
        rowId,
        rowRevision: getRow(rowId).rowRevision + 1,
        operations,
      }),
    );
  }

  function emit(
    phase: DocumentEditEvent["phase"],
    reason: DocumentEditEvent["reason"],
    rowIds: string[],
  ) {
    const event = Object.freeze({
      phase,
      reason,
      epoch,
      rows: Object.freeze(rowIds.map(getRow)),
    });
    for (const listener of listeners) listener(event);
  }

  return {
    getEpoch: () => epoch,
    getRow,
    getRows: () => Object.freeze(ROWS.map((row) => getRow(row.id))),
    subscribe(listener: (event: DocumentEditEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin(
      rowId: string,
      reason: "draw" | "erase-stroke" | "erase-pixel" = "draw",
    ) {
      if (gesture) throw new Error("A gesture is already active");
      getRow(rowId);
      gesture = { rowId, reason };
      advance(rowId);
      emit("begin", reason, [rowId]);
    },
    commit(operations: readonly InkOperation[]) {
      if (!gesture) throw new Error("No active gesture");
      const { rowId, reason } = gesture;
      const frozen = Object.freeze(
        operations.map((operation) =>
          Object.isFrozen(operation) &&
          getRow(rowId).operations.includes(operation)
            ? operation
            : freezeOperation(operation, rowId),
        ),
      );
      const all = ROWS.flatMap((row) =>
        row.id === rowId ? frozen : getRow(row.id).operations,
      );
      const ids = all.map((operation) =>
        operation.kind === "stroke" ? operation.stroke.id : operation.mask.id,
      );
      if (new Set(ids).size !== ids.length)
        throw new RangeError("Duplicate ink ID");
      const pointCount = all.reduce(
        (count, operation) =>
          count +
          (operation.kind === "stroke"
            ? operation.stroke.points.length
            : operation.mask.points.length),
        0,
      );
      if (all.length > 1000 || pointCount > 200000)
        throw new RangeError("Page capacity reached");
      advance(rowId, frozen);
      gesture = null;
      emit("commit", reason, [rowId]);
    },
    cancel() {
      if (!gesture) return;
      const { rowId, reason } = gesture;
      gesture = null;
      emit("cancel", reason, [rowId]);
    },
    // Phase 0 fixture reset. User-facing undoable clear belongs to Phase 2 history.
    clear() {
      this.cancel();
      epoch += 1;
      const changed = ROWS.filter(
        (row) => getRow(row.id).operations.length,
      ).map((row) => row.id);
      for (const rowId of changed) advance(rowId, EMPTY);
      emit("commit", "clear" satisfies HistoryCommand["kind"], changed);
    },
  };
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
