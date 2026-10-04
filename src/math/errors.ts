export class ExpressionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ExpressionError";
  }
}

export const expressionLimits = {
  rawCharacters: 4096,
  normalizedCharacters: 128,
  operators: 64,
} as const;

export const expressionMessages: Readonly<Record<string, string>> = {
  INPUT_TOO_LONG: "Use an expression of at most 128 characters.",
  RAW_INPUT_TOO_LONG: "The recognized text is too long to process.",
  TOO_MANY_OPERATORS: "Use at most 64 arithmetic operators.",
  MULTIPLE_EQUALS: "Write exactly one equals sign at the end.",
  NON_TERMINAL_EQUALS: "Remove the text after the equals sign.",
  EMPTY_EXPRESSION: "Write an expression before the equals sign.",
  INVALID_EXPRESSION: "Check the numbers, operators, and parentheses.",
  UNSUPPORTED_TOKEN: "Use digits, decimals, +, −, ×, ÷, and parentheses.",
  UNSUPPORTED_COMMAND: "This mathematical notation is not supported.",
  INVALID_WRAPPER: "Check the expression's mathematical delimiters.",
  NON_FINITE_RESULT: "This expression does not have a finite result.",
  OUTPUT_LIMIT:
    "The recognition output reached its limit. Try a shorter expression.",
  EMPTY_TRANSCRIPT: "Could not read this ink. Rewrite the expression.",
};
