import { getRowConfig, PAGE } from "../document/rows";
import type { InkOperation, Point } from "../document/types";

type InkContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// ponytail: straight segments for Phase 0 capture; add shared quadratic curves in Phase 2.
export function drawPath(
  context: InkContext,
  points: readonly Point[],
  diameter: number,
) {
  if (!points.length) return;
  context.lineWidth = diameter;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, diameter / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1)
    context.lineTo(points[index].x, points[index].y);
  context.stroke();
}

export function replayRow(
  context: InkContext,
  rowId: string,
  operations: readonly InkOperation[],
) {
  const row = getRowConfig(rowId);
  context.save();
  context.beginPath();
  context.rect(0, row.top, PAGE.width, row.writingHeight);
  context.clip();
  context.fillStyle = context.strokeStyle = "#273832";
  for (const operation of operations) {
    context.globalCompositeOperation =
      operation.kind === "stroke" ? "source-over" : "destination-out";
    if (operation.kind === "stroke")
      drawPath(context, operation.stroke.points, operation.stroke.width);
    else drawPath(context, operation.mask.points, operation.mask.radius * 2);
  }
  context.restore();
}
