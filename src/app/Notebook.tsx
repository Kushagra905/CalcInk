import { useEffect, useRef } from "react";
import { getRowConfig, PAGE, ROWS } from "../document/rows";
import type { DocumentStore } from "../document/store";
import type { EraseMask, InkOperation, Point } from "../document/types";
import { hitVisibleStroke, type InkTool, maskTouchesInk } from "../ink/eraser";
import { clientToPage, strokeBounds } from "../ink/geometry";
import { drawPath } from "../ink/replay";
import type { RecognitionResponse } from "../recognition/protocol";
import { replayRow } from "../rendering/replay";
import { drawAnswer, measureAnswer, resultStatus } from "../rendering/results";

export interface RowFeedback {
  kind: "idle" | "recognizing" | "ready" | "error";
  transcript: string;
  result?: RecognitionResponse;
}

export function Notebook({
  document,
  width,
  tool,
  eraserRadius,
  feedback,
  onError,
}: {
  document: DocumentStore;
  width: number;
  tool: InkTool;
  eraserRadius: number;
  feedback: Record<string, RowFeedback>;
  onError(message: string): void;
}) {
  const ink = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const results = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ width, tool, eraserRadius });
  settings.current = { width, tool, eraserRadius };
  const currentFeedback = useRef(feedback);
  currentFeedback.current = feedback;

  function accepted(rowId: string, state: RowFeedback) {
    const result = state.result;
    return result &&
      result.epoch === document.getEpoch() &&
      result.rowRevision === document.getRow(rowId).rowRevision
      ? result
      : undefined;
  }

  useEffect(() => {
    const canvas = results.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, PAGE.width, PAGE.height);
    for (const row of ROWS) {
      const result = feedback[row.id].result;
      if (
        result &&
        result.epoch === document.getEpoch() &&
        result.rowRevision === document.getRow(row.id).rowRevision
      )
        drawAnswer(context, result);
    }
  }, [feedback, document]);

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
    const [committed, preview, output] = usableContexts;
    // Cache only the stable part of the active curve; repaint its changing tail each frame.
    const stable = window.document.createElement("canvas");
    const scratchContext = stable.getContext("2d");
    if (!scratchContext) {
      onError("Canvas 2D is unavailable in this browser.");
      return;
    }
    const stableContext = scratchContext;
    const hitCanvas = window.document.createElement("canvas");
    const hitContext = hitCanvas.getContext("2d", { willReadFrequently: true });
    if (!hitContext) {
      onError("Canvas 2D is unavailable in this browser.");
      return;
    }
    const hit = hitContext;
    let gesture: {
      pointerId: number;
      rowId: string;
      width: number;
      points: Point[];
      painted: number;
      tool: InkTool;
      radius: number;
      remaining: readonly InkOperation[];
      processed: number;
    } | null = null;
    let frame = 0;

    function repaint(rowIds: readonly string[] = ROWS.map((row) => row.id)) {
      for (const rowId of rowIds) {
        const row = getRowConfig(rowId);
        committed.clearRect(0, row.top, PAGE.width, row.height);
        replayRow(committed, rowId, document.getRow(rowId).operations);
      }
    }

    function stopPreview() {
      cancelAnimationFrame(frame);
      frame = 0;
      preview.clearRect(0, 0, PAGE.width, PAGE.height);
      stableContext.clearRect(0, 0, PAGE.width, PAGE.height);
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
      stable.width = input.width;
      stable.height = input.height;
      stableContext.setTransform(
        stable.width / PAGE.width,
        0,
        0,
        stable.height / PAGE.height,
        0,
        0,
      );
      repaint();
      for (const row of ROWS) {
        const result = currentFeedback.current[row.id].result;
        if (
          result &&
          result.epoch === document.getEpoch() &&
          result.rowRevision === document.getRow(row.id).rowRevision
        )
          drawAnswer(output, result);
      }
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
      if (gesture.tool !== "draw") {
        if (gesture.tool === "erase-stroke") {
          // ponytail: scan the capped row (≤1,000 operations); add a spatial index if Phase 6 profiling shows missed frames.
          for (let i = gesture.processed; i < gesture.points.length; i++) {
            const from = gesture.points[Math.max(0, i - 1)],
              to = gesture.points[i];
            const operations = gesture.remaining;
            const radius = gesture.radius;
            gesture.remaining = operations.filter(
              (operation, index) =>
                operation.kind !== "stroke" ||
                !hitVisibleStroke(hit, operations, index, from, to, radius),
            );
          }
          gesture.processed = gesture.points.length;
          committed.clearRect(0, row.top, PAGE.width, row.height);
          replayRow(committed, row.id, gesture.remaining);
        } else {
          committed.clearRect(0, row.top, PAGE.width, row.height);
          committed.save();
          committed.beginPath();
          committed.rect(0, row.top, PAGE.width, row.writingHeight);
          committed.clip();
          committed.drawImage(stable, 0, 0, PAGE.width, PAGE.height);
          committed.globalCompositeOperation = "destination-out";
          drawPath(committed, gesture.points, gesture.radius * 2);
          committed.restore();
        }
        preview.clearRect(0, 0, PAGE.width, PAGE.height);
        const last = gesture.points[gesture.points.length - 1];
        preview.save();
        preview.beginPath();
        preview.rect(0, row.top, PAGE.width, row.writingHeight);
        preview.clip();
        preview.beginPath();
        preview.arc(last.x, last.y, gesture.radius, 0, Math.PI * 2);
        preview.strokeStyle = "#2f7760";
        preview.lineWidth = 1;
        preview.stroke();
        preview.restore();
        return;
      }
      stableContext.fillStyle = stableContext.strokeStyle = "#111827";
      if (gesture.painted < gesture.points.length - 1) {
        drawPath(
          stableContext,
          gesture.points,
          gesture.width,
          gesture.painted,
          false,
        );
        gesture.painted = Math.max(1, gesture.points.length - 1);
      }
      preview.clearRect(0, row.top, PAGE.width, row.height);
      preview.save();
      preview.beginPath();
      preview.rect(0, row.top, PAGE.width, row.writingHeight);
      preview.clip();
      preview.drawImage(stable, 0, 0, PAGE.width, PAGE.height);
      preview.fillStyle = preview.strokeStyle = "#111827";
      drawPath(preview, gesture.points, gesture.width, gesture.painted);
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
        const selected = settings.current;
        if (
          selected.tool !== "erase-stroke" &&
          document.getCapacityState().full
        )
          throw new Error(
            "Page capacity reached. Use stroke erasing, Clear or Undo to make room.",
          );
        document.begin(row.id, selected.tool);
        gesture = {
          pointerId: event.pointerId,
          rowId: row.id,
          width: selected.width,
          points: [point(event, row.id)],
          painted: 1,
          tool: selected.tool,
          radius: selected.eraserRadius,
          remaining: document.getRow(row.id).operations,
          processed: 0,
        };
        if (selected.tool === "erase-pixel")
          stableContext.drawImage(layers[0], 0, 0, PAGE.width, PAGE.height);
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
      if (gesture.tool === "erase-stroke") {
        cancelAnimationFrame(frame);
        paintLive();
      }
      if (!gesture) return;
      const finished = gesture;
      gesture = null;
      stopPreview();
      try {
        if (finished.tool === "erase-stroke")
          document.commit(finished.remaining);
        else if (finished.tool === "erase-pixel") {
          const mask: EraseMask = {
            id: crypto.randomUUID(),
            rowId: finished.rowId,
            radius: finished.radius,
            points: finished.points,
          };
          const operations = document.getRow(finished.rowId).operations;
          document.commit(
            maskTouchesInk(hit, operations, mask)
              ? [...operations, { kind: "pixel-mask", mask }]
              : operations,
          );
        } else
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
    let outputEpoch = document.getEpoch();
    const unsubscribe = document.subscribe((event) => {
      if (event.epoch !== outputEpoch) {
        outputEpoch = event.epoch;
        output.clearRect(0, 0, PAGE.width, PAGE.height);
      }
      for (const changed of event.rows) {
        const row = getRowConfig(changed.rowId);
        output.clearRect(0, row.top, PAGE.width, row.height);
      }
      if (event.phase === "cancel" || event.reason === "clear") cancel();
      if (event.phase !== "begin") repaint(event.rows.map((row) => row.rowId));
    });
    const observer = new ResizeObserver(resize);
    observer.observe(input);
    let dprQuery: MediaQueryList;
    function watchDpr() {
      dprQuery?.removeEventListener("change", dprChanged);
      dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", dprChanged);
    }
    function dprChanged() {
      resize();
      watchDpr();
    }
    watchDpr();
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
      dprQuery.removeEventListener("change", dprChanged);
      window.removeEventListener("resize", resize);
      input.removeEventListener("pointerdown", down);
      input.removeEventListener("pointermove", sample);
      input.removeEventListener("pointerup", up);
      input.removeEventListener("pointercancel", lost);
      input.removeEventListener("lostpointercapture", lost);
    };
  }, [document, onError]);

  return (
    <div className="notebook" id="handwriting-notebook">
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
          const result = accepted(row.id, state);
          const context = results.current?.getContext("2d");
          const status = result
            ? resultStatus(
                result,
                !!context && !!measureAnswer(context, result),
              )
            : "";
          return (
            <li
              key={row.id}
              data-row={row.id}
              className={`row-feedback ${state.kind}`}
            >
              <span className="feedback-row">Row {index + 1}</span>
              <span>
                {state.kind === "idle" ? (
                  "Write an expression"
                ) : state.kind === "recognizing" ? (
                  "Recognizing…"
                ) : result ? (
                  <>
                    <span className="row-state">{status}</span>
                    {result.transcript && (
                      <span className="row-transcript">
                        {(result.normalizedTranscript ?? result.transcript)
                          .replaceAll("*", "×")
                          .replaceAll("/", "÷")}
                      </span>
                    )}
                  </>
                ) : (
                  state.transcript
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
