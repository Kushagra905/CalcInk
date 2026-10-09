import { PAGE, ROW_HEIGHT } from "../document/rows";
import type { Bounds, Point, RowSnapshot } from "../document/types";
import { isWritingStroke } from "./replay";

export function groupBounds(row: RowSnapshot): Bounds | null {
  const strokes = row.operations.filter(isWritingStroke);
  if (!strokes.length) return null;
  const left = Math.min(...strokes.map(({ stroke }) => stroke.bounds.x));
  const top = Math.min(...strokes.map(({ stroke }) => stroke.bounds.y));
  const right = Math.max(
    ...strokes.map(({ stroke }) => stroke.bounds.x + stroke.bounds.width),
  );
  const bottom = Math.max(
    ...strokes.map(({ stroke }) => stroke.bounds.y + stroke.bounds.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Group a new stroke by nearby writing, never by a clipping rectangle. */
export function writingGroup(
  rows: readonly RowSnapshot[],
  point: Pick<Point, "x" | "y">,
): string {
  const existing = rows
    .flatMap((row) => {
      const bounds = groupBounds(row);
      if (!bounds) return [];
      const gap = Math.max(
        bounds.y - point.y,
        point.y - bounds.y - bounds.height,
        0,
      );
      const tolerance = Math.max(12, Math.min(28, bounds.height * 0.3));
      // A raised exponent belongs to its base when it starts just above/right
      // of that expression, even when it is outside the normal line tolerance.
      const right = bounds.x + bounds.width;
      const superscript =
        point.y < bounds.y &&
        point.x >= right - 8 &&
        point.x <= right + Math.max(16, Math.min(80, bounds.height)) &&
        gap <= Math.max(16, Math.min(48, bounds.height * 0.8));
      return gap <= tolerance || superscript
        ? [
            {
              id: row.rowId,
              score: gap * 4 + Math.abs(point.y - bounds.y - bounds.height / 2),
            },
          ]
        : [];
    })
    .sort((a, b) => a.score - b.score);
  if (existing.length) return existing[0].id;
  // Keep old capture identities when a previously blank page is first written.
  const preferred = `row-${Math.min(8, Math.floor(Math.min(PAGE.height - 1, point.y) / ROW_HEIGHT) + 1)}`;
  const free = rows.filter((row) => !groupBounds(row));
  const row = free.find((row) => row.rowId === preferred) ?? free[0];
  if (!row)
    throw new RangeError(
      "This page has 32 separate writing groups. Add a page to keep writing.",
    );
  return row.rowId;
}
