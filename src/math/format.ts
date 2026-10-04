import Decimal from "decimal.js";
import { ExpressionError } from "./errors";

export function formatAnswer(value: Decimal): string {
  if (!value.isFinite()) throw new ExpressionError("NON_FINITE_RESULT");
  const rounded = value
    .toSignificantDigits(28, Decimal.ROUND_HALF_UP)
    .toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? "0" : rounded.toFixed();
}
