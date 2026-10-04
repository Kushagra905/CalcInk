import { evaluateTranscript } from "../../src/math/evaluate";
import { normalizeExpression } from "../../src/recognition/normalize";
import { normalizeTranscript } from "../../src/recognition/benchmark";
import type {
  CalculationOutcome,
  RecognitionResponse,
} from "../../src/recognition/protocol";
import { sampleCases } from "./cases";
import { parseFixtures } from "./fixtures";
import type { CapturedSample } from "./fixtures";

export const heldOutCases = sampleCases.filter(
  (item) => item.split === "held-out",
);
export const requiredSymbols = [..."0123456789+-*/.="];

export interface GenuineSample extends CapturedSample {
  readonly sampleType: "handwritten";
  readonly provenance: "writer-confirmed";
  readonly dataset: "held-out";
  readonly writerSlot: "A" | "B";
  readonly writer: string;
  readonly expectedTranscript: string;
  readonly expectedValue: string;
  readonly device: {
    input: "mouse" | "pen" | "touch";
    description: string;
    userAgent: string;
    dpr: number;
  };
}

/** Writer confirmation is provenance, not a cryptographic proof of human input. */
export function parseHeldOut(value: unknown): readonly GenuineSample[] {
  const bundle = value as { dataset?: unknown };
  if (bundle?.dataset !== "held-out")
    throw new Error("HELD_OUT_EXPORT_REQUIRED");
  const samples = parseFixtures(value).samples as readonly GenuineSample[];
  if (samples.length !== 50)
    throw new Error("ALL_50_HELD_OUT_SAMPLES_REQUIRED");
  const writers = new Map<string, string>();
  const inkIds = new Set<string>();
  const inkShapes = new Set<string>();
  for (const sample of samples) {
    const plan = heldOutCases.find((item) => item.id === sample.sampleId);
    if (
      !plan ||
      sample.sampleType !== "handwritten" ||
      sample.provenance !== "writer-confirmed" ||
      sample.dataset !== "held-out" ||
      sample.writerSlot !== plan.writer ||
      sample.expectedTranscript !== plan.expected ||
      typeof sample.writer !== "string" ||
      !sample.writer.trim()
    )
      throw new Error("GENUINE_SAMPLE_PROVENANCE_REQUIRED");
    const expected = evaluateTranscript(plan.expected).outcome;
    const value =
      expected.kind === "answer"
        ? expected.value
        : expected.kind === "undefined"
          ? "Undefined"
          : null;
    if (sample.expectedValue !== value)
      throw new Error("GROUND_TRUTH_VALUE_MISMATCH");
    const device = sample.device;
    if (
      !device ||
      !["mouse", "pen", "touch"].includes(device.input) ||
      typeof device.description !== "string" ||
      !device.description.trim() ||
      typeof device.userAgent !== "string" ||
      !device.userAgent.trim() ||
      !Number.isFinite(device.dpr) ||
      device.dpr <= 0
    )
      throw new Error("CAPTURE_DEVICE_REQUIRED");
    const label = sample.writer.trim().toLocaleLowerCase();
    if (writers.has(plan.writer) && writers.get(plan.writer) !== label)
      throw new Error("WRITER_LABEL_CHANGED");
    writers.set(plan.writer, label);
    for (const operation of sample.operations) {
      if (
        operation.kind !== "stroke" ||
        operation.stroke.id.startsWith("fixture-") ||
        inkIds.has(operation.stroke.id)
      )
        throw new Error("SYNTHETIC_OR_REUSED_INK");
      const bounds = operation.stroke.bounds;
      if (
        !bounds ||
        ![bounds.x, bounds.y, bounds.width, bounds.height].every(
          Number.isFinite,
        ) ||
        bounds.width < 0 ||
        bounds.height < 0 ||
        operation.stroke.points.some((point) => point.t < 0)
      )
        throw new Error("INVALID_CAPTURE_GEOMETRY");
      inkIds.add(operation.stroke.id);
    }
    const shape = JSON.stringify(
      sample.operations.map((operation) =>
        operation.kind === "stroke"
          ? {
              width: operation.stroke.width,
              points: operation.stroke.points.map(({ x, y, pressure }) => [
                x,
                y,
                pressure,
              ]),
            }
          : null,
      ),
    );
    if (inkShapes.has(shape)) throw new Error("REUSED_SAMPLE_GEOMETRY");
    inkShapes.add(shape);
  }
  if (writers.size !== 2 || writers.get("A") === writers.get("B"))
    throw new Error("TWO_DISTINCT_WRITERS_REQUIRED");
  return heldOutCases.map(
    (item) => samples.find((sample) => sample.sampleId === item.id)!,
  );
}

