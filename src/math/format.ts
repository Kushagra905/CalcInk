import Decimal from "decimal.js";
import { ExpressionError, expressionLimits } from "./errors";

export function formatAnswer(value: Decimal): string {
  if (!value.isFinite()) throw new ExpressionError("NON_FINITE_RESULT");
  if (value.e >= expressionLimits.integerDigits)
    throw new ExpressionError("RESULT_TOO_LARGE");
  const rounded = value
    .toSignificantDigits(28, Decimal.ROUND_HALF_UP)
    .toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
  if (rounded.e >= expressionLimits.integerDigits)
    throw new ExpressionError("RESULT_TOO_LARGE");
  return rounded.isZero() ? "0" : rounded.toFixed();
}
