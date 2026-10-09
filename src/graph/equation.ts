type Scalar = (x: number, y: number) => number;
type Token = { kind: "number" | "name" | "symbol" | "end"; value: string };

const functions: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};

export interface GraphEquation {
  text: string;
  evaluate: Scalar;
  explicit?: { axis: "x" | "y"; evaluate: Scalar };
}

/** Parse a small mathematical language; OCR text never becomes executable code. */
export function compileEquation(raw: string): GraphEquation {
  if (raw.length > 512)
    throw new Error("Use an equation of at most 512 characters.");
  let source = raw
    .trim()
    .replace(/^\$+|\$+$/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g,
      (power) =>
        `^(${Array.from(power, (c) => "0123456789+-"["⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻".indexOf(c)]).join("")})`,
    )
    .replaceAll("−", "-")
    .replace(/[×·]/g, "*")
    .replaceAll("÷", "/");
  const latex: Record<string, string> = {
    times: "*",
    cdot: "*",
    div: "/",
    pi: "pi",
    left: "",
    right: "",
    quad: "",
    qquad: "",
  };
  source = source
    .replace(/\\([a-zA-Z]+)/g, (_, command: string) => {
      if (command === "frac" || Object.hasOwn(functions, command))
        return command;
      if (Object.hasOwn(latex, command)) return latex[command];
      throw new Error(`Unsupported notation: \\${command}.`);
    })
    .replace(/\\[,;:! ]/g, "")
    .replaceAll("π", "pi");
  const tokens: Token[] = [];
  for (let index = 0; index < source.length; ) {
    const rest = source.slice(index);
    if (/^\s/.test(rest)) {
      index++;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const name = /^(sin|cos|tan|sqrt|abs|exp|ln|log|frac|pi|x|y|e)/.exec(rest);
    if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
      continue;
    }
    if (!"+-*/^(){}=".includes(source[index]))
      throw new Error(
        "Use x, y, numbers, +, −, ×, ÷, powers and supported functions.",
      );
    tokens.push({ kind: "symbol", value: source[index++] });
  }
  if (tokens.length > 128)
    throw new Error("This equation is too complex. Use at most 128 tokens.");
  tokens.push({ kind: "end", value: "" });
  let index = 0,
    depth = 0;
  const take = (value: string) => {
    if (tokens[index].value !== value) return false;
    index++;
    return true;
  };
  function primary(): Scalar {
    if (++depth > 32)
      throw new Error(
        "Use at most 32 levels of parentheses or function arguments.",
      );
    try {
      const token = tokens[index++];
      if (token.kind === "number") {
        const value = Number(token.value);
        if (!Number.isFinite(value)) throw new Error("Use finite numbers.");
        return () => value;
      }
      if (token.value === "(" || token.value === "{") {
        const result = expression();
        if (!take(token.value === "(" ? ")" : "}"))
          throw new Error("Check the parentheses and braces.");
        return result;
      }
      if (token.kind === "name") {
        if (token.value === "x") return (x) => x;
        if (token.value === "y") return (_, y) => y;
        if (token.value === "pi") return () => Math.PI;
        if (token.value === "e") return () => Math.E;
        if (token.value === "frac") {
          if (tokens[index].value !== "{")
            throw new Error("Write fractions as a/b or \\frac{a}{b}.");
          const numerator = primary();
          if (tokens[index].value !== "{")
            throw new Error("A fraction needs a denominator.");
          const denominator = primary();
          return (x, y) => numerator(x, y) / denominator(x, y);
        }
        const fn = functions[token.value];
        if (fn) {
          if (!["(", "{"].includes(tokens[index].value))
            throw new Error(`Write ${token.value}(expression).`);
          const argument = primary();
          return (x, y) => fn(argument(x, y));
        }
      }
      throw new Error(
        "Check the equation's numbers, operators and parentheses.",
      );
    } finally {
      depth--;
    }
  }
  function unary(): Scalar {
    if (take("+")) return unary();
    if (take("-")) {
      const operand = unary();
      return (x, y) => -operand(x, y);
    }
    const left = primary();
    if (take("^")) {
      const right = unary();
      return (x, y) => left(x, y) ** right(x, y);
    }
    return left;
  }
  function term(): Scalar {
    let left = unary();
    while (true) {
      const token = tokens[index];
      const implicit =
        token.kind === "name" || ["(", "{"].includes(token.value);
      if (!["*", "/"].includes(token.value) && !implicit) return left;
      if (!implicit) index++;
      const a = left,
        b = unary();
      left =
        token.value === "/"
          ? (x, y) => a(x, y) / b(x, y)
          : (x, y) => a(x, y) * b(x, y);
    }
  }
  function expression(): Scalar {
    let left = term();
    while (["+", "-"].includes(tokens[index].value)) {
      const operator = tokens[index++].value,
        a = left,
        b = term();
      left =
        operator === "+"
          ? (x, y) => a(x, y) + b(x, y)
          : (x, y) => a(x, y) - b(x, y);
    }
    return left;
  }
  const leftStart = index;
  const left = expression();
  if (!take("="))
    throw new Error(
      "Write an equation with two sides, such as y = x^2 or x^2 + y^2 = 9.",
    );
  const equalsIndex = index - 1;
  const right = expression();
  if (tokens[index].kind !== "end")
    throw new Error("Write one complete equation with one equals sign.");
  const result: GraphEquation = {
    text: raw.trim(),
    evaluate: (x, y) => left(x, y) - right(x, y),
  };
  if (equalsIndex - leftStart === 1 && ["x", "y"].includes(tokens[0].value)) {
    const axis = tokens[0].value as "x" | "y";
    if (
      !tokens
        .slice(equalsIndex + 1)
        .some((token) => token.kind === "name" && token.value === axis)
    )
      result.explicit = { axis, evaluate: right };
  }
  return result;
}
