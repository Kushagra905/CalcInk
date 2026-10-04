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

type XY = Pick<Point, "x" | "y">;

export function pointSegmentDistance(point: XY, from: XY, to: XY): number {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) /
              (dx * dx + dy * dy),
          ),
        )
      : 0;
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

export function segmentDistance(a: XY, b: XY, c: XY, d: XY): number {
  const cross = (p: XY, q: XY, r: XY) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) &&
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0
  )
    return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/** Flatten the same quadratic path as drawPath, within 0.25 logical units. */
export function flattenPath(points: readonly Point[]): readonly XY[] {
  if (!points.length) return [];
  const output: XY[] = [points[0]];
  const middle = (a: XY, b: XY): XY => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  function curve(a: XY, control: XY, b: XY, depth = 0) {
    if (depth === 12 || pointSegmentDistance(control, a, b) <= 0.25) {
      output.push(b);
      return;
    }
    const left = middle(a, control),
      right = middle(control, b),
      center = middle(left, right);
    curve(a, left, center, depth + 1);
    curve(center, right, b, depth + 1);
  }
  let start: XY = points[0];
  for (let index = 1; index < points.length - 1; index++) {
    const end = middle(points[index], points[index + 1]);
    curve(start, points[index], end);
    start = end;
  }
  if (points.length > 1) output.push(points[points.length - 1]);
  return output;
}
