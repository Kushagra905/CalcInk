import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { evaluateTranscript } from "../../src/math/evaluate";
import { ArithmeticDecimal } from "../../src/math/evaluator";
import { formatAnswer } from "../../src/math/format";
import { parseExpression } from "../../src/math/parser";
import { describeOutcome } from "../../src/math/status";
import { evaluateRecognition } from "../../src/recognition/evaluate";
import { normalizeExpression } from "../../src/recognition/normalize";
import type { RecognitionResponse } from "../../src/recognition/protocol";

describe("deterministic arithmetic", () => {
  it.each([
    ["18+4×3=", "30"],
    ["8÷4÷2=", "1"],
    ["-3×-2=", "6"],
    [".5+1.25=", "1.75"],
    ["0.1+0.2=", "0.3"],
    ["10-3-2=", "5"],
    ["10--2=", "12"],
    ["(2+3)*4=", "20"],
    ["1.0000000000005=", "1.000000000001"],
    ["-0.0000000000001=", "0"],
    [String.raw`$\left(2\, + 3\right)\times 4=$`, "20"],
    ["(18+4)*3=", "66"],
    ["6/-2=", "-3"],
    ["2--3=", "5"],
    ["--3=", "3"],
    ["+(2+-3)=", "-1"],
    ["2.+.5=", "2.5"],
    ["00012.500+0.50=", "13"],
    ["1/3=", "0.333333333333"],
    ["2/3=", "0.666666666667"],
    ["-0=", "0"],
    ["1-1=", "0"],
    ["0.00000000000049=", "0"],
    ["-0.00000000000049=", "0"],
    ["0.0000000000005=", "0.000000000001"],
    ["-0.0000000000005=", "-0.000000000001"],
    ["1234567890123456789012345678+1=", "1234567890123456789012345679"],
    ["10000000000000000000000000000+1=", "10000000000000000000000000000"],
    [String.raw`18 + 4 \times 3 =`, "30"],
    [String.raw`8 \div 4 \div 2 =`, "1"],
    [String.raw`\(18+4\cdot3=\)`, "30"],
    [String.raw`$\left(2+3\right)\times4=$`, "20"],
    [String.raw`$$.5\,+\;1.25\!=$$`, "1.75"],
    ["−3·−2=", "6"],
  ])("calculates %s as %s", (source, expected) => {
    expect(evaluateTranscript(source).outcome).toEqual({
      kind: "answer",
      value: expected,
    });
  });

  it.each(["8÷0=", "0/0=", "8/-0.000=", "1/(0.1-0.1)="])(
    "classifies exact zero divisors in %s",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "undefined",
        code: "DIVISION_BY_ZERO",
      });
    },
  );
  it("does not treat a small nonzero denominator as zero", () => {
    expect(evaluateTranscript("1/.0000000000001=").outcome).toEqual({
      kind: "answer",
      value: "10000000000000",
    });
  });
  it.each(["", "18+4", "12+", "(2+3", "."])(
    "waits for terminal equals in %s",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "incomplete",
      });
    },
  );
  it.each([
    "12+=",
    "1.2.3=",
    "2(3+4)=",
    "(2+3=",
    "2+3)=",
    "()=",
    "*=",
    "2**3=",
    "2//3=",
    ".=",
    "8/0+=",
    "8/0+)=",
    "1(2)=",
    "(8/0)+=",
  ])("rejects malformed %s before evaluating it", (source) => {
    expect(evaluateTranscript(source).outcome).toEqual({
      kind: "invalid",
      code: "INVALID_EXPRESSION",
    });
  });
  it.each([
    ["==", "EMPTY_EXPRESSION"],
    ["= =", "EMPTY_EXPRESSION"],
    ["1==2", "NON_TERMINAL_EQUALS"],
    ["1==2==", "MULTIPLE_EQUALS"],
    ["1=2", "NON_TERMINAL_EQUALS"],
    ["2=3", "NON_TERMINAL_EQUALS"],
    ["=", "EMPTY_EXPRESSION"],
    ["1+2=3=", "MULTIPLE_EQUALS"],
    ["$1+2=", "INVALID_WRAPPER"],
  ])("rejects malformed delimiters in %s", (source, code) => {
    expect(evaluateTranscript(source).outcome).toEqual({
      kind: "invalid",
      code,
    });
  });
  it.each([
    String.raw`\frac{1}{2}=`,
    "1e3=",
    "0x10=",
    "x+2=",
    "2x3=",
    "1_000=",
    String.raw`\timesfoo=`,
    "alert(1)=",
    "1$2=",
    "１２+３=",
  ])("rejects unsupported notation %s", (source) => {
    expect(evaluateTranscript(source).outcome.kind).toBe("unrecognized");
  });
});

