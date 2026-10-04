import "./style.css";
import type { InkOperation, Point } from "../../src/document/types";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import type { LoadingState } from "../../src/recognition/loading-state";
import type { BenchmarkEntry } from "../../src/recognition/benchmark";
import { summarizeBenchmark } from "../../src/recognition/benchmark";
import { replayInk } from "../../src/ink/replay";
import { describeOutcome } from "../../src/math/status";
import { candidates, getCandidate } from "../../src/recognition/candidates";
import { TrialClient } from "../../src/recognition/trial-client";
import { sampleCases } from "./cases";
import { parseFixtures } from "./fixtures";
import type { CapturedSample } from "./fixtures";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const model = element<HTMLSelectElement>("model");
const writer = element<HTMLSelectElement>("writer");
const split = element<HTMLSelectElement>("split");
const sample = element<HTMLSelectElement>("sample");
const canvas = element<HTMLCanvasElement>("ink");
const context = canvas.getContext("2d")!;
const status = element<HTMLParagraphElement>("status");
const progress = element<HTMLProgressElement>("progress");
const baseUrl = new URL(import.meta.env.BASE_URL, location.origin).href;
const storageKey = "calcink-phase1-fixtures-v1";
let fixtures: CapturedSample[] = [];
let operations: InkOperation[] = [];
let revision = 0;
let active: { pointerId: number; points: Point[]; width: number } | null = null;
let loading: LoadingState = { kind: "idle" };
let busy = false;
let report: unknown = null;
let raf = 0;

try { fixtures = [...parseFixtures(JSON.parse(localStorage.getItem(storageKey) ?? '{"schemaVersion":1,"samples":[]}')).samples]; }
catch { element("capture-status").textContent = "Stored samples could not be read. Import a previous export if available."; }

function syncControls(): void {
  element<HTMLButtonElement>("load").disabled = loading.kind === "loading" || busy;
  model.disabled = loading.kind === "loading" || busy;
  element<HTMLButtonElement>("recognize").disabled = loading.kind !== "ready" || busy || !!active || !operations.length;
  element<HTMLButtonElement>("benchmark").disabled = loading.kind !== "ready" || busy || !!active;
}
const client = new TrialClient((state) => {
  loading = state;
  if (state.kind === "loading") {
    const amount = state.progress?.fraction;
    if (typeof amount === "number") progress.value = amount; else progress.removeAttribute("value");
    status.textContent = state.progress?.detail ?? "Checking local model manifest…";
  } else {
    progress.value = state.kind === "ready" ? 1 : 0;
    status.textContent = state.kind === "ready" ? "Local model ready. Phase 5 will add offline caching." : state.kind === "error" ? ["OFFSCREEN_CANVAS_UNAVAILABLE", "CANVAS_2D_UNAVAILABLE"].includes(state.message) ? "This browser cannot rasterize ink in a worker. Use a browser with OffscreenCanvas 2D support." : `Load failed: ${state.message}. Prepare assets, then retry.` : "Model not initialized.";
  }
  syncControls();
});

for (const candidate of candidates) model.add(new Option(candidate.name, candidate.modelId));
model.value = "ink-on-comer-int8";
function showLicense(): void {
  const candidate = getCandidate(model.value);
  element("license").textContent = `${candidate.license.id ?? "License unresolved"} · ${(candidate.files.reduce((sum, item) => sum + item.bytes, 0) / 1_000_000).toFixed(2)} MB model assets. ${candidate.license.note}`;
}
model.onchange = () => { client.unload(); showLicense(); };
showLicense();

