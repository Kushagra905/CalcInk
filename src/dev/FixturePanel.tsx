import { useState } from "react";
import { PAGE, ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import { createFixture } from "./fixture";

export function FixturePanel({ document }: { document: DocumentStore }) {
  const [rowId, setRowId] = useState("row-1");
  const [writer, setWriter] = useState("");
  const [transcript, setTranscript] = useState("");
  const [value, setValue] = useState("");
  const [dataset, setDataset] = useState("development");
  const [message, setMessage] = useState("");

  function load() {
    document.clear();
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
      dataset,
      writer: writer.trim(),
      expectedTranscript: transcript.trim(),
      expectedValue: value.trim() || null,
      page: PAGE,
      rowId,
      operations,
      device: { userAgent: navigator.userAgent, dpr: devicePixelRatio },
      capturedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(fixture, null, 2)], {
        type: "application/json",
      }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `calcink-${dataset}-${rowId}-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage(
      `Exported ${fixture.sampleType} fixture. Keep held-out samples separate from development data.`,
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
              document.clear();
              setMessage("Fixtures reset.");
            }}
          >
            Reset fixtures
          </button>
        </div>
      </div>
      <p className="fixture-help">
        Draw your sample above, enter its expected text, and export the stroke
        data. Reset removes all captured ink from this tab.
      </p>
      <div className="fixture-fields">
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
        <label>
          Dataset
          <select
            value={dataset}
            onChange={(event) => setDataset(event.target.value)}
          >
            <option value="development">Development</option>
            <option value="held-out">Held out</option>
          </select>
        </label>
      </div>
      <button type="button" className="button primary" onClick={download}>
        Export fixture JSON
      </button>
      <p role="status" className="fixture-status">
        {message}
      </p>
    </section>
  );
}
