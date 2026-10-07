import { useEffect, useRef, useState } from "react";
import { connectRecognition } from "#recognition";
import { FixturePanel } from "../dev/FixturePanel";
import { createNotebookCollection, MAX_PAGES } from "../document/notebooks";
import {
  connectNotebookStorage,
  type SaveState,
} from "../document/persistence";
import { GROUPS } from "../document/rows";
import type { InkTool } from "../ink/eraser";
import { connectOffline, type OfflineState } from "../offline/client";
import { getCandidate, selectedModelId } from "../recognition/candidates";
import type {
  ModelState,
  RecognitionCoordinator,
} from "../recognition/contracts";
import { downloadBlob, exportPagePng } from "./export";
import { Icon } from "./Icon";
import { Notebook, type RowFeedback } from "./Notebook";

const MOCK_MODE = import.meta.env.DEV && import.meta.env.MODE === "mock";
const selectedModel = getCandidate(selectedModelId);
function emptyFeedback(): Record<string, RowFeedback> {
  return Object.fromEntries(
    GROUPS.map((row) => [row.id, { kind: "idle", transcript: "" }]),
  );
}
export function App() {
  const [collection] = useState(createNotebookCollection);
  const document = collection.document;
  const [pages, setPages] = useState(collection.getInfo);
  const [saving, setSaving] = useState<SaveState>({
    kind: "loading",
    message: "Opening your notebook…",
  });
  const storage = useRef<ReturnType<typeof connectNotebookStorage> | null>(
    null,
  );
  const importFile = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(3);
  const [tool, setTool] = useState<InkTool>("draw");
  const [pan, setPan] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [navigation, setNavigation] = useState(true);
  const [focus, setFocus] = useState(false);
  const [eraserSize, setEraserSize] = useState(12);
  const [error, setError] = useState("");
  const [model, setModel] = useState<ModelState>({ kind: "unavailable" });
  const [feedback, setFeedback] = useState(emptyFeedback);
  const [heldOutCapture, setHeldOutCapture] = useState(false);
  const captureOnly = useRef(false);
  const [capturePrompt, setCapturePrompt] = useState("");
  const [history, setHistory] = useState(document.getHistoryState);
  const coordinator = useRef<RecognitionCoordinator | null>(null);
  const [offline, setOffline] = useState<OfflineState>({ kind: "unavailable" });
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const offlineConnection = useRef<ReturnType<typeof connectOffline> | null>(
    null,
  );
  const capacity = document.getCapacityState();
  const pageIndex = pages.pages.findIndex(
    (page) => page.id === pages.activePageId,
  );
  const activePage = pages.pages[pageIndex];
  const opening = saving.kind === "loading";
  const hasNavigation = navigation && !focus;

  useEffect(
    () =>
      collection.subscribe(() => {
        setPages(collection.getInfo());
        setHistory(document.getHistoryState());
      }),
    [collection, document],
  );
  useEffect(() => {
    const connection = connectNotebookStorage(
      collection,
      setSaving,
      () => !captureOnly.current,
    );
    storage.current = connection;
    return () => {
      storage.current = null;
      connection.dispose();
    };
  }, [collection]);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const connection = connectOffline(
      setOffline,
      () => setUpdateAvailable(true),
      () => !collection.hasInk(),
    );
    offlineConnection.current = connection;
    return () => {
      offlineConnection.current = null;
      connection.dispose();
    };
  }, [collection]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
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
  const modelLabel = heldOutCapture
    ? "Capture only"
    : model.kind === "ready"
      ? MOCK_MODE
        ? "Mock ready"
        : "Model ready"
      : model.kind === "loading"
        ? "Loading"
        : model.kind === "error"
          ? "Retry needed"
          : "Model not connected";
  async function exportImage() {
    try {
      await exportPagePng(document, activePage.title, feedback);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not export page.",
      );
    }
  }
  function backup() {
    downloadBlob(
      new Blob([JSON.stringify(collection.serialize())], {
        type: "application/json",
      }),
      "calcink-notebook.json",
    );
  }
  function choosePage(id: string) {
    collection.activate(id);
    setError("");
  }
  async function restoreBackup(file: File) {
    try {
      if (file.size > 256 * 1024 * 1024)
        throw new Error("This backup is too large to open safely.");
      const data: unknown = JSON.parse(await file.text());
      // Fully validate before asking to replace the user's current notebook.
      const validation = createNotebookCollection();
      validation.restore(data);
      if (
        collection.hasInk() &&
        !window.confirm(
          "Replace this notebook with the backup? Download a backup of your current notebook first.",
        )
      )
        return;
      collection.restore(validation.serialize());
      setError("");
    } catch (error) {
      setError(
        `Could not restore backup: ${error instanceof Error ? error.message : "Invalid notebook file"}. Your notebook is preserved.`,
      );
    }
  }

  return (
    <main className={`workspace${focus ? " focus-mode" : ""}`}>
      <header className="app-header">
        <div className="brand-group">
          <a className="wordmark" href="./" aria-label="CalcInk home">
            CalcInk<span className="brand-dot">.</span>
          </a>
          <span className="brand-caption">a little room to think</span>
        </div>
        <div className="header-actions">
          <span
            className={`save-status ${saving.kind}`}
            role="status"
            data-testid="save-status"
          >
            <span className="status-dot" />
            {saving.message}
          </span>
          <button
            type="button"
            className="button icon-button"
            aria-label="Toggle page navigation"
            aria-controls="notebook-navigation"
            aria-expanded={hasNavigation}
            onClick={() => {
              setFocus(false);
              setNavigation(!hasNavigation);
            }}
          >
            <Icon name="pages" />
          </button>
          <button
            type="button"
            className={`button focus-button${focus ? " active" : ""}`}
            aria-pressed={focus}
            onClick={() => setFocus(!focus)}
          >
            <Icon name="focus" />
            {focus ? "Exit focus" : "Focus"}
          </button>
          <details className="action-menu">
            <summary aria-label="Export and help">
              <Icon name="more" />
              <span className="menu-label">More</span>
            </summary>
            <div className="menu-content">
              <button
                type="button"
                className="button"
                onClick={() => {
                  void exportImage();
                }}
                disabled={opening}
              >
                <Icon name="download" />
                Export page PNG
              </button>
              <button
                type="button"
                className="button"
                onClick={backup}
                disabled={opening || heldOutCapture}
              >
                Download notebook backup
              </button>
              <button
                type="button"
                className="button"
                disabled={opening || heldOutCapture}
                onClick={() => importFile.current?.click()}
              >
                Restore notebook backup
              </button>
              <input
                ref={importFile}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Notebook backup file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void restoreBackup(file);
                }}
              />
              <p>
                Undo: Ctrl/Cmd + Z<br />
                Redo: Ctrl/Cmd + Shift + Z
              </p>
              <p>
                Your notebooks are saved in this browser. Download a backup
                before clearing browser data or moving devices.
              </p>
            </div>
          </details>
        </div>
      </header>
      <div
        className={`notebook-layout${hasNavigation ? " with-navigation" : ""}`}
      >
        {hasNavigation && (
          <aside
            className="notebook-navigation"
            id="notebook-navigation"
            aria-label="Notebook pages"
          >
            <p className="eyebrow">YOUR NOTEBOOK</p>
            <h2>Everyday math</h2>
            <p className="navigation-subtitle">
              {pages.pages.length} {pages.pages.length === 1 ? "page" : "pages"}{" "}
              · on this device
            </p>
            <nav aria-label="Pages">
              {pages.pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  className={`page-choice${page.id === pages.activePageId ? " selected" : ""}`}
                  aria-current={
                    page.id === pages.activePageId ? "page" : undefined
                  }
                  disabled={opening || heldOutCapture}
                  onClick={() => choosePage(page.id)}
                >
                  <span className="page-thumbnail" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="page-choice-title">
                    {page.title || "Untitled page"}
                    <span>Page {index + 1}</span>
                  </span>
                </button>
              ))}
            </nav>
            <button
              type="button"
              className="button add-page"
              disabled={
                opening || heldOutCapture || pages.pages.length >= MAX_PAGES
              }
              onClick={() => collection.addPage()}
            >
              <Icon name="plus" />
              Add page
            </button>
            {pages.pages.length >= MAX_PAGES && (
              <p className="navigation-subtitle">12 pages per notebook.</p>
            )}
            <p className="notebook-note">
              Big ideas.
              <br />
              Small calculations.
            </p>
          </aside>
        )}
        <section className="writing-workspace" aria-label="Writing workspace">
          <div className="writing-heading">
            <div>
              <p className="eyebrow">MAKE YOURSELF SOME SPACE</p>
              <h1>Write it. Work it out.</h1>
            </div>
            <span className={`model-badge ${model.kind}`}>
              <span className="status-dot" />
              {modelLabel}
            </span>
          </div>
          <p id="writing-help" className="writing-help">
            Write anywhere on the page. Finish a calculation with = and leave
            room for its answer.
          </p>
          {MOCK_MODE && (
            <p className="mock-notice">
              <strong>Development mock.</strong> Transcripts are fixed fixtures,
              not handwriting recognition. Answers use the fixed fixture
              transcript.
            </p>
          )}
          <section className="notebook-tools" aria-label="Notebook tools">
            <fieldset className="tool-group" aria-label="Drawing tool">
              {(
                [
                  ["draw", "Pen", "pen"],
                  ["erase-stroke", "Stroke eraser", "eraser"],
                  ["erase-pixel", "Pixel eraser", "pixel"],
                ] as const
              ).map(([kind, label, icon]) => (
                <button
                  key={kind}
                  type="button"
                  className={`tool${tool === kind && !pan ? " active" : ""}`}
                  aria-pressed={tool === kind && !pan}
                  disabled={
                    opening || (capacity.full && kind !== "erase-stroke")
                  }
                  onClick={() => {
                    setTool(kind);
                    setPan(false);
                  }}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
              <button
                type="button"
                className={`tool${pan ? " active" : ""}`}
                aria-pressed={pan}
                onClick={() => setPan(!pan)}
              >
                <Icon name="move" />
                Move
              </button>
            </fieldset>
            <label className="pen-width">
              {tool === "draw" ? "Width" : "Eraser size"}
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
              />
              <output>{tool === "draw" ? width : eraserSize}</output>
            </label>
            <fieldset
              className="tool-group history-tools"
              aria-label="Edit history"
            >
              {(
                [
                  ["Undo", "undo", history.canUndo, () => document.undo()],
                  ["Redo", "redo", history.canRedo, () => document.redo()],
                  ["Clear", "clear", history.canClear, () => document.clear()],
                ] as const
              ).map(([label, icon, enabled, action]) => (
                <button
                  key={label}
                  type="button"
                  className={`tool${label === "Clear" ? " clear" : ""}`}
                  disabled={!enabled || opening}
                  onClick={action}
                  title={
                    label === "Clear"
                      ? "Clear this page (undoable)"
                      : `${label} the last edit`
                  }
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </fieldset>
            <label className="zoom-control">
              Zoom
              <select
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="Page zoom"
              >
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </label>
          </section>
          {MOCK_MODE && (
            <p className="capture-writing-prompt">{capturePrompt}</p>
          )}
          <section
            className="sheet-viewport"
            aria-label="Scrollable notebook page"
          >
            <div className="sheet-size" style={{ width: `${zoom}%` }}>
              <Notebook
                document={document}
                width={width}
                tool={tool}
                eraserRadius={eraserSize / 2}
                feedback={feedback}
                onError={setError}
                title={activePage.title}
                onTitleChange={(value) => collection.rename(value)}
                pageNumber={pageIndex + 1}
                pan={pan}
                disabled={opening}
              />
            </div>
          </section>
          <div className="page-footer">
            <span>
              {pan
                ? "Move mode · scroll the page without drawing"
                : "Made for your handwriting"}
            </span>
            <div className="page-pagination">
              <button
                type="button"
                className="button"
                aria-label="Previous page"
                disabled={opening || heldOutCapture || pageIndex === 0}
                onClick={() => choosePage(pages.pages[pageIndex - 1].id)}
              >
                ←
              </button>
              <span>
                {pageIndex + 1} / {pages.pages.length}
              </span>
              <button
                type="button"
                className="button"
                aria-label="Next page"
                disabled={
                  opening ||
                  heldOutCapture ||
                  pageIndex === pages.pages.length - 1
                }
                onClick={() => choosePage(pages.pages[pageIndex + 1].id)}
              >
                →
              </button>
            </div>
          </div>
          {saving.kind === "error" && (
            <p className="input-error" role="alert">
              {saving.message}
              {saving.retryable && (
                <button
                  className="button"
                  type="button"
                  onClick={() => storage.current?.retry()}
                >
                  Retry save
                </button>
              )}
            </p>
          )}
          {capacity.full && (
            <p role="status" className="input-error">
              Page capacity reached. Use the stroke eraser, Clear or Undo to
              make room; existing ink is preserved.
            </p>
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
                />
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
          {import.meta.env.PROD && (
            <>
              <section
                className="offline-panel"
                aria-label="Offline availability"
              >
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
                      Update available. Finish or clear your ink before
                      reloading.
                    </span>
                    <button
                      type="button"
                      className="button"
                      disabled={collection.hasInk()}
                      onClick={() => offlineConnection.current?.update()}
                    >
                      Reload to update
                    </button>
                  </div>
                )}
              </section>
              <p className="model-attribution">
                Recognition uses {selectedModel.name}.{" "}
                <a href="./model-attribution.txt">Model attribution</a>
                {" · "}
                <a href="./model-license.txt">
                  {selectedModel.license.id} license
                </a>
              </p>
            </>
          )}
          {MOCK_MODE && (
            <>
              <a className="capture-link" href="#capture-title">
                Return to sample controls ↓
              </a>
              <FixturePanel
                document={document}
                onHeldOutChange={(value) => {
                  captureOnly.current = value;
                  setHeldOutCapture(value);
                }}
                onPromptChange={setCapturePrompt}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
