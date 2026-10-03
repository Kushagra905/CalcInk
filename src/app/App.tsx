import { useEffect, useRef, useState } from "react";
import { connectRecognition } from "#recognition";
import { FixturePanel } from "../dev/FixturePanel";
import { ROWS } from "../document/rows";
import { createDocumentStore } from "../document/store";
import type {
  ModelState,
  RecognitionCoordinator,
} from "../recognition/contracts";
import { Notebook, type RowFeedback } from "./Notebook";

const MOCK_MODE = import.meta.env.DEV && import.meta.env.MODE === "mock";

function emptyFeedback(): Record<string, RowFeedback> {
  return Object.fromEntries(
    ROWS.map((row) => [row.id, { kind: "idle", transcript: "" }]),
  );
}

export function App() {
  const [document] = useState(createDocumentStore);
  const [width, setWidth] = useState(3);
  const [error, setError] = useState("");
  const [model, setModel] = useState<ModelState>({ kind: "unavailable" });
  const [feedback, setFeedback] = useState(emptyFeedback);
  const [heldOutCapture, setHeldOutCapture] = useState(false);
  const [capturePrompt, setCapturePrompt] = useState("");
  const [history, setHistory] = useState(document.getHistoryState);
  const coordinator = useRef<RecognitionCoordinator | null>(null);

  useEffect(
    () => document.subscribe(() => setHistory(document.getHistoryState())),
    [document],
  );

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
        update(result.rowId, { kind: "ready", transcript: result.transcript }),
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
          handwriting recognition. No answers are calculated.
        </p>
      )}
      <section className="notebook-tools" aria-label="Notebook tools">
        <fieldset className="tool-group" aria-label="Drawing tool">
          <button type="button" className="tool active" aria-pressed="true">
            Pen
          </button>
          <button
            type="button"
            className="tool"
            disabled
            title="Stroke erasing is not available yet"
          >
            Stroke eraser
          </button>
          <button
            type="button"
            className="tool"
            disabled
            title="Pixel erasing is not available yet"
          >
            Pixel eraser
          </button>
        </fieldset>
        <label className="pen-width">
          Width{" "}
          <input
            type="range"
            min="1"
            max="12"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />{" "}
          <output>{width}</output>
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
        feedback={feedback}
        onError={setError}
      />
      <div className="page-footer">
        <span>Three rows. Plenty of possibilities.</span>
        <span>Your ink stays in this tab; reloading clears it.</span>
      </div>
      {MOCK_MODE && (
        <a className="capture-link" href="#capture-title">
          Return to sample controls ↓
        </a>
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
            Recognition could not start. Your ink is preserved; try again.
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
