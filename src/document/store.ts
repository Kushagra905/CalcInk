import { strokeBounds } from "../ink/geometry";
import { GROUPS, getRowConfig, PAGE } from "./rows";
import type {
  DocumentEditEvent,
  HistoryCommand,
  InkOperation,
  RowSnapshot,
} from "./types";

const EMPTY = Object.freeze([]) as readonly InkOperation[];

function freezeOperation(operation: InkOperation, rowId: string): InkOperation {
  if (
    !operation ||
    (operation.kind !== "stroke" && operation.kind !== "pixel-mask")
  )
    throw new RangeError("Invalid ink operation");
  const ink = operation.kind === "stroke" ? operation.stroke : operation.mask;
  const size =
    operation.kind === "stroke"
      ? operation.stroke.width
      : operation.mask.radius;
  getRowConfig(rowId);
  if (
    typeof ink.id !== "string" ||
    !ink.id ||
    ink.rowId !== rowId ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Array.isArray(ink.points) ||
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
        point.y < 0 ||
        point.y > PAGE.height ||
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
    const { color, style } = operation.stroke;
    if (
      (color !== undefined &&
        (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))) ||
      (style !== undefined && !["pen", "pencil", "highlighter"].includes(style))
    )
      throw new RangeError("Invalid stroke appearance");
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
        bounds: Object.freeze(strokeBounds(points, size, rowId)),
      }),
    });
  }
  return Object.freeze({
    kind: "pixel-mask",
    mask: Object.freeze({ ...operation.mask, points }),
  });
}

