import { useEffect, useRef, useState } from "react";
import { connectRecognition } from "#recognition";
import { FixturePanel } from "../dev/FixturePanel";
import { ROWS } from "../document/rows";
import { createDocumentStore } from "../document/store";
import type { InkTool } from "../ink/eraser";
import { connectOffline, type OfflineState } from "../offline/client";
import { getCandidate, selectedModelId } from "../recognition/candidates";
import type {
  ModelState,
  RecognitionCoordinator,
} from "../recognition/contracts";
import { Notebook, type RowFeedback } from "./Notebook";

const MOCK_MODE = import.meta.env.DEV && import.meta.env.MODE === "mock";
const selectedModel = getCandidate(selectedModelId);

function emptyFeedback(): Record<string, RowFeedback> {
  return Object.fromEntries(
    ROWS.map((row) => [row.id, { kind: "idle", transcript: "" }]),
  );
}

export function App() {
  const [document] = useState(createDocumentStore);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<InkTool>("draw");
  const [eraserSize, setEraserSize] = useState(12);
  const [error, setError] = useState("");
  const [model, setModel] = useState<ModelState>({ kind: "unavailable" });
  const [feedback, setFeedback] = useState(emptyFeedback);
  const [heldOutCapture, setHeldOutCapture] = useState(false);
  const [capturePrompt, setCapturePrompt] = useState("");
  const [history, setHistory] = useState(document.getHistoryState);
  const coordinator = useRef<RecognitionCoordinator | null>(null);
  const [offline, setOffline] = useState<OfflineState>({ kind: "unavailable" });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const offlineConnection = useRef<ReturnType<typeof connectOffline> | null>(
    null,
  );
  const capacity = document.getCapacityState();

  useEffect(
    () => document.subscribe(() => setHistory(document.getHistoryState())),
    [document],
  );

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const connection = connectOffline(
      setOffline,
      () => setUpdateAvailable(true),
      () => !document.getHistoryState().canClear,
    );
    offlineConnection.current = connection;
    return () => {
      offlineConnection.current = null;
      connection.dispose();
    };
  }, [document]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false])",
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) document.redo();
      else document.undo();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [document]);

  useEffect(() => {
    if (heldOutCapture) {
      setFeedback(emptyFeedback());
      return;
    }
    function update(rowId: string, state: RowFeedback) {
      setFeedback((previous) => ({ ...previous, [rowId]: state }));
    }
    const connection = connectRecognition(document, {
      onModelState: (state) => {
        setModel(state);
        if (state.kind !== "ready") setFeedback(emptyFeedback());
      },
      onClear: (rowId) => update(rowId, { kind: "idle", transcript: "" }),
      onRecognizing: (rowId) =>
        update(rowId, { kind: "recognizing", transcript: "" }),
      onResult: (result) =>
        update(result.rowId, {
          kind: "ready",
          transcript: result.transcript,
          result,
        }),
      onRowError: (rowId, code) =>
        update(rowId, {
          kind: "error",
          transcript: `${code}. Retry recognition.`,
        }),
    });
    coordinator.current = connection;
    return () => {
      coordinator.current = null;
      connection.dispose();
    };
  }, [document, heldOutCapture]);

  const failed =
    !heldOutCapture &&
    (model.kind === "error" ||
      Object.values(feedback).some((row) => row.kind === "error"));
  const modelProgress =
    model.kind === "loading" && Number.isFinite(model.progress)
      ? Math.max(0, Math.min(1, model.progress))
      : undefined;
  return (
    <main className="workspace">
      <header className="app-header">
        <a className="wordmark" href="./" aria-label="CalcInk home">
          Calc<span>Ink</span>
          <span className="brand-dot">.</span>
        </a>
        <span className={`model-badge ${model.kind}`}>
          <span className="status-dot" />
          {heldOutCapture
            ? "Capture only"
            : model.kind === "ready"
              ? MOCK_MODE
                ? "Mock ready"
                : "Model ready"
              : model.kind === "loading"
                ? "Loading"
                : model.kind === "error"
                  ? "Retry needed"
                  : "Model not connected"}
        </span>
      </header>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">A LITTLE SPACE FOR YOUR THINKING</p>
        <h1 id="page-title">Arithmetic, in your own hand.</h1>
        <p id="writing-help">
          One expression per row. Finish with <strong>=</strong> and leave room
          for the answer.
        </p>
      </section>
      {MOCK_MODE && (
        <p className="mock-notice">
          <strong>Development mock.</strong> Transcripts are fixed fixtures, not
          handwriting recognition. Answers use the fixed fixture transcript.
        </p>
      )}
      <section className="notebook-tools" aria-label="Notebook tools">
        <fieldset className="tool-group" aria-label="Drawing tool">
          {(
            [
              ["draw", "Pen"],
              ["erase-stroke", "Stroke eraser"],
              ["erase-pixel", "Pixel eraser"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`tool ${tool === kind ? "active" : ""}`}
              aria-pressed={tool === kind}
              disabled={capacity.full && kind !== "erase-stroke"}
              onClick={() => setTool(kind)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <label className="pen-width">
          {tool === "draw" ? "Width" : "Eraser size"}{" "}
          <input
            type="range"
            min={tool === "draw" ? 1 : 2}
            max={tool === "draw" ? 12 : 80}
            value={tool === "draw" ? width : eraserSize}
            onChange={(event) =>
              tool === "draw"
                ? setWidth(Number(event.target.value))
                : setEraserSize(Number(event.target.value))
            }
          />{" "}
          <output>{tool === "draw" ? width : eraserSize}</output>
        </label>
        <fieldset
          className="tool-group history-tools"
          aria-label="Edit history"
        >
          {(
            [
              ["Undo", history.canUndo, () => document.undo()],
              ["Redo", history.canRedo, () => document.redo()],
              ["Clear", history.canClear, () => document.clear()],
            ] as const
          ).map(([tool, enabled, action]) => (
            <button
              key={tool}
              type="button"
              className="tool"
              disabled={!enabled}
              onClick={action}
              title={
                tool === "Clear"
                  ? "Clear all rows (undoable)"
                  : `${tool} the last edit`
              }
            >
              {tool}
            </button>
          ))}
        </fieldset>
      </section>
      {MOCK_MODE && <p className="capture-writing-prompt">{capturePrompt}</p>}
      <Notebook
        document={document}
        width={width}
        tool={tool}
        eraserRadius={eraserSize / 2}
        feedback={feedback}
        onError={setError}
      />
      <div className="page-footer">
        <span>Three rows. Plenty of possibilities.</span>
        <span>Your ink stays in this tab; reloading clears it.</span>
      </div>
      {import.meta.env.PROD && (
        <p className="model-attribution">
          Recognition uses {selectedModel.name}.{" "}
          <a href="./model-attribution.txt">Model attribution</a>
          {" · "}
          <a href="./model-license.txt">{selectedModel.license.id} license</a>
        </p>
      )}
      {capacity.full && (
        <p role="status" className="input-error">
          Page capacity reached. Use the stroke eraser, Clear or Undo to make
          room; existing ink is preserved.
        </p>
      )}
      {MOCK_MODE && (
        <a className="capture-link" href="#capture-title">
          Return to sample controls ↓
        </a>
      )}
      {import.meta.env.PROD && (
        <section className="offline-panel" aria-label="Offline availability">
          <div role="status" data-testid="offline-status">
            {offline.kind === "cached" ? (
              model.kind === "ready" ? (
                "Ready offline"
              ) : (
                "Offline files verified. Waiting for recognition to initialize."
              )
            ) : offline.kind === "preparing" ? (
              <>
                <progress
                  max="1"
                  value={offline.progress}
                  aria-label="Offline preparation"
                />{" "}
                {offline.message}
              </>
            ) : offline.kind === "error" ? (
              offline.message
            ) : (
              "Offline storage is unavailable. Keep this tab online."
            )}
          </div>
          {offline.kind === "error" && (
            <button
              type="button"
              className="button"
              onClick={() => {
                offlineConnection.current?.retry();
                if (model.kind === "error") coordinator.current?.retry();
              }}
            >
              Retry offline preparation
            </button>
          )}
          {updateAvailable && (
            <div className="offline-update">
              <span>
                Update available. Finish or clear your ink before reloading.
              </span>
              <button
                type="button"
                className="button"
                disabled={history.canClear}
                onClick={() => offlineConnection.current?.update()}
              >
                Reload to update
              </button>
            </div>
          )}
        </section>
      )}
      <div className="model-message" role="status">
        {heldOutCapture &&
          "Recognition is paused to keep held-out samples out of the model trial."}
        {!heldOutCapture &&
          model.kind === "unavailable" &&
          "The notebook is ready for ink. A local recognition model has not been connected yet."}
        {!heldOutCapture && model.kind === "loading" && (
          <>
            <progress
              max="1"
              value={modelProgress}
              aria-label="Model loading"
            />{" "}
            <span>
              {modelProgress !== undefined &&
                `${Math.round(modelProgress * 100)}% — `}
              {model.message} You can keep writing while recognition loads.
            </span>
          </>
        )}
        {!heldOutCapture && model.kind === "error" && (
          <span role="alert">
            {model.code.startsWith("MODEL_LICENSE_UNRESOLVED")
              ? "TrOCR needs explicit weight-license evidence before loading. Your ink is preserved."
              : `Recognition could not start (${model.code}). Your ink is preserved; try again.`}
          </span>
        )}
        {failed && (
          <button
            type="button"
            className="button"
            onClick={() => coordinator.current?.retry()}
          >
            Retry recognition
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="input-error">
          {error}
        </p>
      )}
      {MOCK_MODE && (
        <FixturePanel
          document={document}
          onHeldOutChange={setHeldOutCapture}
          onPromptChange={setCapturePrompt}
        />
      )}
    </main>
  );
}
