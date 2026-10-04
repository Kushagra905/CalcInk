import { sampleCases } from "../../tools/model-lab/cases";
import { parseFixtures } from "../../tools/model-lab/fixtures";
import { getRowConfig, PAGE } from "../document/rows";
import type { InkOperation, RowSnapshot } from "../document/types";

export type Dataset = "development" | "held-out";
export type WriterSlot = "A" | "B";
export type InputDevice = "mouse" | "pen" | "touch";

// Reference values only; the expression list and IDs come from B's shared trial plan.
const VALUES = {
  development: [
    "30",
    "9",
    "5",
    "1.75",
    "22",
    "579",
    "72",
    "8",
    "-18",
    "24",
    "12",
    "Undefined",
  ],
  "held-out": [
    "37",
    "2",
    "-8",
    "3",
    "333",
    "411",
    "42",
    "9",
    "-28",
    "12",
    "16",
    "Undefined",
    "0",
    "134",
    "2.3",
    "7.5",
    "-2",
    "901",
    "34",
    "40",
    "1.1",
    "-6",
    "545",
    "9",
    "11",
  ],
} as const;

export function samplePlan(dataset: Dataset, writer: WriterSlot = "A") {
  return sampleCases
    .filter((item) => item.split === dataset && item.writer === writer)
    .map((item, index) => ({
      id: `${dataset}-${index + 1}`,
      sampleId: item.id,
      transcript: item.expected,
      value: VALUES[dataset][index],
      spacing: index === 9 || index === 10 ? "cramped" : "normal",
    }));
}

export interface HandwritingSample {
  version: 1;
  id: string;
  sampleId: string;
  sampleType: "handwritten";
  provenance: "writer-confirmed";
  dataset: Dataset;
  writerSlot: WriterSlot;
  writer: string;
  promptId: string;
  expectedTranscript: string;
  expectedValue: string;
  spacing: string;
  page: typeof PAGE;
  rowId: string;
  operations: readonly InkOperation[];
  device: {
    input: InputDevice;
    description: string;
    userAgent: string;
    dpr: number;
  };
  capturedAt: string;
}

export function createHandwritingSample(
  row: RowSnapshot,
  options: Pick<
    HandwritingSample,
    "dataset" | "writerSlot" | "writer" | "promptId" | "device"
  >,
): HandwritingSample {
  const prompt = samplePlan(options.dataset, options.writerSlot).find(
    (item) => item.id === options.promptId,
  );
  if (!prompt || !options.writer.trim() || !options.device.description.trim()) {
    throw new Error("Choose a prompt and enter the writer and device details.");
  }
  if (!row.operations.length)
    throw new Error("Draw the displayed expression first.");
  if (
    row.operations.some(
      (operation) =>
        operation.kind !== "stroke" ||
        operation.stroke.id.startsWith("fixture-"),
    )
  ) {
    throw new Error(
      "Synthetic or mixed ink cannot count as a handwriting sample. Reset and write it yourself.",
    );
  }
  return {
    ...options,
    version: 1,
    id: prompt.sampleId,
    sampleId: prompt.sampleId,
    sampleType: "handwritten",
    provenance: "writer-confirmed",
    writer: options.writer.trim(),
    expectedTranscript: prompt.transcript,
    expectedValue: prompt.value,
    spacing: prompt.spacing,
    page: PAGE,
    rowId: row.rowId,
    operations: row.operations,
    capturedAt: new Date().toISOString(),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Keep the earlier expression plan's database intact; never relabel its strokes.
    const request = indexedDB.open("calcink-handwriting-v2", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore("samples", { keyPath: "id" });
    };
    request.onsuccess = () =>
      blocked ? request.result.close() : resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other capture tabs and try again."));
    };
  });
}

export function exportSamples(
  samples: readonly HandwritingSample[],
  dataset: Dataset,
) {
  const records = samples
    .filter((sample) => sample.dataset === dataset)
    .map((sample) => {
      if (
        sample.id !== sample.sampleId ||
        !sampleCases.some(
          (item) =>
            item.id === sample.sampleId &&
            item.split === dataset &&
            item.writer === sample.writerSlot &&
            item.expected === sample.expectedTranscript,
        )
      )
        throw new Error(
          "Sample labels do not match the shared expression plan",
        );
      const top = getRowConfig(sample.rowId).top;
      return {
        ...sample,
        captureRowId: sample.rowId,
        rowId: "row-1",
        operations: sample.operations.map((operation): InkOperation => {
          const ink =
            operation.kind === "stroke" ? operation.stroke : operation.mask;
          const geometry = {
            ...ink,
            rowId: "row-1",
            points: ink.points.map((point) => ({ ...point, y: point.y - top })),
          };
          return operation.kind === "stroke"
            ? {
                kind: "stroke",
                stroke: {
                  ...operation.stroke,
                  ...geometry,
                  bounds: {
                    ...operation.stroke.bounds,
                    y: operation.stroke.bounds.y - top,
                  },
                },
              }
            : { kind: "pixel-mask", mask: { ...operation.mask, ...geometry } };
        }),
      };
    });
  const targetCount = samplePlan(dataset).length * 2;
  const bundle = {
    schemaVersion: 1 as const,
    dataset,
    targetCount,
    complete: records.length === targetCount,
    samples: records,
  };
  // Exercise the actual lab boundary, including row coordinates and sample IDs.
  parseFixtures(bundle);
  return bundle;
}

export async function readSamples(): Promise<HandwritingSample[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("samples");
    const request = transaction.objectStore("samples").getAll();
    request.onsuccess = () => resolve(request.result as HandwritingSample[]);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = transaction.onabort = () => database.close();
  });
}

export async function saveSample(sample: HandwritingSample): Promise<void> {
  exportSamples([sample], sample.dataset);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("samples", "readwrite");
    const store = transaction.objectStore("samples");
    // ponytail: scan the 74-sample plan for reused ink; index stroke IDs if collections grow.
    const request = store.getAll();
    let failure: Error | null = null;
    request.onsuccess = () => {
      try {
        const existing = request.result as HandwritingSample[];
        const ids = new Set(
          sample.operations.map((operation) =>
            operation.kind === "stroke"
              ? operation.stroke.id
              : operation.mask.id,
          ),
        );
        const duplicate = existing.some(
          (other) =>
            other.id !== sample.id &&
            other.operations.some((operation) =>
              ids.has(
                operation.kind === "stroke"
                  ? operation.stroke.id
                  : operation.mask.id,
              ),
            ),
        );
        const wrongWriter = existing.some((other) =>
          other.writerSlot === sample.writerSlot
            ? other.writer !== sample.writer
            : other.writer.toLocaleLowerCase() ===
              sample.writer.toLocaleLowerCase(),
        );
        if (duplicate || wrongWriter) {
          throw new Error(
            duplicate
              ? "This ink is already saved for another sample. Reset and draw a new sample."
              : "Use two distinct writer labels and keep each label unchanged during collection.",
          );
        } else store.put(sample);
      } catch (error) {
        failure =
          error instanceof Error
            ? error
            : new Error("Could not save this sample.");
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(
        failure ??
          transaction.error ??
          new Error("The sample was not saved. Your ink is preserved."),
      );
    };
  });
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
