import { expect, it } from "vitest";
import { evaluateTranscript } from "../../src/math/evaluate";

it("evaluates precedence, decimals, unary signs and supported LaTeX without floating-point artifacts", () => {
  for (const [input, value] of [
    ["18+4×3=", "30"],
    ["8÷4÷2=", "1"],
    ["-3×-2=", "6"],
    [".5+1.25=", "1.75"],
    ["0.1+0.2=", "0.3"],
    ["10--2=", "12"],
    ["(2+3)*4=", "20"],
    ["1/3=", "0.333333333333"],
    ["-0=", "0"],
    ["1.0000000000005=", "1.000000000001"],
    ["-0.0000000000001=", "0"],
    [String.raw`$\left(2\, + 3\right)\times 4=$`, "20"],
  ])
    expect(evaluateTranscript(input).outcome).toEqual({
      kind: "answer",
      value,
    });
  expect(evaluateTranscript("8÷0=").outcome).toEqual({
    kind: "undefined",
    code: "DIVISION_BY_ZERO",
  });
  expect(evaluateTranscript("18+4").outcome.kind).toBe("incomplete");
});

it("rejects malformed, unsupported, excessive and executable input without repairing it", () => {
  for (const input of [
    "12+=",
    "1.2.3=",
    "2==",
    "2=3",
    "=",
    "()=",
    "1(2)=",
    "8/0+)=",
    "2**3=",
    "2^3=",
    "1$2=",
    "alert(1)=",
    String.raw`\frac{1}{2}=`,
    String.raw`\timesfoo=`,
    `${"1".repeat(128)}=`,
    `${"+".repeat(65)}1=`,
  ])
    expect(evaluateTranscript(input).outcome.kind, input).toBe("invalid");
});
