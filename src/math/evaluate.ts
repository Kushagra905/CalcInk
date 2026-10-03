import Decimal from "decimal.js";
import type { CalculationOutcome } from "../recognition/protocol";

const Arithmetic = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

/** Restricted arithmetic only. A missing terminal equals never produces an answer. */
export function evaluateTranscript(raw: string): {
  transcript: string;
  outcome: CalculationOutcome;
} {
  let transcript = raw.trim();
  try {
    if (raw.length > 2048) throw new Error("INPUT_LIMIT");
    if (
      transcript.startsWith("$") &&
      transcript.endsWith("$") &&
      !transcript.slice(1, -1).includes("$")
    )
      transcript = transcript.slice(1, -1);
    if (transcript.startsWith("\\(") && transcript.endsWith("\\)"))
      transcript = transcript.slice(2, -2);
    transcript = transcript
      .normalize("NFKC")
      .replace(/\\(?:times|cdot)(?![A-Za-z])/g, "*")
      .replace(/\\div(?![A-Za-z])/g, "/")
      .replace(/\\left(?=\()/g, "")
      .replace(/\\right(?=\))/g, "")
      .replace(/\\[,;!:]|\\(?:qquad|quad)(?![A-Za-z])/g, "")
      .replace(/[×·]/g, "*")
      .replace(/÷/g, "/")
      .replace(/[−–]/g, "-")
      .replace(/\s+/g, "");
    if (
      transcript.length > 128 ||
      (transcript.match(/[+*/-]/g)?.length ?? 0) > 64
    )
      throw new Error("INPUT_LIMIT");
    if (/[^0-9.+*/()=-]/.test(transcript)) throw new Error("INVALID_SYMBOL");
    if (!transcript.includes("="))
      return { transcript, outcome: { kind: "incomplete" } };
    if (
      !transcript.endsWith("=") ||
      transcript.indexOf("=") !== transcript.length - 1
    )
      throw new Error("INVALID_EXPRESSION");
    const input = transcript.slice(0, -1);
    let position = 0;
    let divisionByZero = false;
    function primary(): Decimal {
      if (input[position] === "(") {
        position++;
        const value = expression();
        if (input[position++] !== ")") throw new Error("INVALID_EXPRESSION");
        return value;
      }
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(position));
      if (!number) throw new Error("INVALID_EXPRESSION");
      position += number[0].length;
      return new Arithmetic(number[0]);
    }
    function unary(): Decimal {
      if (input[position] === "+" || input[position] === "-") {
        const sign = input[position++];
        const value = unary();
        return sign === "-" ? value.negated() : value;
      }
      return primary();
    }
    function term(): Decimal {
      let value = unary();
      while (input[position] === "*" || input[position] === "/") {
        const operator = input[position++];
        const right = unary();
        if (operator === "*") value = value.times(right);
        else if (right.isZero()) {
          divisionByZero = true;
          value = new Arithmetic(0);
        } else value = value.dividedBy(right);
      }
      return value;
    }
    function expression(): Decimal {
      let value = term();
      while (input[position] === "+" || input[position] === "-") {
        const operator = input[position++];
        const right = term();
        value = operator === "+" ? value.plus(right) : value.minus(right);
      }
      return value;
    }
    const result = expression();
    if (position !== input.length) throw new Error("INVALID_EXPRESSION");
    if (divisionByZero)
      return {
        transcript,
        outcome: { kind: "undefined", code: "DIVISION_BY_ZERO" },
      };
    const rounded = result.toDecimalPlaces(12);
    return {
      transcript,
      outcome: {
        kind: "answer",
        value: rounded.isZero() ? "0" : rounded.toFixed(),
      },
    };
  } catch (error) {
    return {
      transcript,
      outcome: {
        kind: "invalid",
        code: error instanceof Error ? error.message : "INVALID_EXPRESSION",
      },
    };
  }
}