export function createDocumentStore(initialRows: readonly RowSnapshot[] = []) {
  let epoch = 0;
  const rows = new Map<string, RowSnapshot>(
    GROUPS.map((row) => [
      row.id,
      Object.freeze({ rowId: row.id, rowRevision: 0, operations: EMPTY }),
    ]),
  );
  const listeners = new Set<(event: DocumentEditEvent) => void>();
  let gesture: {
    rowIds: readonly string[];
    reason: "draw" | "erase-stroke" | "erase-pixel";
  } | null = null;
  const past: HistoryCommand[] = [];
  const future: HistoryCommand[] = [];

  // Validate restored ink using the same boundary as a live edit. History starts fresh.
  const restored = new Set<string>();
  const ids = new Set<string>();
  let operationCount = 0;
  let pointCount = 0;
  for (const snapshot of initialRows) {
    getRowConfig(snapshot.rowId);
    if (restored.has(snapshot.rowId))
      throw new RangeError("Duplicate saved row");
    restored.add(snapshot.rowId);
    const operations = Object.freeze(
      snapshot.operations.map((operation) => {
        const frozen = freezeOperation(operation, snapshot.rowId);
        const ink = frozen.kind === "stroke" ? frozen.stroke : frozen.mask;
        if (ids.has(ink.id)) throw new RangeError("Duplicate ink ID");
        ids.add(ink.id);
        operationCount++;
        pointCount += ink.points.length;
        return frozen;
      }),
    );
    rows.set(
      snapshot.rowId,
      Object.freeze({ rowId: snapshot.rowId, rowRevision: 1, operations }),
    );
  }
  if (operationCount > 1000 || pointCount > 200000)
    throw new RangeError("Page capacity reached");

  function remember(command: HistoryCommand) {
    if (!command.changes.length) return;
    past.push(
      Object.freeze({
        ...command,
        changes: Object.freeze(
          command.changes.map((change) => Object.freeze(change)),
        ),
      }),
    );
    if (past.length > 100) past.shift();
    future.length = 0;
  }

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
    getRows: () => Object.freeze(GROUPS.map((row) => getRow(row.id))),
    getCapacityState: () => {
      const operations = GROUPS.flatMap((row) => getRow(row.id).operations);
      const points = operations.reduce(
        (count, operation) =>
          count +
          (operation.kind === "stroke"
            ? operation.stroke.points.length
            : operation.mask.points.length),
        0,
      );
      return {
        operations: operations.length,
        points,
        full: operations.length >= 1000 || points >= 200000,
      };
    },
    getHistoryState: () => ({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      canClear:
        !!gesture || GROUPS.some((row) => getRow(row.id).operations.length > 0),
    }),
    subscribe(listener: (event: DocumentEditEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin(
      rowId: string | readonly string[],
      reason: "draw" | "erase-stroke" | "erase-pixel" = "draw",
    ) {
      if (gesture) throw new Error("A gesture is already active");
      const rowIds = typeof rowId === "string" ? [rowId] : [...new Set(rowId)];
      if (!rowIds.length) throw new RangeError("A gesture needs an ink group");
      for (const id of rowIds) getRow(id);
      gesture = { rowIds, reason };
      for (const id of rowIds) advance(id);
      emit("begin", reason, rowIds);
    },
    commit(operations: readonly InkOperation[]) {
      if (!gesture) throw new Error("No active gesture");
      if (gesture.rowIds.length !== 1)
        throw new Error("Use a page-wide commit for this gesture");
      this.commitRows(new Map([[gesture.rowIds[0], operations]]));
    },
    commitRows(updates: ReadonlyMap<string, readonly InkOperation[]>) {
      if (!gesture) throw new Error("No active gesture");
      const { rowIds, reason } = gesture;
      for (const id of updates.keys())
        if (!rowIds.includes(id))
          throw new RangeError("Ink group is outside the gesture");
      const replacements = new Map(
        rowIds.map((rowId) => [
          rowId,
          Object.freeze(
            (updates.get(rowId) ?? getRow(rowId).operations).map((operation) =>
              Object.isFrozen(operation) &&
              getRow(rowId).operations.includes(operation)
                ? operation
                : freezeOperation(operation, rowId),
            ),
          ),
        ]),
      );
      const all = GROUPS.flatMap(
        (row) => replacements.get(row.id) ?? getRow(row.id).operations,
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
      const changes = rowIds.flatMap((rowId) => {
        const before = getRow(rowId).operations;
        const after = replacements.get(rowId) ?? before;
        return before.length !== after.length ||
          after.some((operation, index) => operation !== before[index])
          ? [{ rowId, before, after }]
          : [];
      });
      remember({ kind: reason, changes });
      for (const rowId of rowIds) advance(rowId, replacements.get(rowId));
      gesture = null;
      emit("commit", reason, [...rowIds]);
    },
    cancel() {
      if (!gesture) return;
      const { rowIds, reason } = gesture;
      gesture = null;
      emit("cancel", reason, [...rowIds]);
    },
    clear() {
      this.cancel();
      epoch += 1;
      const changed = GROUPS.filter(
        (row) => getRow(row.id).operations.length,
      ).map((row) => row.id);
      remember({
        kind: "clear",
        changes: changed.map((rowId) => ({
          rowId,
          before: getRow(rowId).operations,
          after: EMPTY,
        })),
      });
      for (const rowId of changed) advance(rowId, EMPTY);
      emit("commit", "clear" satisfies HistoryCommand["kind"], changed);
    },
    undo() {
      this.cancel();
      const command = past.pop();
      if (!command) return;
      for (const change of command.changes)
        advance(change.rowId, change.before);
      future.push(command);
      emit(
        "commit",
        "undo",
        command.changes.map((change) => change.rowId),
      );
    },
    redo() {
      this.cancel();
      const command = future.pop();
      if (!command) return;
      for (const change of command.changes) advance(change.rowId, change.after);
      past.push(command);
      emit(
        "commit",
        "redo",
        command.changes.map((change) => change.rowId),
      );
    },
    // Development collection boundary: old prompts/held-out ink must not return through Undo.
    reset(rowId?: string) {
      if (rowId) getRow(rowId);
      this.cancel();
      past.length = future.length = 0;
      if (!rowId) epoch += 1;
      const changed = GROUPS.filter(
        (row) =>
          (!rowId || row.id === rowId) && getRow(row.id).operations.length,
      ).map((row) => row.id);
      for (const id of changed) advance(id, EMPTY);
      emit("commit", "clear", changed);
    },
  };
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
