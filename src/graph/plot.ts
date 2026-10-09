import type { GraphEquation } from "./equation";

export interface GraphView {
  x: number;
  y: number;
  scale: number;
}
export type GraphPoint = { x: number; y: number };
export type Segment = readonly [GraphPoint, GraphPoint];
export const INITIAL_VIEW: GraphView = { x: 0, y: 0, scale: 40 };

export function toWorld(
  view: GraphView,
  width: number,
  height: number,
  px: number,
  py: number,
): GraphPoint {
  return {
    x: view.x + (px - width / 2) / view.scale,
    y: view.y - (py - height / 2) / view.scale,
  };
}
export function zoomView(
  view: GraphView,
  width: number,
  height: number,
  factor: number,
  px = width / 2,
  py = height / 2,
): GraphView {
  const anchor = toWorld(view, width, height, px, py);
  const scale = Math.max(4, Math.min(1600, view.scale * factor));
  return {
    x: anchor.x - (px - width / 2) / scale,
    y: anchor.y + (py - height / 2) / scale,
    scale,
  };
}

/** Sample visible curves only. A residual check rejects sign changes across poles. */
export function plotSegments(
  equation: GraphEquation,
  view: GraphView,
  width: number,
  height: number,
): Segment[] {
  const segments: Segment[] = [];
  if (width <= 0 || height <= 0) return segments;
  if (equation.explicit) {
    const { axis, evaluate } = equation.explicit;
    const extent = axis === "y" ? width : height;
    let previous: GraphPoint | null = null;
    for (let pixel = 0; pixel <= extent; pixel++) {
      const world = toWorld(
        view,
        width,
        height,
        axis === "y" ? pixel : 0,
        axis === "y" ? 0 : pixel,
      );
      const value = evaluate(world.x, world.y);
      const point =
        axis === "y" ? { x: world.x, y: value } : { x: value, y: world.y };
      if (!Number.isFinite(value)) {
        previous = null;
        continue;
      }
      if (previous) {
        const middle = {
          x: (point.x + previous.x) / 2,
          y: (point.y + previous.y) / 2,
        };
        const actual = evaluate(middle.x, middle.y);
        const interpolated = axis === "y" ? middle.y : middle.x;
        if (
          Number.isFinite(actual) &&
          Math.abs(actual - interpolated) * view.scale < 8
        )
          segments.push([previous, point]);
      }
      previous = point;
    }
    return segments;
  }
  // Marching squares at a fixed screen-space resolution bounds work during dragging.
  const columns = Math.ceil(width / 5),
    rows = Math.ceil(height / 5);
  const values = new Float64Array((columns + 1) * (rows + 1));
  const world = (column: number, row: number) =>
    toWorld(
      view,
      width,
      height,
      (column * width) / columns,
      (row * height) / rows,
    );
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const point = world(column, row);
      values[row * (columns + 1) + column] = equation.evaluate(
        point.x,
        point.y,
      );
    }
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const corners = [
        world(column, row),
        world(column + 1, row),
        world(column + 1, row + 1),
        world(column, row + 1),
      ];
      const samples = [
        values[row * (columns + 1) + column],
        values[row * (columns + 1) + column + 1],
        values[(row + 1) * (columns + 1) + column + 1],
        values[(row + 1) * (columns + 1) + column],
      ];
      if (!samples.every(Number.isFinite)) continue;
      const crossings: GraphPoint[] = [];
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4,
          a = samples[edge],
          b = samples[next];
        if (a > 0 === b > 0 || a === b) continue;
        let low = 0,
          high = 1,
          t = a / (a - b);
        const tolerance = Math.min(Math.abs(a), Math.abs(b)) * 0.1;
        // Refine curved edges rather than dropping them near a tangent. A pole
        // cannot pass by moving to the smaller-magnitude end of its bracket.
        for (let iteration = 0; iteration < 20; iteration++) {
          const point = {
            x: corners[edge].x + t * (corners[next].x - corners[edge].x),
            y: corners[edge].y + t * (corners[next].y - corners[edge].y),
          };
          const value = equation.evaluate(point.x, point.y);
          if (!Number.isFinite(value)) break;
          if (Math.abs(value) <= tolerance) {
            crossings.push(point);
            break;
          }
          if (value > 0 === a > 0) low = t;
          else high = t;
          t = (low + high) / 2;
        }
      }
      if (crossings.length === 2) segments.push([crossings[0], crossings[1]]);
      else if (crossings.length === 4) {
        const center = equation.evaluate(
          (corners[0].x + corners[2].x) / 2,
          (corners[0].y + corners[2].y) / 2,
        );
        if (center > 0 === samples[0] > 0)
          segments.push(
            [crossings[0], crossings[1]],
            [crossings[2], crossings[3]],
          );
        else
          segments.push(
            [crossings[0], crossings[3]],
            [crossings[1], crossings[2]],
          );
      }
    }
  return segments;
}
