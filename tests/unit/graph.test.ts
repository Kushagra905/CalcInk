import { expect, it } from "vitest";
import { compileEquation } from "../../src/graph/equation";
import {
  INITIAL_VIEW,
  plotSegments,
  toWorld,
  zoomView,
} from "../../src/graph/plot";
import { clientToPage } from "../../src/ink/geometry";

it.each([
  ["y=2x+1", 3, 7],
  ["y=-x^2", 3, -9],
  ["y=2^-2", 3, 0.25],
  ["y=2^3^2", 0, 512],
  ["y=2(x+1)", 3, 8],
  ["y=x²+2x", 3, 15],
  ["y=sin(pi/2)+cos(0)", 0, 2],
  ["y=sqrt(x)+abs(-2)", 9, 5],
  ["y=log(100)+ln(e)", 0, 3],
  ["y=\\frac{x+1}{2}", 3, 2],
  ["$y = x^{2}$", 3, 9],
  ["y=1e-2*x", 100, 1],
])("parses %s with correct precedence and notation", (text, x, y) => {
  const equation = compileEquation(text);
  expect(equation.evaluate(x, y)).toBeCloseTo(0, 10);
  expect(equation.explicit?.axis).toBe("y");
});

it("handles two-variable implicit and vertical equations", () => {
  expect(compileEquation("x²+y²=9").evaluate(0, 3)).toBe(0);
  expect(compileEquation("2xy=6").evaluate(1, 3)).toBe(0);
  expect(compileEquation("x=y^2").explicit?.axis).toBe("x");
  expect(compileEquation("y=x+y").explicit).toBeUndefined();
});

it.each([
  "y=",
  "x^2",
  "x=y=2",
  "y=foo(x)",
  "y=window.alert(1)",
  "y=constructor(x)",
  "y=\\unknown{x}",
  "y=(x+1",
  "y=1e999",
  "y=1..2",
  "y=2.3.4",
  "y=1 2",
  "y=sin",
  "y=x;alert(1)",
])("rejects malformed or executable text: %s", (text) => {
  expect(() => compileEquation(text)).toThrow();
});
it("bounds parsing work without evaluating arbitrary text", () => {
  expect(() => compileEquation(`y=${"x".repeat(513)}`)).toThrow("512");
  expect(() =>
    compileEquation(`y=${"(".repeat(33)}x${")".repeat(33)}`),
  ).toThrow("32");
  expect(() => compileEquation(`y=${Array(80).fill("x").join("+")}`)).toThrow(
    "128 tokens",
  );
});
it.each([640, 1058, 1047, 353])(
  "plots a closed implicit circle at width %i",
  (width) => {
    const equation = compileEquation("x^2+y^2=9");
    const segments = plotSegments(equation, INITIAL_VIEW, width, 418);
    expect(segments.length).toBeGreaterThan(100);
    for (const point of segments.flat())
      expect(Math.abs(equation.evaluate(point.x, point.y))).toBeLessThan(0.03);
    const points = segments.flat();
    const length = segments.reduce(
      (total, [a, b]) => total + Math.hypot(a.x - b.x, a.y - b.y),
      0,
    );
    expect(length).toBeGreaterThan(18.8);
    expect(length).toBeLessThan(18.9);
    const endpoints = new Map<string, number>();
    for (const point of points) {
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
      endpoints.set(key, (endpoints.get(key) ?? 0) + 1);
    }
    expect([...endpoints.values()].every((count) => count % 2 === 0)).toBe(
      true,
    );
    for (const axis of ["x", "y"] as const) {
      expect(Math.max(...points.map((p) => p[axis]))).toBeCloseTo(3, 1);
      expect(Math.min(...points.map((p) => p[axis]))).toBeCloseTo(-3, 1);
    }
  },
);
it("does not draw false connections across explicit or implicit poles", () => {
  const segments = plotSegments(
    compileEquation("y=1/x"),
    INITIAL_VIEW,
    640,
    420,
  );
  expect(segments.length).toBeGreaterThan(100);
  expect(segments.every(([a, b]) => a.x * b.x > 0)).toBe(true);
  expect(
    plotSegments(compileEquation("1/(x-0.03)=0"), INITIAL_VIEW, 640, 420),
  ).toEqual([]);
  expect(
    plotSegments(compileEquation("1e-12/(x-0.001)=0"), INITIAL_VIEW, 640, 420),
  ).toEqual([]);
  expect(
    plotSegments(compileEquation("y=sqrt(x)"), INITIAL_VIEW, 640, 420).every(
      ([a, b]) => a.x >= 0 && b.x >= 0,
    ),
  ).toBe(true);
});
it("keeps zoom anchored at the cursor and clamps the zoom range", () => {
  const before = toWorld(INITIAL_VIEW, 640, 420, 100, 80);
  const zoomed = zoomView(INITIAL_VIEW, 640, 420, 2, 100, 80);
  expect(toWorld(zoomed, 640, 420, 100, 80)).toEqual(before);
  expect(zoomView(INITIAL_VIEW, 640, 420, 100000).scale).toBe(1600);
  expect(zoomView(INITIAL_VIEW, 640, 420, 0.00001).scale).toBe(4);
});
it("maps compact pad coordinates using the same scale on both axes", () => {
  expect(
    clientToPage(260, 80, { left: 20, top: 10, width: 480, height: 140 }, 280),
  ).toEqual({ x: 480, y: 140 });
});
