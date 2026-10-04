import { ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import type { RowSnapshot } from "../document/types";
import type { ModelCandidate } from "./candidates";
import type { CoordinatorCallbacks, RecognitionCoordinator } from "./contracts";
import type { ModelManifest, RecognitionResponse } from "./protocol";
import type { WorkerPort } from "./trial-client";
import { TrialClient } from "./trial-client";

export function createCoordinator(
  document: DocumentStore,
  callbacks: CoordinatorCallbacks,
  options: {
    candidate: ModelCandidate;
    baseUrl: string;
    createWorker?: () => WorkerPort;
    manifest?: ModelManifest;
  },
): RecognitionCoordinator {
  let disposed = false;
  let ready = false;
  let generation = 0;
  let restarts = 0;
  let epoch = document.getEpoch();
  let order = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: { row: RowSnapshot; epoch: number; generation: number } | null =
    null;
  const editing = new Set<string>();
  const pending = new Map<
    string,
    { row: RowSnapshot; epoch: number; due: number; order: number }
  >();
  const client = new TrialClient((state) => {
    if (disposed) return;
    ready = state.kind === "ready";
    callbacks.onModelState(
      state.kind === "idle"
        ? { kind: "unavailable" }
        : state.kind === "loading"
          ? {
              kind: "loading",
              progress: state.progress?.fraction ?? Number.NaN,
              message:
                state.progress?.detail ?? "Loading local recognition model",
            }
          : state.kind === "error"
            ? { kind: "error", code: state.message }
            : state,
    );
  }, options.createWorker);

  function hasInk(row: RowSnapshot): boolean {
    // Skip structurally empty rows here. Adapters composite masked ink in the
    // worker and return an empty result before inference when no pixels survive.
    return row.operations.some((operation) => operation.kind === "stroke");
  }

  function current(row: RowSnapshot, requestEpoch: number): boolean {
    return (
      !disposed &&
      !editing.has(row.rowId) &&
      requestEpoch === document.getEpoch() &&
      row.rowRevision === document.getRow(row.rowId).rowRevision
    );
  }

  function schedule(row: RowSnapshot) {
    pending.delete(row.rowId);
    if (!editing.has(row.rowId) && hasInk(row))
      pending.set(row.rowId, {
        row,
        epoch: document.getEpoch(),
        due: Date.now() + 350,
        order: ++order,
      });
    pump();
  }

  function pump() {
    clearTimeout(timer);
    if (disposed || !ready || active || !pending.size) return;
    const jobs = [...pending.values()].sort((a, b) => b.order - a.order);
    const job = jobs.find((item) => item.due <= Date.now());
    if (!job) {
      timer = setTimeout(
        pump,
        Math.max(0, Math.min(...jobs.map((item) => item.due)) - Date.now()),
      );
      return;
    }
    pending.delete(job.row.rowId);
    if (!current(job.row, job.epoch)) {
      pump();
      return;
    }
    const token = { row: job.row, epoch: job.epoch, generation };
    active = token;
    callbacks.onRecognizing(job.row.rowId);
    void client
      .recognize({ ...job.row, epoch: job.epoch })
      .then((result: RecognitionResponse) => {
        if (
          active === token &&
          ready &&
          result.modelId === options.candidate.modelId &&
          current(job.row, job.epoch)
        )
          callbacks.onResult(result);
      })
      .catch((error: unknown) => {
        if (disposed || token.generation !== generation) return;
        const code =
          error instanceof Error ? error.message : "RECOGNITION_FAILED";
        if (current(job.row, job.epoch))
          callbacks.onRowError(job.row.rowId, code);
        if (code === "INFERENCE_TIMEOUT" && restarts < 1) {
          restarts++;
          initialize();
        }
      })
      .finally(() => {
        if (active === token) {
          active = null;
          pump();
        }
      });
  }

  function initialize() {
    if (disposed) return;
    generation++;
    active = null;
    ready = false;
    clearTimeout(timer);
    pending.clear();
    for (const row of ROWS) callbacks.onClear(row.id);
    const run = generation;
    void client
      .load(options.candidate, options.baseUrl, options.manifest)
      .then(() => {
        if (disposed || generation !== run) return;
        for (const row of document.getRows()) schedule(row);
      })
      .catch(() => {
        /* TrialClient reports initialization failures through onModelState. */
      });
  }

  const unsubscribe = document.subscribe((event) => {
    if (event.epoch !== epoch) {
      epoch = event.epoch;
      pending.clear();
      for (const row of ROWS) callbacks.onClear(row.id);
    }
    for (const row of event.rows) {
      pending.delete(row.rowId);
      callbacks.onClear(row.rowId);
      if (event.phase === "begin") editing.add(row.rowId);
      else {
        editing.delete(row.rowId);
        schedule(row);
      }
    }
    pump();
  });
  initialize();
  return {
    retry() {
      restarts = 0;
      initialize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe();
      clearTimeout(timer);
      pending.clear();
      active = null;
      client.unload();
    },
  };
}
