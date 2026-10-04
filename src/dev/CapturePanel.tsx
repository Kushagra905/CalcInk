import { useEffect, useState } from "react";
import { ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import {
  createHandwritingSample,
  type Dataset,
  downloadJson,
  exportSamples,
  type HandwritingSample,
  type InputDevice,
  readSamples,
  samplePlan,
  saveSample,
  type WriterSlot,
} from "./capture";

export function CapturePanel({
  document,
  onHeldOutChange,
  onPromptChange,
}: {
  document: DocumentStore;
  onHeldOutChange(heldOut: boolean): void;
  onPromptChange(message: string): void;
}) {
  const [samples, setSamples] = useState<HandwritingSample[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dataset, setDataset] = useState<Dataset>("development");
  const [writerSlot, setWriterSlot] = useState<WriterSlot>("A");
  const [writer, setWriter] = useState("Writer A");
  const [rowId, setRowId] = useState("row-1");
  const [promptId, setPromptId] = useState("development-1");
  const [input, setInput] = useState<InputDevice | "">("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const plan = samplePlan(dataset, writerSlot);
  const prompt = plan.find((item) => item.id === promptId) ?? plan[0];
  const writerSamples = samples.filter(
    (sample) => sample.writerSlot === writerSlot,
  );
  const selectedSamples = writerSamples.filter(
    (sample) => sample.dataset === dataset,
  );
  const saved = selectedSamples.some((sample) => sample.promptId === prompt.id);

  useEffect(() => {
    onPromptChange(
      `Writer ${writerSlot} · ${dataset} · ${rowId.replace("row-", "row ")}: write ${prompt.transcript} with ${prompt.spacing} spacing.`,
    );
  }, [
    writerSlot,
    dataset,
    rowId,
    prompt.transcript,
    prompt.spacing,
    onPromptChange,
  ]);

  useEffect(() => {
    let active = true;
    readSamples()
      .then((records) => {
        if (!active) return;
        setSamples(records);
        setWriter(
          records.find((sample) => sample.writerSlot === "A")?.writer ??
            "Writer A",
        );
        setPromptId(
          samplePlan("development").find(
            (item) =>
              !records.some(
                (sample) =>
                  sample.writerSlot === "A" && sample.promptId === item.id,
              ),
          )?.id ?? "development-1",
        );
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            `Capture storage unavailable: ${error instanceof Error ? error.message : "Could not open browser storage"}. Use individual fixture exports to keep your ink.`,
          );
      });
    const unsubscribe = document.subscribe((event) => {
      setEditing(event.phase === "begin");
      setConfirmed(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [document]);

  function changeSetup(change: () => void) {
    if (editing || saving) return;
    if (
      document.getRows().some((row) => row.operations.length) &&
      !window.confirm(
        "Changing the capture setup clears unsaved ink. Saved samples are kept. Continue?",
      )
    )
      return;
    document.reset();
    setConfirmed(false);
    setMessage("");
    change();
  }

  async function save() {
    if (!loaded || saving || editing || !confirmed || !input) return;
    const snapshot = document.getRow(rowId);
    const before = document.getRows();
    const epoch = document.getEpoch();
    setSaving(true);
    try {
      const sample = createHandwritingSample(snapshot, {
        dataset,
        writerSlot,
        writer,
        promptId: prompt.id,
        device: {
          input,
          description: description.trim(),
          userAgent: navigator.userAgent,
          dpr: devicePixelRatio,
        },
      });
      await saveSample(sample);
      const next = [...samples.filter((item) => item.id !== sample.id), sample];
      setSamples(next);
      const unchanged =
        document.getEpoch() === epoch &&
        before.every(
          (row) => document.getRow(row.rowId).rowRevision === row.rowRevision,
        );
      if (unchanged) {
        document.reset(rowId);
        const remaining = plan.find(
          (item) =>
            !next.some(
              (record) =>
                record.writerSlot === writerSlot && record.promptId === item.id,
            ),
        );
        if (remaining) setPromptId(remaining.id);
      }
      setConfirmed(false);
      setMessage(
        unchanged
          ? "Sample saved in this browser. Write the next expression, then export your set as a backup."
          : "Sample saved. The canvas changed during saving, so its ink was kept. Reset before the next sample.",
      );
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "Could not save the sample"} Your ink is preserved.`,
      );
    } finally {
      setSaving(false);
    }
  }

  function exportSet(pool: Dataset) {
    try {
      downloadJson(`calcink-${pool}.json`, exportSamples(samples, pool));
    } catch (error) {
      setMessage(
        `Export failed: ${error instanceof Error ? error.message : String(error)}. Saved samples are preserved.`,
      );
      return;
    }
    setMessage(
      pool === "held-out"
        ? "Held-out set exported separately. Keep it private until final evaluation; do not use it for model selection or preprocessing."
        : "Development set exported. Share only this set with B for the model trial.",
    );
  }

  return (
    <section className="capture-panel" aria-labelledby="capture-title">
      <h2 id="capture-title">Phase 1 handwriting collection</h2>
      <p className="fixture-help">
        Two writers: 12 development samples and 25 held-out samples each. Saved
        strokes survive reloads in this browser; exported files are your backup.
        Confirm only expressions you wrote yourself.
      </p>
      <fieldset
        className="capture-setup"
        disabled={saving || editing || !loaded}
      >
        <div className="fixture-fields">
          <label>
            Capture writer
            <select
              value={writerSlot}
              onChange={(event) =>
                changeSetup(() => {
                  const slot = event.target.value as WriterSlot;
                  setWriterSlot(slot);
                  setWriter(
                    samples.find((sample) => sample.writerSlot === slot)
                      ?.writer ?? `Writer ${slot}`,
                  );
                  setPromptId(
                    plan.find(
                      (item) =>
                        !samples.some(
                          (sample) =>
                            sample.writerSlot === slot &&
                            sample.promptId === item.id,
                        ),
                    )?.id ?? plan[0].id,
                  );
                })
              }
            >
              <option value="A">Writer A</option>
              <option value="B">Writer B</option>
            </select>
          </label>
          <label>
            Writer label
            <input
              value={writer}
              readOnly={writerSamples.length > 0}
              maxLength={80}
              onChange={(event) => setWriter(event.target.value)}
            />
          </label>
          <label>
            Capture dataset
            <select
              value={dataset}
              onChange={(event) =>
                changeSetup(() => {
                  const pool = event.target.value as Dataset;
                  setDataset(pool);
                  const prompts = samplePlan(pool);
                  setPromptId(
                    prompts.find(
                      (item) =>
                        !samples.some(
                          (sample) =>
                            sample.writerSlot === writerSlot &&
                            sample.promptId === item.id,
                        ),
                    )?.id ?? prompts[0].id,
                  );
                  onHeldOutChange(pool === "held-out");
                })
              }
            >
              <option value="development">Development — model trial</option>
              <option value="held-out">Held out — final evaluation only</option>
            </select>
          </label>
          <label>
            Capture row
            <select
              value={rowId}
              onChange={(event) =>
                changeSetup(() => setRowId(event.target.value))
              }
            >
              {ROWS.map((row, index) => (
                <option key={row.id} value={row.id}>
                  Row {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Input used
            <select
              value={input}
              onChange={(event) => setInput(event.target.value as InputDevice)}
            >
              <option value="">Select device</option>
              <option value="mouse">Mouse / trackpad</option>
              <option value="pen">Stylus / pen</option>
              <option value="touch">Touch</option>
            </select>
          </label>
        </div>
        <label className="capture-device">
          Device and browser description
          <input
            value={description}
            maxLength={160}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Your actual laptop/tablet and browser"
          />
        </label>
        <label className="capture-prompt">
          Expression to write
          <select
            value={prompt.id}
            onChange={(event) =>
              changeSetup(() => setPromptId(event.target.value))
            }
          >
            {plan.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.transcript}
                {selectedSamples.some((sample) => sample.promptId === item.id)
                  ? " — saved"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="capture-instruction">
          Write <strong>{prompt.transcript}</strong> on{" "}
          {rowId.replace("row-", "row ")}. Use{" "}
          {prompt.spacing === "cramped"
            ? "slightly cramped, still legible"
            : "your normal"}{" "}
          spacing. Reference value: {prompt.value}.
        </p>
        <a className="button capture-link" href="#handwriting-notebook">
          Go to writing canvas ↑
        </a>
        <label className="capture-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I personally wrote the displayed expression on the selected row.
        </label>
        <button
          type="button"
          className="button primary"
          disabled={
            !confirmed || !input || !writer.trim() || !description.trim()
          }
          onClick={save}
        >
          {saved
            ? "Replace saved handwriting sample"
            : "Save handwriting sample"}
        </button>
      </fieldset>
      {dataset === "held-out" && (
        <p className="mock-notice">
          Recognition is paused during held-out capture. Keep these samples out
          of the model trial.
        </p>
      )}
      <p className="capture-counts">
        This writer: {selectedSamples.length}/{plan.length} {dataset}. This
        browser's development:{" "}
        {samples.filter((sample) => sample.dataset === "development").length}
        /24. Total held out:{" "}
        {samples.filter((sample) => sample.dataset === "held-out").length}/50.
      </p>
      <div className="fixture-actions">
        <button
          type="button"
          className="button"
          disabled={
            !samples.some((sample) => sample.dataset === "development") ||
            saving
          }
          onClick={() => exportSet("development")}
        >
          Export development set
        </button>
        <button
          type="button"
          className="button"
          disabled={
            !samples.some((sample) => sample.dataset === "held-out") || saving
          }
          onClick={() => exportSet("held-out")}
        >
          Export held-out set
        </button>
      </div>
      <p className="fixture-status" role="status">
        {saving ? "Saving handwriting sample…" : message}
      </p>
    </section>
  );
}
