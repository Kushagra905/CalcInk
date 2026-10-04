import { ExpressionError } from "./errors";

export type Token =
  | { readonly kind: "number"; readonly value: string }
  | {
      readonly kind: "symbol";
      readonly value: "+" | "-" | "*" | "/" | "(" | ")";
    }
  | { readonly kind: "end" };

export function tokenize(expression: string): readonly Token[] {
  const tokens: Token[] = [];
  for (let index = 0; index < expression.length; ) {
    const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/.exec(
      expression.slice(index),
    );
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const value = expression[index];
    if (
      value !== "+" &&
      value !== "-" &&
      value !== "*" &&
      value !== "/" &&
      value !== "(" &&
      value !== ")"
    )
      throw new ExpressionError("INVALID_EXPRESSION");
    tokens.push({ kind: "symbol", value });
    index++;
  }
  tokens.push({ kind: "end" });
  return tokens;
}