function selectedCase() { return sampleCases.find((item) => item.id === sample.value)!; }
function repaint(): void {
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(canvas.width / 960, 0, 0, canvas.height / 136, 0, 0);
  context.save(); context.beginPath(); context.rect(0, 0, 960, 136); context.clip();
  replayInk(context, operations);
  if (active) replayInk(context, [{ kind: "stroke", stroke: { id: "live", rowId: "row-1", width: active.width, points: active.points, bounds: { x: 0, y: 0, width: 960, height: 136 } } }]);
  context.restore();
}
function schedulePaint(): void { if (!raf) raf = requestAnimationFrame(() => { raf = 0; repaint(); }); }
function invalidate(): void { revision++; element("result").textContent = "Ink changed. Recognize again to get a current transcript."; syncControls(); }
function restoreSample(): void {
  active = null;
  operations = [...(fixtures.find((item) => item.sampleId === sample.value)?.operations ?? [])];
  element("prompt").textContent = `Writer ${selectedCase().writer}: ${selectedCase().expected}`;
  invalidate(); repaint();
}
function populateSamples(): void {
  sample.replaceChildren();
  for (const item of sampleCases.filter((item) => item.writer === writer.value && item.split === split.value)) sample.add(new Option(`${item.id} · ${item.expected}`, item.id));
  restoreSample();
}
writer.onchange = populateSamples; split.onchange = populateSamples; sample.onchange = restoreSample;
function counts(): void {
  const dev = fixtures.filter((item) => item.sampleId.startsWith("dev-")).length;
  element("counts").textContent = `Saved: ${dev}/24 development · ${fixtures.length - dev}/50 held out. Export samples before clearing browser storage.`;
}
populateSamples(); counts();

new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * devicePixelRatio));
  if (width === canvas.width && height === canvas.height) return;
  if (active) { active = null; invalidate(); }
  canvas.width = width;
  canvas.height = height;
  // Committed logical ink is unchanged by a display resize; keep its accepted transcript.
  repaint();
}).observe(canvas);

function point(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(960, (event.clientX - rect.left) * 960 / rect.width)), y: Math.max(0, Math.min(136, (event.clientY - rect.top) * 136 / rect.height)), pressure: event.pressure, t: event.timeStamp };
}
canvas.onpointerdown = (event) => {
  if (active || (event.pointerType === "mouse" && event.button !== 0)) return;
  canvas.setPointerCapture(event.pointerId);
  active = { pointerId: event.pointerId, points: [point(event)], width: Number(element<HTMLInputElement>("width").value) };
  invalidate(); schedulePaint();
};
canvas.onpointermove = (event) => {
  if (!active || active.pointerId !== event.pointerId) return;
  if (active.points.length >= 20_000) return;
  const batch = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
  active.points.push(...(batch.length ? batch : [event]).slice(0, 20_000 - active.points.length).map(point));
  schedulePaint();
};
canvas.onpointerup = (event) => {
  if (!active || active.pointerId !== event.pointerId) return;
  const stroke = active;
  const xs = stroke.points.map((item) => item.x), ys = stroke.points.map((item) => item.y);
  operations.push({ kind: "stroke", stroke: { id: crypto.randomUUID(), rowId: "row-1", width: stroke.width, points: stroke.points, bounds: { x: Math.min(...xs) - stroke.width / 2, y: Math.min(...ys) - stroke.width / 2, width: Math.max(...xs) - Math.min(...xs) + stroke.width, height: Math.max(...ys) - Math.min(...ys) + stroke.width } } });
  active = null; canvas.releasePointerCapture(event.pointerId); invalidate(); repaint();
};
const cancel = () => { if (active) { active = null; invalidate(); repaint(); } };
canvas.onpointercancel = cancel; canvas.onlostpointercapture = cancel;
element("undo").onclick = () => { cancel(); operations.pop(); invalidate(); repaint(); };
element("clear").onclick = () => { cancel(); operations = []; invalidate(); repaint(); };

element("save").onclick = () => {
  try {
    if (active || !operations.length) throw new Error("Finish writing a sample before saving.");
    const updated = [...fixtures.filter((item) => item.sampleId !== sample.value), { sampleId: sample.value, capturedAt: new Date().toISOString(), operations: structuredClone(operations) }];
    const bundle = parseFixtures({ schemaVersion: 1, samples: updated });
    localStorage.setItem(storageKey, JSON.stringify(bundle)); fixtures = updated;
    element("capture-status").textContent = `Saved ${sample.value}.`; counts();
  } catch (error) { element("capture-status").textContent = String(error); }
};
element("load").onclick = async () => { try { await client.load(getCandidate(model.value), baseUrl); } catch { /* loading state contains actionable error */ } };
element("unload").onclick = () => client.unload();

