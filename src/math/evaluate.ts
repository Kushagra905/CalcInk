import { normalizeExpression } from "../recognition/normalize";
import type { CalculationOutcome } from "../recognition/protocol";
import { ExpressionError } from "./errors";
import { evaluateExpression } from "./evaluator";
import { formatAnswer } from "./format";
import { parseExpression } from "./parser";

export interface TranscriptEvaluation {
  readonly normalizedTranscript: string | null;
  readonly outcome: CalculationOutcome;
}

export function evaluateTranscript(raw: string): TranscriptEvaluation {
  const normalized = normalizeExpression(raw);
  if (!normalized.ok)
    return {
      normalizedTranscript: null,
      outcome: { kind: normalized.kind, code: normalized.code },
    };
  if (!normalized.complete)
    return {
      normalizedTranscript: normalized.transcript,
      outcome: { kind: "incomplete" },
    };
  try {
    const tree = parseExpression(normalized.expression);
    return {
      normalizedTranscript: normalized.transcript,
      outcome: {
        kind: "answer",
        value: formatAnswer(evaluateExpression(tree)),
      },
    };
  } catch (error) {
    if (!(error instanceof ExpressionError)) throw error;
    return {
      normalizedTranscript: normalized.transcript,
      outcome:
        error.code === "DIVISION_BY_ZERO"
          ? { kind: "undefined", code: "DIVISION_BY_ZERO" }
          : { kind: "invalid", code: error.code },
    };
  }
}