export interface FinalEntry {
  readonly sampleId: string;
  readonly result: RecognitionResponse | null;
  /** From document commit through the next rAF after displaying the accepted result. */
  readonly totalUpdateMs: number;
  readonly error?: string;
}

export function distribution(values: readonly number[]) {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("INVALID_TIMING");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    medianMs: !sorted.length
      ? null
      : sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null,
    maxMs: sorted.at(-1) ?? null,
  };
}

function canonical(text: string): string | null {
  const normalized = normalizeExpression(text);
  return normalized.ok ? normalized.transcript : null;
}
function outcomeEqual(a: CalculationOutcome, b: CalculationOutcome): boolean {
  return a.kind === "answer" && b.kind === "answer"
    ? a.value === b.value
    : a.kind === "undefined" && b.kind === "undefined" && a.code === b.code;
}

/** Deterministic Levenshtein alignment; ties prefer substitution, deletion, insertion. */
export function alignSymbols(expected: string, actual: string) {
  const costs = Array.from({ length: expected.length + 1 }, () =>
    new Array<number>(actual.length + 1).fill(0),
  );
  for (let i = 0; i <= expected.length; i++) costs[i][0] = i;
  for (let j = 0; j <= actual.length; j++) costs[0][j] = j;
  for (let i = 1; i <= expected.length; i++)
    for (let j = 1; j <= actual.length; j++)
      costs[i][j] = Math.min(
        costs[i - 1][j - 1] + Number(expected[i - 1] !== actual[j - 1]),
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
      );
  let i = expected.length,
    j = actual.length;
  const edits: { expected: string | null; actual: string | null }[] = [];
  while (i || j) {
    if (
      i &&
      j &&
      costs[i][j] ===
        costs[i - 1][j - 1] + Number(expected[i - 1] !== actual[j - 1])
    )
      edits.push({ expected: expected[--i], actual: actual[--j] });
    else if (i && costs[i][j] === costs[i - 1][j] + 1)
      edits.push({ expected: expected[--i], actual: null });
    else edits.push({ expected: null, actual: actual[--j] });
  }
  return {
    distance: costs[expected.length][actual.length],
    edits: edits.reverse(),
  };
}

