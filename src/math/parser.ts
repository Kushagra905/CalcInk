import { ExpressionError, expressionLimits } from "./errors";
import { tokenize } from "./lexer";

export type Expression =
  | { readonly kind: "number"; readonly value: string }
  | {
      readonly kind: "unary";
      readonly operator: "+" | "-";
      readonly operand: Expression;
    }
  | {
      readonly kind: "binary";
      readonly operator: "+" | "-" | "*" | "/";
      readonly left: Expression;
      readonly right: Expression;
    };

/** Parse the entire expression before evaluation, including division-by-zero checks. */
export function parseExpression(source: string): Expression {
  if (source.length > expressionLimits.normalizedCharacters)
    throw new ExpressionError("INPUT_TOO_LONG");
  if ((source.match(/[+\-*/]/g)?.length ?? 0) > expressionLimits.operators)
    throw new ExpressionError("TOO_MANY_OPERATORS");
  const tokens = tokenize(source);
  let index = 0;
  const take = (value: string) => {
    const token = tokens[index];
    if (token.kind !== "symbol" || token.value !== value) return false;
    index++;
    return true;
  };
  function primary(): Expression {
    const token = tokens[index];
    if (token.kind === "number") {
      index++;
      return token;
    }
    if (take("(")) {
      const result = expression();
      if (!take(")")) throw new ExpressionError("INVALID_EXPRESSION");
      return result;
    }
    throw new ExpressionError("INVALID_EXPRESSION");
  }
  function unary(): Expression {
    if (take("+")) return { kind: "unary", operator: "+", operand: unary() };
    if (take("-")) return { kind: "unary", operator: "-", operand: unary() };
    return primary();
  }
  function term(): Expression {
    let left = unary();
    while (true) {
      const token = tokens[index];
      if (
        token.kind !== "symbol" ||
        (token.value !== "*" && token.value !== "/")
      )
        return left;
      index++;
      left = { kind: "binary", operator: token.value, left, right: unary() };
    }
  }
  function expression(): Expression {
    let left = term();
    while (true) {
      const token = tokens[index];
      if (
        token.kind !== "symbol" ||
        (token.value !== "+" && token.value !== "-")
      )
        return left;
      index++;
      left = { kind: "binary", operator: token.value, left, right: term() };
    }
  }
  const result = expression();
  if (tokens[index].kind !== "end")
    throw new ExpressionError("INVALID_EXPRESSION");
  return result;
}
