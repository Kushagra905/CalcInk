import Decimal from "decimal.js";
import { ExpressionError, expressionLimits } from "./errors";
import type { Expression } from "./parser";

// Independent settings avoid changing precision for other users of decimal.js.
export const ArithmeticDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export function evaluateExpression(expression: Expression): Decimal {
  if (expression.kind === "number")
    return new ArithmeticDecimal(expression.value);
  if (expression.kind === "unary") {
    const value = evaluateExpression(expression.operand);
    return expression.operator === "-" ? value.negated() : value;
  }
  const left = evaluateExpression(expression.left);
  const right = evaluateExpression(expression.right);
  switch (expression.operator) {
    case "+":
      return left.plus(right);
    case "-":
      return left.minus(right);
    case "*":
      return left.times(right);
    case "/":
      if (right.isZero()) throw new ExpressionError("DIVISION_BY_ZERO");
      return left.dividedBy(right);
    case "^": {
      if (
        !right.isFinite() ||
        right.abs().greaterThan(expressionLimits.exponentMagnitude)
      )
        throw new ExpressionError("EXPONENT_TOO_LARGE");
      if (left.isZero() && right.isZero())
        throw new ExpressionError("INDETERMINATE_POWER");
      if (left.isZero() && right.isNegative())
        throw new ExpressionError("DIVISION_BY_ZERO");
      if (left.isNegative() && !right.isInteger())
        throw new ExpressionError("NON_REAL_POWER");
      const value = left.pow(right);
      if (!value.isFinite() || value.e >= expressionLimits.integerDigits)
        throw new ExpressionError("RESULT_TOO_LARGE");
      return value;
    }
  }
}
