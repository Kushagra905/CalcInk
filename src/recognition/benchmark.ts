export function normalizeTranscript(text: string): string {
  return text.normalize("NFKC")
    .replace(/\\(?:times|cdot)/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\[,;!]/g, "")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\$/g, "")
    .replace(/\s+/g, "");
}

export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = current;
  }
  return previous[b.length];
}

export interface BenchmarkEntry {
  readonly sampleId: string;
  readonly expected: string;
  readonly transcript: string;
  readonly latencyMs: number;
  readonly error?: string;
}

export function summarizeBenchmark(entries: readonly BenchmarkEntry[], requiredCount = 24) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.sampleId)) throw new Error("DUPLICATE_SAMPLE");
    seen.add(entry.sampleId);
  }
  let exact = 0, edits = 0, characters = 0;
  const latencies: number[] = [];
  for (const entry of entries) {
    if (!Number.isFinite(entry.latencyMs) || entry.latencyMs < 0) throw new Error("INVALID_LATENCY");
    const expected = normalizeTranscript(entry.expected);
    const actual = entry.error ? "" : normalizeTranscript(entry.transcript);
    if (!entry.error && expected === actual) exact++;
    edits += editDistance(expected, actual); characters += expected.length;
    latencies.push(entry.latencyMs);
  }
  latencies.sort((a, b) => a - b);
  const p95Ms = latencies.length ? latencies[Math.ceil(latencies.length * .95) - 1] : null;
  return {
    samples: entries.length, exact, failures: entries.filter((entry) => entry.error).length,
    expressionAccuracy: entries.length ? exact / entries.length : null,
    characterErrorRate: characters ? edits / characters : null,
    p95Ms,
    gate: entries.length !== requiredCount ? "incomplete" : requiredCount === 24 && exact >= 22 && p95Ms !== null && p95Ms <= 2000 && entries.every((entry) => !entry.error) ? "pass" : "below-target",
  } as const;
}
