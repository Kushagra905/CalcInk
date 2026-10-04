import "./style.css";
import { createDocumentStore } from "../../src/document/store";
import { describeOutcome } from "../../src/math/status";
import {
  getCandidate,
  selectedModelId,
} from "../../src/recognition/candidates";
import { createCoordinator } from "../../src/recognition/coordinator";
import type { RecognitionCoordinator } from "../../src/recognition/contracts";
import type { RecognitionResponse } from "../../src/recognition/protocol";
import {
  parseHeldOut,
  summarizeFinal,
  validateFinalReport,
} from "./evaluation";
import type {
  EvaluationBuild,
  FinalEntry,
  FinalReport,
  GenuineSample,
} from "./evaluation";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const run = element<HTMLButtonElement>("run");
const exportButton = element<HTMLButtonElement>("export");
const files = element<HTMLInputElement>("files");
const confirmation = element<HTMLInputElement>("confirm");
const device = element<HTMLInputElement>("device");
const os = element<HTMLInputElement>("os");
const status = element("status");
let samples: readonly GenuineSample[] = [];
let busy = false;
let report: FinalReport | null = null;
let coordinator: RecognitionCoordinator | null = null;
const baseUrl = new URL(import.meta.env.BASE_URL, location.origin).href;

function sync() {
  run.disabled =
    busy ||
    samples.length !== 50 ||
    !confirmation.checked ||
    !device.value.trim() ||
    !os.value.trim();
}
for (const input of [confirmation, device, os])
  input.addEventListener("input", sync);
files.onchange = async () => {
  samples = [];
  report = null;
  exportButton.disabled = true;
  sync();
  try {
    const selected = [...(files.files ?? [])];
    if (
      !selected.length ||
      selected.length > 2 ||
      selected.some((file) => file.size > 20_000_000)
    )
      throw new Error(
        "Choose one combined export or two writer exports, at most 20 MB each.",
      );
    const bundles = await Promise.all(
      selected.map(async (file) => JSON.parse(await file.text())),
    );
    if (
      bundles.some(
        (bundle) =>
          bundle.dataset !== "held-out" || !Array.isArray(bundle.samples),
      )
    )
      throw new Error("Choose held-out exports from the guided capture panel.");
    samples = parseHeldOut({
      schemaVersion: 1,
      dataset: "held-out",
      samples: bundles.flatMap((bundle) => bundle.samples),
    });
    element("import-status").textContent =
      "50 samples validated: 25 per writer. Writer confirmation does not independently prove human provenance.";
  } catch (error) {
    element("import-status").textContent = String(error);
  }
  sync();
};

async function digest(value: unknown) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

