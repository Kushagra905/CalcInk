import { PAGE } from "../document/rows";
import { describeOutcome } from "../math/status";
import type { RecognitionResponse } from "../recognition/protocol";

const FAMILY = '"Comic Sans MS", "Comic Sans", "Inter", sans-serif';

// Canvas has no font-variant-numeric setting. Give answer digits equal advances
// explicitly, using the same cells for collision measurement and painting.
export function answerGlyphs(text: string, measure: (glyph: string) => number) {
  const digitWidth = Math.max(...Array.from("0123456789", measure));
  let x = 0;
  return Array.from(text, (glyph) => {
    const width = measure(glyph);
    const advance = /^[0-9]$/.test(glyph) ? digitWidth : width;
    const cell = { glyph, x, offset: (advance - width) / 2, advance };
    x += advance;
    return cell;
  });
}

export function answerLayout(
  result: RecognitionResponse,
  measure: (text: string, fontSize: number) => number,
  measureInk: (
    text: string,
    fontSize: number,
  ) => { ascent: number; descent: number } = (_, size) => ({
    ascent: size,
    descent: 0,
  }),
) {
  const text =
    result.outcome.kind === "answer"
      ? result.outcome.value
      : result.outcome.kind === "undefined"
        ? "Undefined"
        : null;
  if (text === null || !result.visibleInkBounds) return null;
  const bounds = result.visibleInkBounds;
  const x = bounds.x + bounds.width + 12;
  const reference = measureInk(text, 100);
  const preferredSize = Math.max(
    16,
    Math.min(
      128,
      Math.round(
        (bounds.height * 100) /
          Math.max(1, reference.ascent + reference.descent),
      ),
    ),
  );
  for (let fontSize = preferredSize; fontSize >= 16; fontSize--) {
    if (x + measure(text, fontSize) <= PAGE.width - 12) {
      const { ascent, descent } = measureInk(text, fontSize);
      return {
        text,
        x,
        y: Math.min(
          PAGE.height - 4 - descent,
          Math.max(
            ascent + 4,
            bounds.y + bounds.height / 2 + (ascent - descent) / 2,
          ),
        ),
        fontSize,
      };
    }
  }
  return null;
}

export function measureAnswer(
  context: CanvasRenderingContext2D,
  result: RecognitionResponse,
) {
  context.save();
  const layout = answerLayout(
    result,
    (text, size) => {
      context.font = `400 ${size}px ${FAMILY}`;
      return result.outcome.kind === "answer"
        ? answerGlyphs(
            text,
            (glyph) => context.measureText(glyph).width,
          ).reduce((width, cell) => width + cell.advance, 0)
        : context.measureText(text).width;
    },
    (text, size) => {
      context.font = `400 ${size}px ${FAMILY}`;
      const metrics = context.measureText(text);
      return {
        ascent: metrics.actualBoundingBoxAscent,
        descent: metrics.actualBoundingBoxDescent,
      };
    },
  );
  context.restore();
  return layout;
}

export function drawAnswer(
  context: CanvasRenderingContext2D,
  result: RecognitionResponse,
) {
  const layout = measureAnswer(context, result);
  if (!layout) return;
  context.save();
  context.beginPath();
  context.rect(0, 0, PAGE.width, PAGE.height);
  context.clip();
  context.font = `400 ${layout.fontSize}px ${FAMILY}`;
  context.fillStyle =
    result.outcome.kind === "undefined" ? "#8b4028" : "#35634d";
  context.textBaseline = "alphabetic";
  if (result.outcome.kind === "answer") {
    for (const cell of answerGlyphs(
      layout.text,
      (glyph) => context.measureText(glyph).width,
    ))
      context.fillText(cell.glyph, layout.x + cell.x + cell.offset, layout.y);
  } else context.fillText(layout.text, layout.x, layout.y);
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
      return result.outcome.code === "EXPONENT_TOO_LARGE" ||
        result.outcome.code === "RESULT_TOO_LARGE"
        ? describeOutcome(result.outcome)
        : "Invalid expression";
    case "unrecognized":
      return "Could not read this; rewrite clearly";
  }
}
