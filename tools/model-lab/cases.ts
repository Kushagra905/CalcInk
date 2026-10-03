export interface SampleCase {
  readonly id: string;
  readonly split: "development" | "held-out";
  readonly writer: "A" | "B";
  readonly expected: string;
}

const development = [
  "18 + 4 × 3 =", "12 ÷ 3 + 5 =", "-7 + 12 =", "0.5 + 1.25 =",
  "98 - 76 =", "123 + 456 =", "9 × 8 =", "64 ÷ 8 =",
  "-3 × 6 =", "7.2 ÷ 0.3 =", "10 - -2 =", "4 ÷ 0 =",
];
const heldOut = [
  "21 + 8 × 2 =", "45 ÷ 9 - 3 =", "-12 + 4 =", "2.75 + 0.25 =", "876 - 543 =",
  "102 + 309 =", "7 × 6 =", "81 ÷ 9 =", "-4 × 7 =", "8.4 ÷ 0.7 =",
  "11 - -5 =", "9 ÷ 0 =", "0 + 0 =", "56 + 78 =", "3.5 - 1.2 =",
  "15 ÷ 2 =", "-0.5 × 4 =", "1000 - 99 =", "6 × 7 - 8 =", "25 + 75 ÷ 5 =",
  "1.01 + 0.09 =", "-18 ÷ 3 =", "200 + 345 =", "9.9 - 0.9 =", "90 ÷ 10 + 2 =",
];
export const sampleCases: readonly SampleCase[] = [
  ...(["A", "B"] as const).flatMap((writer) => development.map((expected, index) => ({ id: `dev-${writer}-${String(index + 1).padStart(2, "0")}`, split: "development" as const, writer, expected }))),
  ...(["A", "B"] as const).flatMap((writer) => heldOut.map((expected, index) => ({ id: `held-${writer}-${String(index + 1).padStart(2, "0")}`, split: "held-out" as const, writer, expected }))),
];