run.onclick = async () => {
  if (run.disabled || document.visibilityState !== "visible") return;
  busy = true;
  files.disabled = confirmation.disabled = device.disabled = os.disabled = true;
  sync();
  report = null;
  exportButton.disabled = true;
  const candidate = getCandidate(selectedModelId);
  const store = createDocumentStore();
  let pending: {
    revision: number;
    epoch: number;
    resolve: (value: RecognitionResponse) => void;
    reject: (error: Error) => void;
  } | null = null;
  let interrupted = false;
  let becameReady = false;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};
  const visibility = () => {
    if (document.visibilityState !== "visible") {
      interrupted = true;
      pending?.reject(
        new Error(
          "TAB_HIDDEN: discard this run and repeat without switching tabs.",
        ),
      );
      rejectReady(new Error("TAB_HIDDEN"));
    }
  };
  document.addEventListener("visibilitychange", visibility);
  try {
    const response = await fetch(new URL("evaluation-build.json", baseUrl));
    if (!response.ok)
      throw new Error(
        "Build metadata missing. Run npm run build:lab, then preview:lab. Do not benchmark the development server.",
      );
    const build = (await response.json()) as EvaluationBuild;
    if (
      build.modelId !== candidate.modelId ||
      build.revision !== candidate.revision
    )
      throw new Error("EVALUATION_BUILD_MISMATCH");
    if (interrupted) throw new Error("TAB_HIDDEN");
    const initializationStart = performance.now();
    const initialized = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    coordinator = createCoordinator(
      store,
      {
        onModelState(state) {
          if (state.kind === "error") {
            const error = new Error(state.code);
            rejectReady(error);
            pending?.reject(error);
          }
          if (state.kind === "ready") {
            becameReady = true;
            resolveReady();
          }
          if (state.kind === "loading") {
            status.textContent =
              state.message ?? "Initializing local WASM model";
            if (becameReady)
              pending?.reject(
                new Error("MODEL_REINITIALIZED: warmed run is invalid"),
              );
          }
        },
        onClear() {},
        onRecognizing() {},
        onRowError(_rowId, code) {
          pending?.reject(new Error(code));
        },
        onResult(result) {
          const job = pending;
          if (
            !job ||
            result.rowRevision !== job.revision ||
            result.epoch !== job.epoch
          )
            return;
          element("result").textContent = JSON.stringify(
            {
              raw: result.transcript,
              canonical: result.normalizedTranscript,
              outcome: describeOutcome(result.outcome),
              timing: result.timing,
            },
            null,
            2,
          );
          requestAnimationFrame(() =>
            interrupted
              ? job.reject(new Error("TAB_HIDDEN"))
              : job.resolve(result),
          );
        },
      },
      { candidate, baseUrl },
    );
    await initialized;
    const initializationMs = performance.now() - initializationStart;
    const infer = async (sample: GenuineSample) => {
      if (interrupted) throw new Error("TAB_HIDDEN");
      store.reset();
      const promise = new Promise<RecognitionResponse>((resolve, reject) => {
        pending = {
          epoch: store.getEpoch(),
          revision: store.getRow("row-1").rowRevision + 2,
          resolve,
          reject,
        };
      });
      store.begin("row-1");
      const start = performance.now();
      const timer = setTimeout(
        () => pending?.reject(new Error("FINAL_EVALUATION_TIMEOUT")),
        15_000,
      );
      try {
        store.commit(structuredClone(sample.operations));
        return {
          result: await promise,
          totalUpdateMs: performance.now() - start,
        };
      } finally {
        clearTimeout(timer);
        pending = null;
      }
    };
    status.textContent =
      "Warming up; this result is excluded from scoring and latency.";
    await infer(samples[0]);
    const entries: FinalEntry[] = [];
    for (const [index, sample] of samples.entries()) {
      status.textContent = `Evaluating ${index + 1}/50: ${sample.sampleId}`;
      // A fatal runtime/visibility failure aborts the batch, rather than inventing unrun entries.
      entries.push({ sampleId: sample.sampleId, ...(await infer(sample)) });
    }
    const finished: FinalReport = {
      schemaVersion: 2,
      split: "held-out",
      recordedAt: new Date().toISOString(),
      build,
      environment: {
        device: device.value.trim(),
        os: os.value.trim(),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        dpr: devicePixelRatio,
        headless: /Headless/i.test(navigator.userAgent),
      },
      confirmation: {
        genuine: true,
        heldOutUnusedForTuning: true,
        manualCorrections: 0,
      },
      fixturesSha256: await digest(samples),
      samples,
      initializationMs,
      warmupExcluded: true,
      latencyMethod: "document-commit-to-result-next-raf",
      entries,
    };
    validateFinalReport(finished, build);
    report = finished;
    element("report").textContent = JSON.stringify(
      summarizeFinal(entries),
      null,
      2,
    );
    status.textContent =
      "Completed all 50 samples. Export the report and independently verify it with npm run phase6:report.";
    exportButton.disabled = false;
  } catch (error) {
    status.textContent = String(error);
  } finally {
    coordinator?.dispose();
    coordinator = null;
    document.removeEventListener("visibilitychange", visibility);
    busy = false;
    files.disabled =
      confirmation.disabled =
      device.disabled =
      os.disabled =
        false;
    sync();
  }
};
exportButton.onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "calcink-held-out-final-report.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("beforeunload", () => coordinator?.dispose());
sync();
