import { describe, expect, it } from "vitest";
import { evaluateTranscript } from "../../src/math/evaluate";
import { parseExpression } from "../../src/math/parser";
import { normalizeExpression } from "../../src/recognition/normalize";

describe("power arithmetic", () => {
  it.each([
    ["4^2=", "16"],
    ["4^2==", "16"],
    ["$4 ^ { 2 } = = $", "16"],
    ["4²=", "16"],
    ["2¹⁰=", "1024"],
    ["2⁻³=", "0.125"],
    ["2^3^2=", "512"],
    ["2^{3^{2}}=", "512"],
    ["-4^2=", "-16"],
    ["(-4)^2=", "16"],
    ["(-4)^3=", "-64"],
    ["2^-3=", "0.125"],
    ["(-2)^-3=", "-0.125"],
    ["2^(-3)^2=", "512"],
    ["16^0.5=", "4"],
    ["9^(1/2)=", "3"],
    ["27^(1/3)=", "3"],
    ["2^1.5=", "2.828427124746"],
    ["2+3^2*4=", "38"],
    ["(2+3)^2=", "25"],
    [String.raw`\( (2+3)^{2+1} \times 2 = \)`, "250"],
    ["8/2^2=", "2"],
    ["2^0=", "1"],
    ["0^2=", "0"],
    ["1^10000=", "1"],
  ])("calculates %s as %s", (source, value) => {
    expect(evaluateTranscript(source).outcome).toEqual({
      kind: "answer",
      value,
    });
  });

  it.each([
    ["0^-1=", "DIVISION_BY_ZERO"],
    ["0^0=", "INDETERMINATE_POWER"],
    ["(-4)^0.5=", "NON_REAL_POWER"],
  ])("classifies undefined %s", (source, code) => {
    expect(evaluateTranscript(source).outcome).toEqual({
      kind: "undefined",
      code,
    });
  });

  it.each(["4^=", "4^^2=", "^2=", "4^()=", "4^2(3)=", "4^{2+}=", "4^2.2.2="])(
    "rejects malformed %s without inventing tokens",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "invalid",
        code: "INVALID_EXPRESSION",
      });
    },
  );
  it.each(["4^{2=", "4^2}=", "4^{2}}=", "4^{(2})=", "4^{2)}(="])(
    "rejects unmatched exponent braces in %s",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "invalid",
        code: "INVALID_WRAPPER",
      });
    },
  );
  it.each(["4^2", "4^", "4²"])("waits for equals in %s", (source) => {
    expect(evaluateTranscript(source).outcome).toEqual({ kind: "incomplete" });
  });
  it("preserves the base and groups the exponent without dropping braces", () => {
    expect(normalizeExpression("4^{2+1}=")).toEqual({
      ok: true,
      transcript: "4^(2+1)=",
      expression: "4^(2+1)",
      complete: true,
    });
    expect(evaluateTranscript("4{2}=").outcome.kind).toBe("unrecognized");
    expect(evaluateTranscript("42=").outcome).toEqual({
      kind: "answer",
      value: "42",
    });
  });
  it.each(["2^10001=", "2^-10001=", "2^2^100="])(
    "bounds exponent work in %s",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "invalid",
        code: "EXPONENT_TOO_LARGE",
      });
    },
  );
  it.each(["10^1024=", "10^10000=", "(10^600)*(10^600)="])(
    "bounds fixed output length in %s",
    (source) => {
      expect(evaluateTranscript(source).outcome).toEqual({
        kind: "invalid",
        code: "RESULT_TOO_LARGE",
      });
    },
  );
  it("counts power operators toward the existing parser and normalizer limits", () => {
    expect(() => parseExpression(`${"1^".repeat(65)}1`)).toThrow(
      "INPUT_TOO_LONG",
    );
    expect(evaluateTranscript(`${"1^".repeat(64)}1=`).outcome).toEqual({
      kind: "invalid",
      code: "INPUT_TOO_LONG",
    });
  });
});
