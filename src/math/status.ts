import type { CalculationOutcome } from "../recognition/protocol";
import { expressionMessages } from "./errors";

/** Presentation only: importing this helper never imports the arithmetic runtime. */
export function describeOutcome(outcome: CalculationOutcome): string {
  if (outcome.kind === "answer") return outcome.value;
  if (outcome.kind === "undefined") return "Undefined";
  if (outcome.kind === "incomplete") return "Finish the expression with =.";
  return expressionMessages[outcome.code] ?? "Check the writing and try again.";
}
