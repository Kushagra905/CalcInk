import type { InkOperation, PenStyle, Point } from "../document/types";

export type InkContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function strokeOpacity(style: PenStyle = "pen"): number {
  return style === "pencil" ? 0.58 : style === "highlighter" ? 0.28 : 1;
}

export function isWritingStroke(
  operation: InkOperation,
): operation is Extract<InkOperation, { kind: "stroke" }> {
  return (
    operation.kind === "stroke" && operation.stroke.style !== "highlighter"
  );
}

export function drawPath(
  context: InkContext,
  points: readonly Point[],
  width: number,
  from = 1,
  finish = true,
): void {
  if (!points.length) return;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (points.length === 1) {
    if (!finish) return;
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  const start =
    from <= 1
      ? points[0]
      : {
          x: (points[from - 1].x + points[from].x) / 2,
          y: (points[from - 1].y + points[from].y) / 2,
        };
  context.moveTo(start.x, start.y);
  for (let index = from; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }
  if (finish) {
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
  }
  context.stroke();
}

/** Shared by the capture lab and worker; caller sets transform and row clipping. */
export function replayInk(
  context: InkContext,
  operations: readonly InkOperation[],
  color?: string,
  mode: "display" | "recognition" = "display",
): void {
  context.save();
  for (const operation of operations) {
    if (
      mode === "recognition" &&
      operation.kind === "stroke" &&
      !isWritingStroke(operation)
    )
      continue;
    context.globalAlpha =
      operation.kind === "stroke" && mode === "display"
        ? strokeOpacity(operation.stroke.style)
        : 1;
    context.fillStyle = context.strokeStyle =
      color ??
      (operation.kind === "stroke" ? operation.stroke.color : undefined) ??
      "#30352f";
    context.globalCompositeOperation =
      operation.kind === "stroke" ? "source-over" : "destination-out";
    drawPath(
      context,
      operation.kind === "stroke"
        ? operation.stroke.points
        : operation.mask.points,
      operation.kind === "stroke"
        ? operation.stroke.width
        : operation.mask.radius * 2,
    );
  }
  context.restore();
}
