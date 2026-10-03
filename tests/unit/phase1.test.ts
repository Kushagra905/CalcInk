import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { normalizeTranscript, editDistance, summarizeBenchmark } from "../../src/recognition/benchmark";
import { assertTrialAllowed, candidates, getCandidate } from "../../src/recognition/candidates";
import { assetUrl, verifyLocalAssets } from "../../src/recognition/local-assets";
import { reduceLoading } from "../../src/recognition/loading-state";
import { alphaBounds, rowTop } from "../../src/recognition/rasterize";
import { sampleCases } from "../../tools/model-lab/cases";
import { parseFixtures } from "../../tools/model-lab/fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("model candidates", () => {
  it("keeps the unlicensed fine-tune blocked", () => {
    expect(() => assertTrialAllowed(getCandidate("trocr-mathwriting-int8"))).toThrow("MODEL_LICENSE_UNRESOLVED");
  });
  it("allows the repository-licensed comparison trial", () => {
    expect(() => assertTrialAllowed(getCandidate("ink-on-comer-int8"))).not.toThrow();
  });
  it("pins all files to hashes and known sizes", () => {
    for (const candidate of candidates) {
      expect(candidate.revision).toMatch(/^[a-f0-9]{40}$/);
      for (const file of candidate.files) { expect(file.sha256).toMatch(/^[a-f0-9]{64}$/); expect(file.bytes).toBeGreaterThan(0); }
    }
  });
});

describe("benchmark measurements", () => {
  it("normalizes equivalent operator typography without removing equals", () => {
    expect(normalizeTranscript("$18 + 4 \\times 3 =$ ")).toBe("18+4*3=");
    expect(normalizeTranscript("−7 ÷ 2 =")).toBe("-7/2=");
    expect(normalizeTranscript("1 . 25 \\div 0 . 5 =")).toBe("1.25/0.5=");
  });
  it("does not reinterpret unsupported mathematical structures", () => {
    expect(normalizeTranscript("\\frac{1}{2}=")).not.toBe(normalizeTranscript("1÷2="));
  });
  it("measures edits including missing decimal points", () => {
    expect(editDistance("1.2=", "12=")).toBe(1);
    expect(editDistance("", "123")).toBe(3);
  });
  it("cannot pass an incomplete sample set", () => {
    expect(summarizeBenchmark([{ sampleId: "one", expected: "1+1=", transcript: "1+1=", latencyMs: 10 }]).gate).toBe("incomplete");
  });
  it("counts failures in accuracy and uses nearest-rank p95", () => {
    const entries = Array.from({ length: 24 }, (_, index) => ({ sampleId: String(index), expected: "1.2=", transcript: "1.2=", latencyMs: (index + 1) * 100 }));
    const summary = summarizeBenchmark(entries);
    expect(summary.p95Ms).toBe(2300);
    expect(summary.gate).toBe("below-target");
    expect(summarizeBenchmark([{ ...entries[0], error: "timeout" }]).exact).toBe(0);
  });
  it("requires at least 22 correct expressions with measured latency", () => {
    const entries = Array.from({ length: 24 }, (_, index) => ({ sampleId: String(index), expected: "1.2=", transcript: index < 22 ? "1.2=" : "12=", latencyMs: 100 }));
    expect(summarizeBenchmark(entries).gate).toBe("pass");
    expect(summarizeBenchmark(entries).expressionAccuracy).toBe(22 / 24);
    expect(summarizeBenchmark(entries).characterErrorRate).toBe(2 / 96);
  });
  it("rejects duplicate sample IDs and invalid durations", () => {
    const entry = { sampleId: "one", expected: "1=", transcript: "1=", latencyMs: 1 };
    expect(() => summarizeBenchmark([entry, entry])).toThrow("DUPLICATE_SAMPLE");
    expect(() => summarizeBenchmark([{ ...entry, latencyMs: NaN }])).toThrow("INVALID_LATENCY");
  });
});

describe("local assets", () => {
  it("supports GitHub Pages base paths", () => {
    expect(assetUrl("https://example.test/CalcInk/", "models/a/model.onnx")).toBe("https://example.test/CalcInk/models/a/model.onnx");
  });
  it("rejects traversal and remote asset paths", () => {
    for (const path of ["../escape", "/escape", "https://external.test/model", "a\\b"]) expect(() => assetUrl("https://example.test/CalcInk/", path)).toThrow("INVALID_ASSET_PATH");
  });
  it("rejects content that does not match the pinned hash", async () => {
    const data = new TextEncoder().encode("wrong");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(data)));
    const manifest = { modelId: "test", revision: "rev", files: [{ path: "models/a", bytes: data.length, sha256: createHash("sha256").update("right").digest("hex") }] };
    await expect(verifyLocalAssets(manifest, "https://example.test/")).rejects.toThrow("ASSET_HASH_MISMATCH");
  });
  it("rejects missing files rather than accepting an HTML fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(verifyLocalAssets({ modelId: "test", revision: "rev", files: [{ path: "models/a", bytes: 1, sha256: "0".repeat(64) }] }, "https://example.test/")).rejects.toThrow("ASSET_MISSING");
  });
});

describe("loading UI contract", () => {
  it("ignores progress for another model", () => {
    const state = { kind: "loading", modelId: "a", progress: null } as const;
    expect(reduceLoading(state, { type: "READY", modelId: "b" })).toBe(state);
  });
  it("supports indeterminate progress and recoverable initialization failure", () => {
    const state = { kind: "loading", modelId: "a", progress: null } as const;
    expect(reduceLoading(state, { type: "PROGRESS", modelId: "a", progress: { stage: "loading", fraction: null } })).toMatchObject({ progress: { fraction: null } });
    expect(reduceLoading(state, { type: "ERROR", modelId: "a", key: null, code: "missing", message: "retry", recoverable: true })).toEqual({ kind: "error", modelId: "a", message: "retry" });
  });
});

describe("visible ink bounds", () => {
  it("keeps single-pixel dots and treats fully erased ink as empty", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data[(2 * 4 + 1) * 4 + 3] = 1;
    expect(alphaBounds(data, 4, 4)).toEqual({ x: 1, y: 2, width: 1, height: 1 });
    data.fill(0); expect(alphaBounds(data, 4, 4)).toBeNull();
  });
  it("maps row-local bounds to stable page offsets", () => {
    expect(rowTop("row-2")).toBe(160); expect(rowTop("row-3")).toBe(320);
    expect(() => rowTop("other")).toThrow("UNKNOWN_ROW");
  });
});

describe("handwriting fixtures", () => {
  it("defines 24 development and 50 separate held-out cases for both writers", () => {
    for (const writer of ["A", "B"]) {
      expect(sampleCases.filter((item) => item.writer === writer && item.split === "development")).toHaveLength(12);
      expect(sampleCases.filter((item) => item.writer === writer && item.split === "held-out")).toHaveLength(25);
    }
    expect(new Set(sampleCases.map((item) => item.id)).size).toBe(74);
    expect(sampleCases.every((item) => item.expected.endsWith("="))).toBe(true);
  });
  it("rejects unknown sample IDs and fabricated empty ink", () => {
    expect(() => parseFixtures({ schemaVersion: 1, samples: [{ sampleId: "unknown", capturedAt: new Date().toISOString(), operations: [] }] })).toThrow("INVALID_SAMPLE");
    expect(() => parseFixtures({ schemaVersion: 1, samples: [{ sampleId: "dev-A-01", capturedAt: new Date().toISOString(), operations: [] }] })).toThrow("INVALID_SAMPLE");
  });
});
