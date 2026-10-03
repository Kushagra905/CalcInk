import { getRowConfig, PAGE } from "../document/rows";
import type { Bounds, Point } from "../document/types";

export function clientToPage(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
) {
  if (rect.width <= 0 || rect.height <= 0)
    throw new RangeError("Canvas has no visible size");
  return {
    x: ((clientX - rect.left) * PAGE.width) / rect.width,
    y: ((clientY - rect.top) * PAGE.height) / rect.height,
  };
}

export function strokeBounds(
  points: readonly Point[],
  width: number,
  rowId: string,
): Bounds {
  if (!points.length) throw new RangeError("A stroke needs a point");
  let left = points[0].x;
  let right = left;
  let top = points[0].y;
  let bottom = top;
  function include(point: Pick<Point, "x" | "y">) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  let start = points[0];
  for (let index = 1; index < points.length - 1; index++) {
    const control = points[index];
    const next = points[index + 1];
    const end = {
      ...control,
      x: (control.x + next.x) / 2,
      y: (control.y + next.y) / 2,
    };
    include(end);
    for (const axis of ["x", "y"] as const) {
      const denominator = start[axis] - 2 * control[axis] + end[axis];
      const t =
        denominator === 0 ? -1 : (start[axis] - control[axis]) / denominator;
      if (t > 0 && t < 1)
        include({
          x:
            (1 - t) ** 2 * start.x +
            2 * (1 - t) * t * control.x +
            t ** 2 * end.x,
          y:
            (1 - t) ** 2 * start.y +
            2 * (1 - t) * t * control.y +
            t ** 2 * end.y,
        });
    }
    start = end;
  }
  include(points[points.length - 1]);
  const row = getRowConfig(rowId);
  left = Math.max(0, left - width / 2);
  right = Math.min(PAGE.width, right + width / 2);
  top = Math.max(row.top, top - width / 2);
  bottom = Math.min(row.top + row.writingHeight, bottom + width / 2);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
