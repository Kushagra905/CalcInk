export type RowId = string;

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly t: number;
}

export interface Stroke {
  readonly id: string;
  readonly rowId: RowId;
  readonly width: number;
  readonly points: readonly Point[];
  readonly bounds: Bounds;
}

export interface EraseMask {
  readonly id: string;
  readonly rowId: RowId;
  readonly radius: number;
  readonly points: readonly Point[];
}

export type InkOperation =
  | {
      readonly kind: "stroke";
      readonly stroke: Stroke;
    }
  | {
      readonly kind: "pixel-mask";
      readonly mask: EraseMask;
    };

export interface HistoryCommand {
  readonly kind: "draw" | "erase-stroke" | "erase-pixel" | "clear";

  readonly changes: readonly {
    readonly rowId: RowId;
    readonly before: readonly InkOperation[];
    readonly after: readonly InkOperation[];
  }[];
}

export interface RowSnapshot {
  readonly rowId: RowId;
  readonly rowRevision: number;
  readonly operations: readonly InkOperation[];
}

export type EditReason = HistoryCommand["kind"] | "undo" | "redo";

export interface DocumentEditEvent {
  readonly phase: "begin" | "commit" | "cancel";
  readonly reason: EditReason;
  readonly epoch: number;
  readonly rows: readonly RowSnapshot[];
}
