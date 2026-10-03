export type RowId = string;

export interface Point {
  x: number;
  y: number;
  pressure: number;
  t: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stroke {
  id: string;
  rowId: RowId;
  width: number;
  points: readonly Point[];
  bounds: Bounds;
}

export interface EraseMask {
  id: string;
  rowId: RowId;
  radius: number;
  points: readonly Point[];
}

export type InkOperation =
  | { kind: "stroke"; stroke: Stroke }
  | { kind: "pixel-mask"; mask: EraseMask };

export interface HistoryCommand {
  kind: "draw" | "erase-stroke" | "erase-pixel" | "clear";
  changes: readonly {
    rowId: RowId;
    before: readonly InkOperation[];
    after: readonly InkOperation[];
  }[];
}

export interface RowSnapshot {
  rowId: RowId;
  rowRevision: number;
  operations: readonly InkOperation[];
}

export type EditReason = HistoryCommand["kind"] | "undo" | "redo";

export interface DocumentEditEvent {
  phase: "begin" | "commit" | "cancel";
  reason: EditReason;
  epoch: number;
  rows: readonly RowSnapshot[];
}