describe("normalization and resource bounds", () => {
  it.each([
    ["2==", "2=", "2"],
    ["18+4×3===", "18+4*3=", "30"],
    ["1 = =", "1=", "1"],
    ["2+3= \n =\t=", "2+3=", "5"],
    [String.raw`$2+3=\quad=\;=$`, "2+3=", "5"],
  ])(
    "treats repeated completion markers in %s as one equals",
    (raw, canonical, value) => {
      expect(evaluateTranscript(raw)).toEqual({
        normalizedTranscript: canonical,
        outcome: { kind: "answer", value },
      });
    },
  );
  it("retains arithmetic validation after collapsing equals", () => {
    expect(evaluateTranscript("12+==").outcome).toEqual({
      kind: "invalid",
      code: "INVALID_EXPRESSION",
    });
    expect(evaluateTranscript("1/(0.1-0.1)= =").outcome).toEqual({
      kind: "undefined",
      code: "DIVISION_BY_ZERO",
    });
  });
  it("counts canonical length while still bounding raw repeated markers", () => {
    expect(
      evaluateTranscript(`${"1".repeat(127)}${"=".repeat(128)}`).outcome.kind,
    ).toBe("answer");
    expect(evaluateTranscript(`1${"=".repeat(4096)}`).outcome).toEqual({
      kind: "invalid",
      code: "RAW_INPUT_TOO_LONG",
    });
  });
  it("preserves digits, decimals and signs while removing known model spacing", () => {
    expect(
      normalizeExpression(String.raw`\[ − 1 . 2 \quad + \space .5 \qquad = \]`),
    ).toEqual({
      ok: true,
      transcript: "-1.2+.5=",
      expression: "-1.2+.5",
      complete: true,
    });
  });
  it("never invents a missing operator or equals", () => {
    expect(evaluateTranscript("2(3)=").outcome.kind).toBe("invalid");
    expect(evaluateTranscript("2+3").outcome.kind).toBe("incomplete");
  });
  it("accepts 128 normalized characters and rejects 129", () => {
    expect(evaluateTranscript(`${"1".repeat(127)}=`).outcome.kind).toBe(
      "answer",
    );
    expect(evaluateTranscript(`${"1".repeat(128)}=`).outcome).toEqual({
      kind: "invalid",
      code: "INPUT_TOO_LONG",
    });
  });
  it("accepts 64 unary operators and rejects 65", () => {
    expect(evaluateTranscript(`${"-".repeat(64)}1=`).outcome).toEqual({
      kind: "answer",
      value: "1",
    });
    expect(evaluateTranscript(`${"-".repeat(65)}1=`).outcome).toEqual({
      kind: "invalid",
      code: "TOO_MANY_OPERATORS",
    });
  });
  it("bounds raw text before removing spacing", () => {
    expect(evaluateTranscript(`${" ".repeat(4096)}1=`).outcome).toEqual({
      kind: "invalid",
      code: "RAW_INPUT_TOO_LONG",
    });
  });
  it("bounds the parser even when called without the normalizer", () => {
    expect(() => parseExpression("1".repeat(129))).toThrow("INPUT_TOO_LONG");
    expect(() => parseExpression(`${"+".repeat(65)}1`)).toThrow(
      "TOO_MANY_OPERATORS",
    );
  });
  it("uses independent 28-digit settings and refuses non-finite formatting", () => {
    expect(ArithmeticDecimal.precision).toBe(28);
    expect(ArithmeticDecimal.rounding).toBe(Decimal.ROUND_HALF_UP);
    expect(Decimal.precision).toBe(20);
    expect(() => formatAnswer(new ArithmeticDecimal(Infinity))).toThrow(
      "NON_FINITE_RESULT",
    );
  });
  it("formats readable states", () => {
    expect(
      describeOutcome({ kind: "undefined", code: "DIVISION_BY_ZERO" }),
    ).toBe("Undefined");
    expect(
      describeOutcome({ kind: "invalid", code: "INPUT_TOO_LONG" }),
    ).toContain("128");
    expect(describeOutcome({ kind: "answer", value: "30" })).toBe("30");
  });
});

function result(transcript: string): RecognitionResponse {
  return {
    epoch: 3,
    rowId: "row-2",
    rowRevision: 8,
    requestId: 17,
    modelId: "trial-model",
    transcript,
    outcome: { kind: "unrecognized", code: "EVALUATION_ONLY" },
    visibleInkBounds: { x: 20, y: 180, width: 100, height: 40 },
    timing: { preprocessMs: 11, inferenceMs: 25, evaluateMs: 0 },
  };
}

describe("worker response arithmetic", () => {
  it("preserves raw benchmark text, request identity, visible bounds, and inference timing", () => {
    const response = evaluateRecognition(result(String.raw`18 + 4 \times 3 =`));
    expect(response).toMatchObject({
      epoch: 3,
      rowId: "row-2",
      rowRevision: 8,
      requestId: 17,
      modelId: "trial-model",
      transcript: String.raw`18 + 4 \times 3 =`,
      normalizedTranscript: "18+4*3=",
      outcome: { kind: "answer", value: "30" },
      visibleInkBounds: { x: 20, y: 180, width: 100, height: 40 },
      timing: { preprocessMs: 11, inferenceMs: 25 },
    });
    expect(response.timing.evaluateMs).toBeGreaterThanOrEqual(0);
  });
  it("never evaluates output already marked truncated", () => {
    const response = {
      ...result("2+2="),
      outcome: { kind: "unrecognized" as const, code: "OUTPUT_LIMIT" },
    };
    expect(evaluateRecognition(response)).toBe(response);
  });
  it("preserves raw repeated equals while evaluating the canonical completion marker", () => {
    expect(evaluateRecognition(result("1 = ="))).toMatchObject({
      transcript: "1 = =",
      normalizedTranscript: "1=",
      outcome: { kind: "answer", value: "1" },
    });
  });
  it("distinguishes unreadable surviving ink from an empty row", () => {
    expect(evaluateRecognition(result(" ")).outcome).toEqual({
      kind: "unrecognized",
      code: "EMPTY_TRANSCRIPT",
    });
    const blank = {
      ...result(""),
      visibleInkBounds: null,
      outcome: { kind: "incomplete" as const },
    };
    expect(evaluateRecognition(blank)).toBe(blank);
  });
});