export function summarizeFinal(entries: readonly FinalEntry[]) {
  if (
    entries.length !== 50 ||
    new Set(entries.map((item) => item.sampleId)).size !== 50 ||
    entries.some(
      (item) => !heldOutCases.some((plan) => plan.id === item.sampleId),
    )
  )
    throw new Error("INCOMPLETE_OR_DUPLICATE_RESULTS");
  const symbols = Object.fromEntries(
    requiredSymbols.map((symbol) => [
      symbol,
      {
        expected: 0,
        correct: 0,
        substitutions: 0,
        deletions: 0,
        insertions: 0,
        failedSampleIds: [] as string[],
      },
    ]),
  );
  let exact = 0,
    arithmetic = 0,
    characters = 0,
    edits = 0;
  const failures: unknown[] = [];
  const stage = {
    preprocessMs: [] as number[],
    inferenceMs: [] as number[],
    evaluateMs: [] as number[],
    workerMs: [] as number[],
  };
  for (const entry of entries) {
    const expected = heldOutCases.find((item) => item.id === entry.sampleId)!;
    const reference = evaluateTranscript(expected.expected);
    const normalized = entry.result ? canonical(entry.result.transcript) : null;
    // Invalid equals placement still has readable symbols. Diagnostic alignment
    // preserves those symbols without relaxing strict expression acceptance.
    const diagnostic = entry.result
      ? normalizeTranscript(entry.result.transcript)
      : "";
    const actual = entry.error
      ? ""
      : (normalized ??
        (/^[0-9.+*/()=\-]{0,128}$/.test(diagnostic) ? diagnostic : ""));
    const transcriptionCorrect =
      !entry.error &&
      entry.result?.outcome.kind !== "unrecognized" &&
      normalized === reference.normalizedTranscript;
    const arithmeticCorrect =
      !entry.error &&
      !!entry.result &&
      outcomeEqual(entry.result.outcome, reference.outcome);
    exact += Number(transcriptionCorrect);
    arithmetic += Number(arithmeticCorrect);
    const alignment = alignSymbols(reference.normalizedTranscript!, actual);
    characters += reference.normalizedTranscript!.length;
    edits += alignment.distance;
    for (const edit of alignment.edits) {
      const target = edit.expected
        ? symbols[edit.expected]
        : edit.actual
          ? symbols[edit.actual]
          : null;
      if (!target) continue;
      if (edit.expected) target.expected++;
      if (edit.expected === edit.actual) target.correct++;
      else {
        if (!edit.expected) target.insertions++;
        else if (!edit.actual) target.deletions++;
        else target.substitutions++;
        if (!target.failedSampleIds.includes(entry.sampleId))
          target.failedSampleIds.push(entry.sampleId);
      }
    }
    if (entry.result) {
      const timing = entry.result.timing;
      for (const key of ["preprocessMs", "inferenceMs", "evaluateMs"] as const)
        stage[key].push(timing[key]);
      stage.workerMs.push(
        timing.preprocessMs + timing.inferenceMs + timing.evaluateMs,
      );
      if (entry.totalUpdateMs + 1 < stage.workerMs.at(-1)!)
        throw new Error("UPDATE_TIME_SHORTER_THAN_WORKER");
    }
    if (!transcriptionCorrect || !arithmeticCorrect)
      failures.push({
        sampleId: entry.sampleId,
        expected: expected.expected,
        raw: entry.result?.transcript ?? null,
        canonical: normalized,
        transcriptionCorrect,
        arithmeticCorrect,
        outcome: entry.result?.outcome ?? null,
        error: entry.error ?? null,
      });
  }
  const totalUpdate = distribution(entries.map((entry) => entry.totalUpdateMs));
  const coverageComplete = requiredSymbols.every(
    (symbol) => symbols[symbol].expected > 0,
  );
  return {
    count: 50,
    exactCanonical: exact,
    expressionAccuracy: exact / 50,
    arithmeticCorrect: arithmetic,
    arithmeticAccuracy: arithmetic / 50,
    characterErrorRate: edits / characters,
    unsupportedOutputsScoredAsEmpty: true,
    symbolAlignmentIsDiagnosticOnly: true,
    symbols,
    failures,
    timing: {
      preprocess: distribution(stage.preprocessMs),
      inference: distribution(stage.inferenceMs),
      arithmetic: distribution(stage.evaluateMs),
      worker: distribution(stage.workerMs),
      totalUpdate,
    },
    gates: {
      coverage: coverageComplete,
      transcription: exact >= 45,
      warmedUpdateP95:
        totalUpdate.p95Ms! <= 2000 && entries.every((entry) => !entry.error),
      automaticCorrections: false,
    },
  };
}

export function validateFinalEntries(
  entries: readonly FinalEntry[],
  modelId: string,
): void {
  for (const entry of entries) {
    if (
      typeof entry.sampleId !== "string" ||
      !Number.isFinite(entry.totalUpdateMs) ||
      entry.totalUpdateMs < 0 ||
      (entry.error !== undefined &&
        (typeof entry.error !== "string" || !entry.error))
    )
      throw new Error("INVALID_RESULT_ENTRY");
    const result = entry.result;
    if (!result) {
      if (!entry.error) throw new Error("MISSING_RESULT_OR_ERROR");
      continue;
    }
    if (
      entry.error ||
      result.modelId !== modelId ||
      result.rowId !== "row-1" ||
      typeof result.transcript !== "string" ||
      result.transcript.length > 4096 ||
      !result.timing ||
      [
        result.timing.preprocessMs,
        result.timing.inferenceMs,
        result.timing.evaluateMs,
      ].some((ms) => !Number.isFinite(ms) || ms < 0)
    )
      throw new Error("INVALID_RECOGNITION_RESULT");
    const recomputed = evaluateTranscript(result.transcript);
    if (
      result.outcome.kind === "unrecognized" &&
      ["OUTPUT_LIMIT", "EMPTY_TRANSCRIPT"].includes(result.outcome.code)
    )
      continue;
    const same =
      recomputed.outcome.kind === result.outcome.kind &&
      (recomputed.outcome.kind === "answer"
        ? result.outcome.kind === "answer" &&
          recomputed.outcome.value === result.outcome.value
        : "code" in recomputed.outcome
          ? "code" in result.outcome &&
            recomputed.outcome.code === result.outcome.code
          : true);
    if (
      !same ||
      recomputed.normalizedTranscript !== result.normalizedTranscript
    )
      throw new Error("TRANSCRIPT_OUTCOME_MISMATCH");
  }
}

