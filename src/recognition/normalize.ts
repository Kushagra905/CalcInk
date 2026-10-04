import { expressionLimits } from "../math/errors";

export type NormalizationResult =
  | {
      readonly ok: true;
      readonly transcript: string;
      readonly expression: string;
      readonly complete: boolean;
    }
  | {
      readonly ok: false;
      readonly kind: "invalid" | "unrecognized";
      readonly code: string;
    };

const commands: Readonly<Record<string, string>> = {
  times: "*",
  cdot: "*",
  div: "/",
  quad: "",
  qquad: "",
  space: "",
};

/** Only known typography/spacing is rewritten. Missing math tokens are never supplied. */
export function normalizeExpression(raw: string): NormalizationResult {
  const fail = (
    code: string,
    kind: "invalid" | "unrecognized" = "invalid",
  ): NormalizationResult => ({ ok: false, kind, code });
  if (raw.length > expressionLimits.rawCharacters)
    return fail("RAW_INPUT_TOO_LONG");
  let source = raw.trim();
  for (const [open, close] of [
    ["$$", "$$"],
    ["$", "$"],
    ["\\(", "\\)"],
    ["\\[", "\\]"],
  ] as const) {
    if (!source.startsWith(open)) continue;
    if (source.length < open.length + close.length || !source.endsWith(close))
      return fail("INVALID_WRAPPER");
    source = source.slice(open.length, -close.length);
    break;
  }
  let transcript = "";
  for (let index = 0; index < source.length; ) {
    const symbol = source[index];
    if (/\s/.test(symbol)) {
      index++;
      continue;
    }
    if (symbol === "\\") {
      const next = source[index + 1];
      if (next && [",", ";", ":", "!", " "].includes(next)) {
        index += 2;
        continue;
      }
      const match = /^[a-zA-Z]+/.exec(source.slice(index + 1));
      if (!match) return fail("UNSUPPORTED_COMMAND", "unrecognized");
      const command = match[0];
      index += command.length + 1;
      if (command === "left" || command === "right") {
        while (index < source.length && /\s/.test(source[index])) index++;
        if (source[index] !== (command === "left" ? "(" : ")"))
          return fail("INVALID_WRAPPER");
        continue;
      }
      const replacement = commands[command];
      if (replacement === undefined)
        return fail("UNSUPPORTED_COMMAND", "unrecognized");
      transcript += replacement;
      continue;
    }
    const canonical =
      symbol === "×" || symbol === "·"
        ? "*"
        : symbol === "÷"
          ? "/"
          : symbol === "−"
            ? "-"
            : symbol;
    if (!/^[0-9.+\-*/()=]$/.test(canonical))
      return fail("UNSUPPORTED_TOKEN", "unrecognized");
    transcript += canonical;
    index++;
  }
  if (transcript.length > expressionLimits.normalizedCharacters)
    return fail("INPUT_TOO_LONG");
  if ((transcript.match(/[+\-*/]/g)?.length ?? 0) > expressionLimits.operators)
    return fail("TOO_MANY_OPERATORS");
  const equals = transcript.match(/=/g)?.length ?? 0;
  if (equals > 1) return fail("MULTIPLE_EQUALS");
  if (equals === 1 && !transcript.endsWith("="))
    return fail("NON_TERMINAL_EQUALS");
  const complete = equals === 1;
  const expression = complete ? transcript.slice(0, -1) : transcript;
  if (complete && !expression) return fail("EMPTY_EXPRESSION");
  return { ok: true, transcript, expression, complete };
}
