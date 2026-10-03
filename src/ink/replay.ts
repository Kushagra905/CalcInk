import type { InkOperation, Point } from "../document/types";

export type InkContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function paintPath(context: InkContext, points: readonly Point[], width: number): void {
  if (!points.length) return;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}

/** Shared by the capture lab and worker; caller sets transform and row clipping. */
export function replayInk(context: InkContext, operations: readonly InkOperation[], color = "#111827"): void {
  context.save();
  context.fillStyle = color;
  context.strokeStyle = color;
  for (const operation of operations) {
    context.globalCompositeOperation = operation.kind === "stroke" ? "source-over" : "destination-out";
    paintPath(
      context,
      operation.kind === "stroke" ? operation.stroke.points : operation.mask.points,
      operation.kind === "stroke" ? operation.stroke.width : operation.mask.radius * 2,
    );
  }
  context.restore();
}