export interface EvaluationBuild {
  readonly schemaVersion: 1;
  readonly baseCommit: string;
  readonly sourceDiffSha256: string;
  readonly version: string;
  readonly modelId: string;
  readonly revision: string;
  readonly runtimeVersion: string;
  readonly backend: "wasm";
  readonly numThreads: 1;
}

export interface FinalReport {
  readonly schemaVersion: 2;
  readonly split: "held-out";
  readonly recordedAt: string;
  readonly build: EvaluationBuild;
  readonly environment: {
    device: string;
    os: string;
    userAgent: string;
    hardwareConcurrency: number;
    dpr: number;
    headless: boolean;
  };
  readonly confirmation: {
    genuine: true;
    heldOutUnusedForTuning: true;
    manualCorrections: 0;
  };
  readonly fixturesSha256: string;
  readonly samples: readonly GenuineSample[];
  readonly initializationMs: number;
  readonly warmupExcluded: true;
  readonly latencyMethod: "document-commit-to-result-next-raf";
  readonly entries: readonly FinalEntry[];
}

export function validateFinalReport(
  report: FinalReport,
  build: EvaluationBuild,
) {
  if (
    report.schemaVersion !== 2 ||
    report.split !== "held-out" ||
    !Number.isFinite(Date.parse(report.recordedAt)) ||
    report.warmupExcluded !== true ||
    report.latencyMethod !== "document-commit-to-result-next-raf" ||
    !Number.isFinite(report.initializationMs) ||
    report.initializationMs < 0 ||
    !/^[a-f0-9]{64}$/.test(report.fixturesSha256)
  )
    throw new Error("INVALID_FINAL_REPORT");
  if (
    report.confirmation?.genuine !== true ||
    report.confirmation.heldOutUnusedForTuning !== true ||
    report.confirmation.manualCorrections !== 0
  )
    throw new Error("FINAL_EVALUATION_CONFIRMATION_REQUIRED");
  const environment = report.environment;
  if (
    !environment ||
    [environment.device, environment.os, environment.userAgent].some(
      (item) => typeof item !== "string" || !item.trim(),
    ) ||
    !Number.isInteger(environment.hardwareConcurrency) ||
    environment.hardwareConcurrency <= 0 ||
    !Number.isFinite(environment.dpr) ||
    environment.dpr <= 0 ||
    typeof environment.headless !== "boolean"
  )
    throw new Error("MEASUREMENT_ENVIRONMENT_REQUIRED");
  for (const key of [
    "schemaVersion",
    "baseCommit",
    "sourceDiffSha256",
    "version",
    "modelId",
    "revision",
    "runtimeVersion",
    "backend",
    "numThreads",
  ] as const)
    if (report.build?.[key] !== build[key])
      throw new Error("EVALUATION_BUILD_MISMATCH");
  if (
    !/^[a-f0-9]{40}$/.test(build.baseCommit) ||
    !/^[a-f0-9]{64}$/.test(build.sourceDiffSha256) ||
    !/^[a-f0-9]{64}$/.test(build.version) ||
    build.backend !== "wasm" ||
    build.numThreads !== 1
  )
    throw new Error("INVALID_EVALUATION_BUILD");
  const samples = parseHeldOut({
    schemaVersion: 1,
    dataset: "held-out",
    samples: report.samples,
  });
  validateFinalEntries(report.entries, build.modelId);
  return { samples, summary: summarizeFinal(report.entries) };
}
