import { describe, expect, it } from "vitest";
import {
  flattenPath,
  pointSegmentDistance,
  segmentDistance,
} from "../../src/ink/geometry";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import { answerLayout, resultStatus } from "../../src/rendering/results";

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
  it("anchors to surviving ink, uses the row baseline and shrinks only down to 16", () => {
    const layout = answerLayout(result, (_, size) => size * 20);
    expect(layout).toEqual({ text: "Undefined", x: 612, y: 264, fontSize: 16 });
    expect(answerLayout(result, (_, size) => size * 22)).toBeNull();
    expect(resultStatus(result, false)).toBe("Leave room after =");
    expect(
      answerLayout({ ...result, visibleInkBounds: null }, () => 1),
    ).toBeNull();
    expect(
      answerLayout({ ...result, outcome: { kind: "incomplete" } }, () => 1),
    ).toBeNull();
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
