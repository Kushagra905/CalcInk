import { getRowConfig, PAGE } from "../document/rows";
import type { RecognitionResponse } from "../recognition/protocol";

const FAMILY = "Georgia, serif";

export function answerLayout(
  result: RecognitionResponse,
  measure: (text: string, fontSize: number) => number,
) {
  const text =
    result.outcome.kind === "answer"
      ? result.outcome.value
      : result.outcome.kind === "undefined"
        ? "Undefined"
        : null;
  if (text === null || !result.visibleInkBounds) return null;
  const x = result.visibleInkBounds.x + result.visibleInkBounds.width + 12;
  for (let fontSize = 32; fontSize >= 16; fontSize--) {
    if (x + measure(text, fontSize) <= PAGE.width - 12)
      return { text, x, y: getRowConfig(result.rowId).baseline, fontSize };
  }
  return null;
}

export function measureAnswer(
  context: CanvasRenderingContext2D,
  result: RecognitionResponse,
) {
  context.save();
  const layout = answerLayout(result, (text, size) => {
    context.font = `${size}px ${FAMILY}`;
    return context.measureText(text).width;
  });
  context.restore();
  return layout;
}

export function drawAnswer(
  context: CanvasRenderingContext2D,
  result: RecognitionResponse,
) {
  const layout = measureAnswer(context, result);
  if (!layout) return;
  const row = getRowConfig(result.rowId);
  context.save();
  context.beginPath();
  context.rect(0, row.top, PAGE.width, row.writingHeight);
  context.clip();
  context.font = `${layout.fontSize}px ${FAMILY}`;
  context.fillStyle = "#2f7760";
  context.textBaseline = "alphabetic";
  context.fillText(layout.text, layout.x, layout.y);
  context.restore();
}

export function resultStatus(
  result: RecognitionResponse,
  fits: boolean,
): string {
  if (!result.visibleInkBounds && !result.transcript)
    return "Write an expression";
  switch (result.outcome.kind) {
    case "answer":
    case "undefined":
      return fits ? "Ready" : "Leave room after =";
    case "incomplete":
      return "Keep writing; finish with =";
    case "invalid":
      return "Check writing";
    case "unrecognized":
      return "Could not read this; rewrite clearly";
  }
}