async function infer(ink: readonly InkOperation[], rowRevision: number): Promise<RecognitionResponse> {
  return client.recognize({ epoch: 0, rowId: "row-1", rowRevision, operations: ink });
}
element("recognize").onclick = async () => {
  const capturedRevision = revision;
  busy = true; syncControls();
  try {
    const result = await infer(structuredClone(operations), capturedRevision);
    if (revision === capturedRevision) element("result").textContent = JSON.stringify({ transcript: result.transcript, normalizedTranscript: result.normalizedTranscript, outcome: result.outcome, status: describeOutcome(result.outcome), timing: result.timing, visibleInkBounds: result.visibleInkBounds }, null, 2);
  } catch (error) { if (revision === capturedRevision) element("result").textContent = String(error); }
  finally { busy = false; syncControls(); }
};

element("benchmark").onclick = async () => {
  if (active) return;
  busy = true; syncControls(); report = null; element<HTMLButtonElement>("export-report").disabled = true;
  const candidate = getCandidate(model.value);
  const cases = sampleCases.filter((item) => item.split === "development");
  const saved = structuredClone(fixtures);
  const entries: BenchmarkEntry[] = [];
  try {
    const missing = cases.filter((item) => !saved.some((fixture) => fixture.sampleId === item.id));
    if (missing.length) throw new Error(`Capture all 24 development samples first. Missing: ${missing.map((item) => item.id).join(", ")}`);
    element("report").textContent = "Warming model; this inference is excluded from latency statistics…";
    await infer(saved.find((item) => item.sampleId === cases[0].id)!.operations, 0);
    for (const [index, item] of cases.entries()) {
      element("report").textContent = `Running ${index + 1}/24 · ${item.id}`;
      const start = performance.now();
      try {
        const result = await infer(saved.find((fixture) => fixture.sampleId === item.id)!.operations, index + 1);
        if (result.outcome.kind === "unrecognized" && result.outcome.code === "OUTPUT_LIMIT") throw new Error("OUTPUT_LIMIT");
        entries.push({ sampleId: item.id, expected: item.expected, transcript: result.transcript, latencyMs: result.timing.preprocessMs + result.timing.inferenceMs + result.timing.evaluateMs });
      } catch (error) { entries.push({ sampleId: item.id, expected: item.expected, transcript: "", latencyMs: performance.now() - start, error: String(error) }); }
    }
    report = { schemaVersion: 1, recordedAt: new Date().toISOString(), modelId: candidate.modelId, revision: candidate.revision, preprocessing: candidate.adapter === "ink-on" ? "shared quadratic replay; alpha crop; CoMER height 256; number mode; beam 3" : "shared quadratic replay; alpha crop on white; TrOCR processor; INT8 encoder and decoder", userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, split: "development", summary: summarizeBenchmark(entries), samples: saved.filter((item) => cases.some((test) => test.id === item.sampleId)), entries };
    element("report").textContent = JSON.stringify(report, null, 2);
    element<HTMLButtonElement>("export-report").disabled = false;
  } catch (error) { element("report").textContent = String(error); }
  finally { busy = false; syncControls(); }
};

function download(name: string, content: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
element("export-samples").onclick = () => download("calcink-handwriting-samples.json", { schemaVersion: 1, samples: fixtures });
element("export-report").onclick = () => { if (report) download(`calcink-${model.value}-development-report.json`, report); };
element<HTMLInputElement>("import-samples").onchange = async (event) => {
  try {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 20_000_000) throw new Error("Fixture file is too large.");
    const imported = parseFixtures(JSON.parse(await file.text()));
    const merged = new Map(fixtures.map((item) => [item.sampleId, item]));
    for (const item of imported.samples) merged.set(item.sampleId, item);
    const updated = parseFixtures({ schemaVersion: 1, samples: [...merged.values()] });
    localStorage.setItem(storageKey, JSON.stringify(updated)); fixtures = [...updated.samples];
    restoreSample(); counts(); element("capture-status").textContent = "Imported and merged samples.";
  } catch (error) { element("capture-status").textContent = String(error); }
};
window.addEventListener("beforeunload", () => client.unload());
syncControls();
