import { describe, expect, it } from "vitest";
import {
  flattenPath,
  pointSegmentDistance,
  segmentDistance,
} from "../../src/ink/geometry";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import {
  answerGlyphs,
  answerLayout,
  resultStatus,
} from "../../src/rendering/results";

const result: RecognitionResponse = {
  epoch: 0,
  rowId: "row-2",
  rowRevision: 2,
  requestId: 1,
  modelId: "test",
  transcript: "4/0=",
  outcome: { kind: "undefined", code: "DIVISION_BY_ZERO" },
  visibleInkBounds: { x: 100, y: 200, width: 500, height: 30 },
  timing: { preprocessMs: 0, inferenceMs: 0, evaluateMs: 0 },
};

describe("result placement and swept geometry", () => {
  it("aligns proportional digits in equal cells without padding decimal punctuation", () => {
    const widths = (glyph: string) =>
      glyph === "1" ? 4 : glyph === "." || glyph === "-" ? 3 : 8;
    const cells = answerGlyphs("-11.8", widths);
    expect(cells.map(({ x }) => x)).toEqual([0, 3, 11, 19, 22]);
    expect(cells.map(({ advance }) => advance)).toEqual([3, 8, 8, 3, 8]);
    expect(cells[1].offset).toBe(2);
    expect(cells[4].offset).toBe(0);
    const width = (text: string) =>
      answerGlyphs(text, widths).reduce((sum, cell) => sum + cell.advance, 0);
    expect(width("111.11")).toBe(width("888.88"));
  });
  it("anchors beside the actual ink bounds and shrinks only down to 16", () => {
    const layout = answerLayout(result, (_, size) => size * 20);
    expect(layout).toEqual({ text: "Undefined", x: 612, y: 223, fontSize: 16 });
    expect(answerLayout(result, (_, size) => size * 22)).toBeNull();
    expect(resultStatus(result, false)).toBe("Leave room after =");
    expect(
      answerLayout({ ...result, visibleInkBounds: null }, () => 1),
    ).toBeNull();
    expect(
      answerLayout({ ...result, outcome: { kind: "incomplete" } }, () => 1),
    ).toBeNull();
  });
  it("matches the handwriting height and centers actual font ink beside it", () => {
    const response = {
      ...result,
      outcome: { kind: "answer" as const, value: "5" },
    };
    const layout = answerLayout(
      response,
      (_, size) => size / 2,
      (_, size) => ({ ascent: size * 0.6, descent: size * 0.15 }),
    );
    expect(layout).toEqual({ text: "5", x: 612, y: 224, fontSize: 40 });
    const tall = answerLayout(
      {
        ...response,
        visibleInkBounds: { x: 100, y: 200, width: 500, height: 60 },
      },
      (_, size) => size / 2,
      (_, size) => ({ ascent: size * 0.6, descent: size * 0.15 }),
    );
    expect(tall?.fontSize).toBe(80);
  });
  it("distinguishes crossed, tangent, parallel and degenerate segments", () => {
    const xy = (x: number, y: number) => ({ x, y });
    expect(segmentDistance(xy(0, 0), xy(100, 0), xy(50, -20), xy(50, 20))).toBe(
      0,
    );
    expect(segmentDistance(xy(0, 0), xy(10, 0), xy(20, 0), xy(30, 0))).toBe(10);
    expect(segmentDistance(xy(0, 0), xy(100, 0), xy(50, 5), xy(50, 5))).toBe(5);
    expect(pointSegmentDistance(xy(3, 4), xy(0, 0), xy(0, 0))).toBe(5);
  });
  it("flattens the rendered quadratic instead of hit-testing its distant control point", () => {
    const points = [
      { x: 100, y: 80, pressure: 0.5, t: 0 },
      { x: 500, y: 0, pressure: 0.5, t: 1 },
      { x: 100, y: 80, pressure: 0.5, t: 2 },
    ];
    const flat = flattenPath(points);
    expect(flat.length).toBeGreaterThan(3);
    expect(Math.max(...flat.map((point) => point.x))).toBeLessThan(400);
    expect(flat[0]).toBe(points[0]);
    expect(flat[flat.length - 1]).toBe(points[2]);
  });
});
