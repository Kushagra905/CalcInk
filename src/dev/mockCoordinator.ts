import { ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import type { RowSnapshot } from "../document/types";
import type {
  CoordinatorCallbacks,
  RecognitionCoordinator,
  RevisionKey,
  WorkerReply,
} from "../recognition/contracts";

export const MOCK_MODEL_ID = "CALCINK_DEVELOPMENT_MOCK";
export type MockBehavior = "normal" | "error" | "init-error" | "out-of-order";
type WorkerPort = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror"
>;

export function connectRecognition(
  document: DocumentStore,
  callbacks: CoordinatorCallbacks,
  options: {
    worker?: WorkerPort;
    behavior?: MockBehavior;
    delayMs?: number;
  } = {},
): RecognitionCoordinator {
  const worker =
    options.worker ??
    new Worker(new URL("./mock.worker.ts", import.meta.url), {
      type: "module",
    });
  const query = new URLSearchParams(globalThis.location?.search);
  const behavior = options.behavior ?? query.get("mock") ?? "normal";
  let disposed = false;
  let ready = false;
  let requestId = 0;
  let epoch = document.getEpoch();
  const latest = new Map<string, RevisionKey>();
  const editing = new Set<string>();

  function recognize(row: RowSnapshot) {
    if (!ready || editing.has(row.rowId) || !row.operations.length) return;
    const request = {
      epoch: document.getEpoch(),
      rowId: row.rowId,
      rowRevision: row.rowRevision,
      requestId: ++requestId,
    };
    latest.set(row.rowId, request);
    callbacks.onRecognizing(row.rowId);
    // ponytail: mock overlaps jobs to exercise stale replies; B adds the bounded production queue in Phase 3.
    worker.postMessage({
      type: "RECOGNIZE",
      ...request,
      operations: row.operations,
      fixture: {
        behavior,
        delayMs: options.delayMs ?? 180,
        transcript: "18+4×3=",
      },
    });
  }

  function current(request: RevisionKey) {
    return (
      !disposed &&
      ready &&
      !editing.has(request.rowId) &&
      ROWS.some((row) => row.id === request.rowId) &&
      request.epoch === document.getEpoch() &&
      request.rowRevision === document.getRow(request.rowId).rowRevision &&
      request.requestId === latest.get(request.rowId)?.requestId
    );
  }

  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    if (disposed) return;
    if (data.type === "PROGRESS") {
      callbacks.onModelState({
        kind: "loading",
        progress: data.progress,
        message: data.message,
      });
    } else if (data.type === "READY" && data.modelId === MOCK_MODEL_ID) {
      ready = true;
      callbacks.onModelState({ kind: "ready", modelId: data.modelId });
      document.getRows().forEach(recognize);
    } else if (
      data.type === "RESULT" &&
      data.result.modelId === MOCK_MODEL_ID &&
      current(data.result)
    ) {
      callbacks.onResult(data.result);
    } else if (data.type === "ERROR" && data.modelId === MOCK_MODEL_ID) {
      if (data.request && current(data.request))
        callbacks.onRowError(data.request.rowId, data.code);
      else if (!data.request) {
        ready = false;
        latest.clear();
        callbacks.onModelState({ kind: "error", code: data.code });
      }
    }
  };
  worker.onerror = () => {
    if (disposed) return;
    ready = false;
    latest.clear();
    callbacks.onModelState({ kind: "error", code: "WORKER_FAILED" });
  };

  const unsubscribe = document.subscribe((event) => {
    if (event.epoch !== epoch) {
      epoch = event.epoch;
      latest.clear();
      for (const row of ROWS) callbacks.onClear(row.id);
    }
    for (const row of event.rows) {
      if (event.phase === "begin") editing.add(row.rowId);
      else editing.delete(row.rowId);
      latest.delete(row.rowId);
      callbacks.onClear(row.rowId);
      if (event.phase !== "begin") recognize(row);
    }
  });

  function retry() {
    if (disposed) return;
    ready = false;
    latest.clear();
    for (const row of ROWS) callbacks.onClear(row.id);
    callbacks.onModelState({
      kind: "loading",
      progress: 0,
      message: "Starting the development mock",
    });
    worker.postMessage({
      type: "INIT",
      adapter: "development-mock",
      manifest: { modelId: MOCK_MODEL_ID, revision: "fixture-v1", files: [] },
      baseUrl: import.meta.env.BASE_URL,
      decoderLimits: { maxTokens: 128 },
      fixture: { behavior },
    });
  }
  retry();
  return {
    retry,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      latest.clear();
      worker.onmessage = worker.onerror = null;
      worker.postMessage({ type: "DISPOSE" });
      worker.terminate();
    },
  };
}
