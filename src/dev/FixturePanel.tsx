import { useState } from "react";
import { PAGE, ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import { CapturePanel } from "./CapturePanel";
import { downloadJson } from "./capture";
import { createFixture } from "./fixture";

export function FixturePanel({
  document,
  onHeldOutChange,
  onPromptChange,
}: {
  document: DocumentStore;
  onHeldOutChange(heldOut: boolean): void;
  onPromptChange(message: string): void;
}) {
  const [rowId, setRowId] = useState("row-1");
  const [writer, setWriter] = useState("");
  const [transcript, setTranscript] = useState("");
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  function load() {
    document.reset();
    document.begin("row-1");
    document.commit(createFixture());
    setMessage(
      "Synthetic 18+4×3= fixture loaded. It is not a handwriting sample.",
    );
  }

  function download() {
    const operations = document.getRow(rowId).operations;
    if (!operations.length || !writer.trim() || !transcript.trim()) {
      setMessage(
        "Draw on the selected row, then enter a writer and expected transcript.",
      );
      return;
    }
    const synthetic = operations.filter((operation) =>
      (operation.kind === "stroke"
        ? operation.stroke.id
        : operation.mask.id
      ).startsWith("fixture-"),
    ).length;
    const fixture = {
      version: 1,
      sampleType:
        synthetic === operations.length
          ? "synthetic"
          : synthetic
            ? "mixed"
            : "handwritten",
      dataset: "contract",
      writer: writer.trim(),
      expectedTranscript: transcript.trim(),
      expectedValue: value.trim() || null,
      page: PAGE,
      rowId,
      operations,
      device: { userAgent: navigator.userAgent, dpr: devicePixelRatio },
      capturedAt: new Date().toISOString(),
    };
    downloadJson(`calcink-contract-${rowId}-${Date.now()}.json`, fixture);
    setMessage(
      `Exported ${fixture.sampleType} contract fixture. Use guided collection for handwriting evidence.`,
    );
  }

  return (
    <section className="fixture-panel" aria-labelledby="fixture-title">
      <div className="fixture-heading">
        <div>
          <p className="eyebrow">DEVELOPMENT ONLY</p>
          <h2 id="fixture-title">Fixture capture</h2>
        </div>
        <div className="fixture-actions">
          <button type="button" className="button" onClick={load}>
            Load sample fixture
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              document.reset();
              setMessage("Fixtures reset.");
            }}
          >
            Reset fixtures
          </button>
        </div>
      </div>
      <p className="fixture-help">
        One-off contract fixtures are exported here. Use the guided Phase 1
        collection below for actual handwriting evidence. Reset removes unsaved
        canvas ink; saved handwriting samples are kept.
      </p>
      <div className="fixture-fields contract-fields">
        <label>
          Row
          <select
            value={rowId}
            onChange={(event) => setRowId(event.target.value)}
          >
            {ROWS.map((row, index) => (
              <option key={row.id} value={row.id}>
                Row {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Writer
          <input
            value={writer}
            onChange={(event) => setWriter(event.target.value)}
            placeholder="Writer A / B"
          />
        </label>
        <label>
          Expected transcript
          <input
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="18+4×3="
          />
        </label>
        <label>
          Expected value
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="30 (optional)"
          />
        </label>
      </div>
      <button type="button" className="button primary" onClick={download}>
        Export fixture JSON
      </button>
      <p role="status" className="fixture-status">
        {message}
      </p>
      <CapturePanel
        document={document}
        onHeldOutChange={onHeldOutChange}
        onPromptChange={onPromptChange}
      />
    </section>
  );
}
