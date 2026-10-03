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
  for (const point of points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  const row = getRowConfig(rowId);
  left = Math.max(0, left - width / 2);
  right = Math.min(PAGE.width, right + width / 2);
  top = Math.max(row.top, top - width / 2);
  bottom = Math.min(row.top + row.writingHeight, bottom + width / 2);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
