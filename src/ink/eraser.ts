import { getRowConfig, PAGE } from "../document/rows";
import type { EraseMask, InkOperation, Point, Stroke } from "../document/types";
import { flattenPath, segmentDistance } from "./geometry";
import { drawPath, type InkContext, replayInk } from "./replay";

export type InkTool = "draw" | "erase-stroke" | "erase-pixel";
const flattened = new WeakMap<Stroke, ReturnType<typeof flattenPath>>();

export function hitVisibleStroke(
  context: InkContext,
  operations: readonly InkOperation[],
  index: number,
  from: Point,
  to: Point,
  radius: number,
): boolean {
  const operation = operations[index];
  if (operation.kind !== "stroke") return false;
  const stroke = operation.stroke;
  getRowConfig(stroke.rowId);
  const bounds = stroke.bounds;
  const left = Math.max(
    0,
    Math.floor(Math.max(bounds.x - 1, Math.min(from.x, to.x) - radius - 1)),
  );
  const right = Math.min(
    PAGE.width,
    Math.ceil(
      Math.min(
        bounds.x + bounds.width + 1,
        Math.max(from.x, to.x) + radius + 1,
      ),
    ),
  );
  const top = Math.max(
    0,
    Math.floor(Math.max(bounds.y - 1, Math.min(from.y, to.y) - radius - 1)),
  );
  const bottom = Math.min(
    PAGE.height,
    Math.ceil(
      Math.min(
        bounds.y + bounds.height + 1,
        Math.max(from.y, to.y) + radius + 1,
      ),
    ),
  );
  if (left >= right || top >= bottom) return false;
  let path = flattened.get(stroke);
  if (!path) {
    path = flattenPath(stroke.points);
    flattened.set(stroke, path);
  }
  if (
    !path.some(
      (point, i) =>
        segmentDistance(from, to, i ? path[i - 1] : point, point) <=
        radius + stroke.width / 2 + 0.25,
    )
  )
    return false;
  context.canvas.width = right - left;
  context.canvas.height = bottom - top;
  context.translate(-left, -top);
  replayInk(context, [operation], "white");
  // Only later masks remove this stroke; later pen strokes do not undo those masks.
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = context.strokeStyle = "white";
  for (let next = index + 1; next < operations.length; next++) {
    const mask = operations[next];
    if (mask.kind === "pixel-mask")
      drawPath(context, mask.mask.points, mask.mask.radius * 2);
  }
  context.globalCompositeOperation = "destination-in";
  drawPath(context, from === to ? [from] : [from, to], radius * 2);
  return context
    .getImageData(0, 0, right - left, bottom - top)
    .data.some((alpha, i) => i % 4 === 3 && alpha > 0);
}

export function maskTouchesInk(
  context: InkContext,
  operations: readonly InkOperation[],
  mask: EraseMask,
): boolean {
  getRowConfig(mask.rowId);
  context.canvas.width = PAGE.width;
  context.canvas.height = PAGE.height;
  replayInk(context, operations, "white");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = context.strokeStyle = "white";
  drawPath(context, mask.points, mask.radius * 2);
  return context
    .getImageData(0, 0, PAGE.width, PAGE.height)
    .data.some((alpha, i) => i % 4 === 3 && alpha > 0);
}
