import { describe, expect, it } from "vitest";
import { evaluateTranscript } from "../../src/math/evaluate";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import type { FinalEntry } from "../../tools/model-lab/evaluation";
import {
  alignSymbols,
  distribution,
  heldOutCases,
  parseHeldOut,
  summarizeFinal,
  validateFinalEntries,
} from "../../tools/model-lab/evaluation";

// Synthetic unit-test data. These objects are never recorded as handwriting evidence.
function samples() {
  return heldOutCases.map((plan, index) => {
    const reference = evaluateTranscript(plan.expected).outcome;
    return {
      sampleId: plan.id,
      capturedAt: "2026-10-04T10:00:00Z",
      dataset: "held-out",
      writerSlot: plan.writer,
      sampleType: "handwritten",
      provenance: "writer-confirmed",
      writer: `Writer ${plan.writer}`,
      expectedTranscript: plan.expected,
      expectedValue:
        reference.kind === "answer" ? reference.value : "Undefined",
      device: {
        input: "pen",
        description: "Unit test",
        userAgent: "Test only",
        dpr: 1,
      },
      operations: [
        {
          kind: "stroke",
          stroke: {
            id: `test-${index}`,
            rowId: "row-1",
            width: 3,
            bounds: { x: 100 + index, y: 40, width: 10, height: 20 },
            points: [
              { x: 100 + index, y: 40, pressure: 0.5, t: 0 },
              { x: 110 + index, y: 60, pressure: 0.5, t: 1 },
            ],
          },
        },
      ],
    };
  });
}
function result(transcript: string): RecognitionResponse {
  return {
    epoch: 1,
    rowId: "row-1",
    rowRevision: 2,
    requestId: 1,
    modelId: "ink-on-comer-int8",
    transcript,
    ...evaluateTranscript(transcript),
    visibleInkBounds: { x: 100, y: 40, width: 50, height: 50 },
    timing: { preprocessMs: 10, inferenceMs: 300, evaluateMs: 1 },
  };
}
function entries(): FinalEntry[] {
  return heldOutCases.map((plan) => ({
    sampleId: plan.id,
    result: result(plan.expected),
    totalUpdateMs: 680,
  }));
}

describe("held-out provenance boundary", () => {
  it("requires the complete capture plan and both distinct writers", () => {
    expect(
      parseHeldOut({
        schemaVersion: 1,
        dataset: "held-out",
        samples: samples(),
      }),
    ).toHaveLength(50);
    expect(() =>
      parseHeldOut({
        schemaVersion: 1,
        dataset: "held-out",
        samples: samples().slice(0, 49),
      }),
    ).toThrow("ALL_50");
    const reusedWriter = samples().map((sample) => ({
      ...sample,
      writer: "Same person",
    }));
    expect(() =>
      parseHeldOut({
        schemaVersion: 1,
        dataset: "held-out",
        samples: reusedWriter,
      }),
    ).toThrow("TWO_DISTINCT");
  });
  it("rejects bare lab fixtures, relabeled ground truth and reused strokes", () => {
    const data = samples();
    delete (data[0] as Partial<(typeof data)[0]>).provenance;
    expect(() =>
      parseHeldOut({ schemaVersion: 1, dataset: "held-out", samples: data }),
    ).toThrow("PROVENANCE");
    const relabeled = samples();
    relabeled[0].expectedValue = "999";
    expect(() =>
      parseHeldOut({
        schemaVersion: 1,
        dataset: "held-out",
        samples: relabeled,
      }),
    ).toThrow("GROUND_TRUTH");
    const reused = samples();
    reused[1].operations = reused[0].operations;
    expect(() =>
      parseHeldOut({ schemaVersion: 1, dataset: "held-out", samples: reused }),
    ).toThrow("REUSED_INK");
    const copied = samples();
    copied[1].operations[0].stroke.points =
      copied[0].operations[0].stroke.points;
    expect(() =>
      parseHeldOut({ schemaVersion: 1, dataset: "held-out", samples: copied }),
    ).toThrow("GEOMETRY");
  });
});

describe("final scoring", () => {
  it("separates exact transcription from an accidentally correct arithmetic result", () => {
    const batch = entries();
    batch[0] = { ...batch[0], result: result("37=") };
    const score = summarizeFinal(batch);
    expect(score.exactCanonical).toBe(49);
    expect(score.arithmeticCorrect).toBe(50);
    expect(score.symbols["+"].deletions).toBeGreaterThan(0);
    expect(score.symbols["*"].failedSampleIds).toContain("held-A-01");
  });
  it("does not repair repeated equals and reports the inserted equals", () => {
    const batch = entries();
    batch[0] = { ...batch[0], result: result("21+8*2==") };
    const score = summarizeFinal(batch);
    expect(score.exactCanonical).toBe(49);
    expect(score.arithmeticCorrect).toBe(49);
    expect(score.symbols["="].insertions).toBe(1);
    expect(score.symbols["2"].deletions).toBe(0);
  });
  it("requires 45 exact samples and the entire measured latency set", () => {
    const batch = entries();
    for (let i = 0; i < 5; i++) batch[i] = { ...batch[i], result: result("?") };
    expect(summarizeFinal(batch).gates.transcription).toBe(true);
    batch[5] = { ...batch[5], result: result("?") };
    expect(summarizeFinal(batch).gates.transcription).toBe(false);
    for (let i = 0; i < 3; i++) batch[i] = { ...batch[i], totalUpdateMs: 2100 };
    expect(summarizeFinal(batch).gates.warmedUpdateP95).toBe(false);
    expect(() => summarizeFinal(batch.slice(1))).toThrow("INCOMPLETE");
    batch[49] = batch[0];
    expect(() => summarizeFinal(batch)).toThrow("DUPLICATE");
  });
  it("counts output-limit results as failures even if the text matches", () => {
    const batch = entries();
    batch[0] = {
      ...batch[0],
      result: {
        ...result(heldOutCases[0].expected),
        outcome: { kind: "unrecognized", code: "OUTPUT_LIMIT" },
      },
    };
    expect(summarizeFinal(batch).exactCanonical).toBe(49);
  });
  it("rejects outcome tampering, wrong models and impossible timing", () => {
    const batch = entries();
    batch[0] = {
      ...batch[0],
      result: {
        ...result(heldOutCases[0].expected),
        outcome: { kind: "answer", value: "999" },
      },
    };
    expect(() => validateFinalEntries(batch, "ink-on-comer-int8")).toThrow(
      "OUTCOME_MISMATCH",
    );
    expect(() => validateFinalEntries(entries(), "other-model")).toThrow(
      "INVALID_RECOGNITION",
    );
    const timing = entries();
    timing[0] = { ...timing[0], totalUpdateMs: 100 };
    expect(() => summarizeFinal(timing)).toThrow("SHORTER");
  });
  it("uses arithmetic median and nearest-rank p95 without fabricating empty timings", () => {
    expect(distribution([100, 200, 300, 400])).toEqual({
      count: 4,
      medianMs: 250,
      p95Ms: 400,
      maxMs: 400,
    });
    expect(distribution([]).p95Ms).toBeNull();
    expect(() => distribution([Number.NaN])).toThrow("INVALID_TIMING");
    expect(alignSymbols("1.2=", "12=").distance).toBe(1);
  });
});
