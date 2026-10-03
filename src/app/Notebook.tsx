import { useEffect, useRef } from "react";
import { getRowConfig, PAGE, ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import type { Point } from "../document/types";
import { clientToPage, strokeBounds } from "../ink/geometry";
import { drawPath, replayRow } from "../rendering/replay";

export interface RowFeedback {
  kind: "idle" | "recognizing" | "ready" | "error";
  transcript: string;
}

export function Notebook({
  document,
  width,
  feedback,
  onError,
}: {
  document: DocumentStore;
  width: number;
  feedback: Record<string, RowFeedback>;
  onError(message: string): void;
}) {
  const ink = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const results = useRef<HTMLCanvasElement>(null);
  const selectedWidth = useRef(width);
  selectedWidth.current = width;

  useEffect(() => {
    if (!ink.current || !live.current || !results.current) return;
    const input = live.current;
    const layers = [ink.current, input, results.current];
    const contexts = layers.map((layer) => layer.getContext("2d"));
    if (!contexts.every((context) => context !== null)) {
      onError("Canvas 2D is unavailable in this browser.");
      return;
    }
    const usableContexts = contexts;
    const [committed, preview] = usableContexts;
    let gesture: {
      pointerId: number;
      rowId: string;
      width: number;
      points: Point[];
      painted: number;
    } | null = null;
    let frame = 0;

    function repaint() {
      // ponytail: full replay on commits for the three-row prototype; repaint changed rows in Phase 2.
      committed.clearRect(0, 0, PAGE.width, PAGE.height);
      for (const row of document.getRows())
        replayRow(committed, row.rowId, row.operations);
    }

    function stopPreview() {
      cancelAnimationFrame(frame);
      frame = 0;
      preview.clearRect(0, 0, PAGE.width, PAGE.height);
    }

    function cancel() {
      if (!gesture) return;
      const pointerId = gesture.pointerId;
      gesture = null;
      stopPreview();
      document.cancel();
      if (input.hasPointerCapture(pointerId))
        input.releasePointerCapture(pointerId);
    }

    function resize() {
      cancel();
      const rect = input.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      for (const [index, layer] of layers.entries()) {
        layer.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
        layer.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
        usableContexts[index].setTransform(
          layer.width / PAGE.width,
          0,
          0,
          layer.height / PAGE.height,
          0,
          0,
        );
      }
      repaint();
    }

    function point(event: PointerEvent, rowId: string): Point {
      const position = clientToPage(
        event.clientX,
        event.clientY,
        input.getBoundingClientRect(),
      );
      const row = getRowConfig(rowId);
      return {
        x: Math.max(0, Math.min(PAGE.width, position.x)),
        y: Math.max(row.top, Math.min(row.top + row.writingHeight, position.y)),
        pressure: event.pressure,
        t: event.timeStamp,
      };
    }

    function paintLive() {
      frame = 0;
      if (!gesture) return;
      const row = getRowConfig(gesture.rowId);
      preview.save();
      preview.beginPath();
      preview.rect(0, row.top, PAGE.width, row.writingHeight);
      preview.clip();
      preview.fillStyle = preview.strokeStyle = "#273832";
      drawPath(
        preview,
        gesture.points.slice(Math.max(0, gesture.painted - 1)),
        gesture.width,
      );
      gesture.painted = gesture.points.length;
      preview.restore();
    }

    function down(event: PointerEvent) {
      if (gesture || !event.isPrimary || event.button !== 0) return;
      const position = clientToPage(
        event.clientX,
        event.clientY,
        input.getBoundingClientRect(),
      );
      const row = ROWS.find(
        (candidate) =>
          position.y >= candidate.top &&
          position.y < candidate.top + candidate.writingHeight,
      );
      if (!row) return;
      onError("");
      try {
        document.begin(row.id);
        gesture = {
          pointerId: event.pointerId,
          rowId: row.id,
          width: selectedWidth.current,
          points: [point(event, row.id)],
          painted: 0,
        };
        input.setPointerCapture(event.pointerId);
        frame = requestAnimationFrame(paintLive);
      } catch (error) {
        cancel();
        document.cancel();
        onError(
          error instanceof Error ? error.message : "Could not start drawing",
        );
      }
    }

    function sample(event: PointerEvent) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const events = event.getCoalescedEvents?.() ?? [];
      for (const sample of events.length ? events : [event]) {
        const next = point(sample, gesture.rowId);
        const previous = gesture.points[gesture.points.length - 1];
        if (next.x !== previous.x || next.y !== previous.y)
          gesture.points.push(next);
      }
      if (gesture.points.length > 200000) {
        cancel();
        onError(
          "This stroke reached the page point limit. Existing ink is preserved.",
        );
      } else if (!frame) frame = requestAnimationFrame(paintLive);
    }

    function up(event: PointerEvent) {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      sample(event);
      if (!gesture) return;
      const finished = gesture;
      gesture = null;
      stopPreview();
      try {
        document.commit([
          ...document.getRow(finished.rowId).operations,
          {
            kind: "stroke",
            stroke: {
              id: crypto.randomUUID(),
              rowId: finished.rowId,
              width: finished.width,
              points: finished.points,
              bounds: strokeBounds(
                finished.points,
                finished.width,
                finished.rowId,
              ),
            },
          },
        ]);
      } catch (error) {
        document.cancel();
        onError(
          error instanceof Error ? error.message : "Could not save this stroke",
        );
      }
      if (input.hasPointerCapture(event.pointerId))
        input.releasePointerCapture(event.pointerId);
    }

    function lost(event: PointerEvent) {
      if (gesture?.pointerId === event.pointerId) cancel();
    }
    const unsubscribe = document.subscribe((event) => {
      if (event.phase !== "begin") repaint();
    });
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    window.addEventListener("resize", resize);
    input.addEventListener("pointerdown", down);
    input.addEventListener("pointermove", sample);
    input.addEventListener("pointerup", up);
    input.addEventListener("pointercancel", lost);
    input.addEventListener("lostpointercapture", lost);
    resize();
    return () => {
      cancel();
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("resize", resize);
      input.removeEventListener("pointerdown", down);
      input.removeEventListener("pointermove", sample);
      input.removeEventListener("pointerup", up);
      input.removeEventListener("pointercancel", lost);
      input.removeEventListener("lostpointercapture", lost);
    };
  }, [document, onError]);

  return (
    <div className="notebook">
      <div className="paper">
        <div className="margin-line" />
        {ROWS.map((row, index) => (
          <div
            className="row-guide"
            key={row.id}
            style={{
              top: `${(row.top / PAGE.height) * 100}%`,
              height: `${(row.height / PAGE.height) * 100}%`,
            }}
          >
            <span className="row-number">0{index + 1}</span>
            <div className="baseline" />
          </div>
        ))}
        <canvas
          ref={ink}
          data-layer="ink"
          className="canvas-layer"
          aria-hidden="true"
          tabIndex={-1}
        />
        <canvas
          ref={live}
          data-layer="live"
          className="canvas-layer input-layer"
          aria-label="Handwriting canvas, three equation rows"
          aria-describedby="writing-help"
          tabIndex={0}
        />
        <canvas
          ref={results}
          data-layer="results"
          className="canvas-layer"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
      <ol
        className="row-feedbacks"
        aria-live="polite"
        aria-label="Equation transcripts"
      >
        {ROWS.map((row, index) => {
          const state = feedback[row.id];
          return (
            <li
              key={row.id}
              data-row={row.id}
              className={`row-feedback ${state.kind}`}
            >
              <span className="feedback-row">Row {index + 1}</span>
              <span>
                {state.kind === "idle"
                  ? "Write an expression"
                  : state.kind === "recognizing"
                    ? "Recognizing…"
                    : state.transcript}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
