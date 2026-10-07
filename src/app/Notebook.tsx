import { useEffect, useRef, useState } from "react";
import { PAGE, ROWS, RULE_SPACING } from "../document/rows";
import type { DocumentStore } from "../document/store";
import type { EraseMask, InkOperation, Point } from "../document/types";
import { hitVisibleStroke, type InkTool, maskTouchesInk } from "../ink/eraser";
import { clientToPage, strokeBounds } from "../ink/geometry";
import { groupBounds, writingGroup } from "../ink/groups";
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
  title,
  onTitleChange,
  pageNumber,
  pan,
  disabled,
}: {
  document: DocumentStore;
  width: number;
  tool: InkTool;
  eraserRadius: number;
  feedback: Record<string, RowFeedback>;
  onError(message: string): void;
  title: string;
  onTitleChange(title: string): void;
  pageNumber: number;
  pan: boolean;
  disabled: boolean;
}) {
  const ink = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const results = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ width, tool, eraserRadius, pan, disabled });
  settings.current = { width, tool, eraserRadius, pan, disabled };
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const currentFeedback = useRef(feedback);
  currentFeedback.current = feedback;

  useEffect(() => {
    let disposed = false;
    void window.document.fonts
      .load('400 32px "Inter"')
      .then(() => {
        if (!disposed) setFontReady(true);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  function accepted(rowId: string, state: RowFeedback) {
    const result = state.result;
    return result &&
      result.epoch === document.getEpoch() &&
      result.rowRevision === document.getRow(rowId).rowRevision
      ? result
      : undefined;
  }

  useEffect(() => {
    if (!fontReady) return;
    const canvas = results.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, PAGE.width, PAGE.height);
    for (const row of document.getRows()) {
      const result = feedback[row.rowId]?.result;
      if (
        result &&
        result.epoch === document.getEpoch() &&
        result.rowRevision === row.rowRevision
      )
        drawAnswer(context, result);
    }
  }, [feedback, document, fontReady]);

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
      remaining: Map<string, readonly InkOperation[]>;
      processed: number;
    } | null = null;
    let frame = 0;
    let moving: {
      pointerId: number;
      x: number;
      y: number;
      scrollX: number;
      scrollY: number;
    } | null = null;
    const viewport = input.closest<HTMLElement>(".sheet-viewport");

    function repaint() {
      committed.clearRect(0, 0, PAGE.width, PAGE.height);
      for (const row of document.getRows())
        replayRow(
          committed,
          row.rowId,
          gesture?.tool === "erase-stroke"
            ? (gesture.remaining.get(row.rowId) ?? row.operations)
            : row.operations,
        );
    }

    function stopPreview() {
      cancelAnimationFrame(frame);
      frame = 0;
      preview.clearRect(0, 0, PAGE.width, PAGE.height);
      stableContext.clearRect(0, 0, PAGE.width, PAGE.height);
    }

    function cancel() {
      if (moving) {
        const id = moving.pointerId;
        moving = null;
        if (input.hasPointerCapture(id)) input.releasePointerCapture(id);
      }
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
      for (const row of document.getRows()) {
        const result = currentFeedback.current[row.rowId]?.result;
        if (
          result &&
          result.epoch === document.getEpoch() &&
          result.rowRevision === row.rowRevision
        )
          drawAnswer(output, result);
      }
    }

    function point(event: PointerEvent): Point {
      const position = clientToPage(
        event.clientX,
        event.clientY,
        input.getBoundingClientRect(),
      );
      return {
        x: Math.max(0, Math.min(PAGE.width, position.x)),
        y: Math.max(0, Math.min(PAGE.height, position.y)),
        pressure: event.pressure,
        t: event.timeStamp,
      };
    }

    function paintLive() {
      frame = 0;
      if (!gesture) return;
      if (gesture.tool !== "draw") {
        if (gesture.tool === "erase-stroke") {
          // The page caps all groups together at 1,000 operations.
          for (let i = gesture.processed; i < gesture.points.length; i++) {
            const from = gesture.points[Math.max(0, i - 1)],
              to = gesture.points[i];
            const radius = gesture.radius;
            for (const [id, operations] of gesture.remaining)
              gesture.remaining.set(
                id,
                operations.filter(
                  (operation, index) =>
                    operation.kind !== "stroke" ||
                    !hitVisibleStroke(hit, operations, index, from, to, radius),
                ),
              );
          }
          gesture.processed = gesture.points.length;
          repaint();
        } else {
          committed.clearRect(0, 0, PAGE.width, PAGE.height);
          committed.save();
          committed.beginPath();
          committed.rect(0, 0, PAGE.width, PAGE.height);
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
        preview.rect(0, 0, PAGE.width, PAGE.height);
        preview.clip();
        preview.beginPath();
        preview.arc(last.x, last.y, gesture.radius, 0, Math.PI * 2);
        preview.strokeStyle = "#2f7760";
        preview.lineWidth = 1;
        preview.stroke();
        preview.restore();
        return;
      }
      stableContext.fillStyle = stableContext.strokeStyle = "#30352f";
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
      preview.clearRect(0, 0, PAGE.width, PAGE.height);
      preview.save();
      preview.beginPath();
      preview.rect(0, 0, PAGE.width, PAGE.height);
      preview.clip();
      preview.drawImage(stable, 0, 0, PAGE.width, PAGE.height);
      preview.fillStyle = preview.strokeStyle = "#30352f";
      drawPath(preview, gesture.points, gesture.width, gesture.painted);
      preview.restore();
    }

    function down(event: PointerEvent) {
      if (settings.current.disabled) return;
      if (settings.current.pan) {
        if (
          event.isPrimary &&
          event.button === 0 &&
          event.pointerType !== "touch" &&
          viewport
        ) {
          event.preventDefault();
          moving = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollX: viewport.scrollLeft,
            scrollY: window.scrollY,
          };
          input.setPointerCapture(event.pointerId);
        }
        return;
      }
      if (gesture || !event.isPrimary || event.button !== 0) return;
      const position = clientToPage(
        event.clientX,
        event.clientY,
        input.getBoundingClientRect(),
      );
      if (
        position.x < 0 ||
        position.x > PAGE.width ||
        position.y < 0 ||
        position.y > PAGE.height
      )
        return;
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
        const rowId =
          selected.tool === "draw"
            ? writingGroup(document.getRows(), position)
            : "row-1";
        const touched =
          selected.tool === "draw"
            ? [rowId]
            : document
                .getRows()
                .filter((row) => row.operations.length)
                .map((row) => row.rowId);
        if (!touched.length) return;
        document.begin(touched, selected.tool);
        setActiveLine(Math.floor(position.y / RULE_SPACING) * RULE_SPACING);
        gesture = {
          pointerId: event.pointerId,
          rowId,
          width: selected.width,
          points: [point(event)],
          painted: 1,
          tool: selected.tool,
          radius: selected.eraserRadius,
          remaining: new Map(
            touched.map((id) => [id, document.getRow(id).operations]),
          ),
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
      if (moving?.pointerId === event.pointerId && viewport) {
        viewport.scrollLeft = moving.scrollX + moving.x - event.clientX;
        window.scrollTo({
          top: moving.scrollY + moving.y - event.clientY,
          behavior: "instant",
        });
        return;
      }
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const events = event.getCoalescedEvents?.() ?? [];
      for (const sample of events.length ? events : [event]) {
        const next = point(sample);
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
      if (moving?.pointerId === event.pointerId) {
        cancel();
        return;
      }
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
          document.commitRows(finished.remaining);
        else if (finished.tool === "erase-pixel") {
          const updates = new Map<string, readonly InkOperation[]>();
          for (const [rowId, operations] of finished.remaining) {
            const mask: EraseMask = {
              id: crypto.randomUUID(),
              rowId,
              radius: finished.radius,
              points: finished.points,
            };
            updates.set(
              rowId,
              maskTouchesInk(hit, operations, mask)
                ? [...operations, { kind: "pixel-mask", mask }]
                : operations,
            );
          }
          document.commitRows(updates);
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
      if (
        gesture?.pointerId === event.pointerId ||
        moving?.pointerId === event.pointerId
      )
        cancel();
    }
    let outputEpoch = document.getEpoch();
    const unsubscribe = document.subscribe((event) => {
      if (event.reason === "clear") setActiveLine(null);
      if (event.epoch !== outputEpoch) {
        outputEpoch = event.epoch;
        output.clearRect(0, 0, PAGE.width, PAGE.height);
      }
      output.clearRect(0, 0, PAGE.width, PAGE.height);
      const changedIds = new Set(event.rows.map((row) => row.rowId));
      for (const row of document.getRows()) {
        if (changedIds.has(row.rowId)) continue;
        const result = currentFeedback.current[row.rowId]?.result;
        if (
          result &&
          result.epoch === document.getEpoch() &&
          result.rowRevision === row.rowRevision
        )
          drawAnswer(output, result);
      }
      if (event.phase === "cancel" || event.reason === "clear") cancel();
      if (event.phase !== "begin") repaint();
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
      <header className="paper-heading">
        <div>
          <label className="page-title-label" htmlFor="notebook-page-title">
            MY MATH NOTEBOOK
          </label>
          <input
            id="notebook-page-title"
            className="page-title-input"
            aria-label="Page title"
            value={title}
            maxLength={64}
            placeholder="Untitled page"
            disabled={disabled}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </div>
        <span className="paper-page-number">
          {String(pageNumber).padStart(2, "0")}
        </span>
      </header>
      <div
        className="paper"
        style={{ aspectRatio: `${PAGE.width} / ${PAGE.height}` }}
      >
        <div className="margin-line" />
        <div className="paper-rules" aria-hidden="true" />
        {activeLine !== null && (
          <div
            className="active-writing-line"
            aria-hidden="true"
            style={{
              top: `${(activeLine / PAGE.height) * 100}%`,
              height: `${(RULE_SPACING / PAGE.height) * 100}%`,
            }}
          />
        )}
        {ROWS.map((row) => (
          <div
            className="row-guide"
            aria-hidden="true"
            key={row.id}
            style={{
              top: `${(row.top / PAGE.height) * 100}%`,
              height: "1px",
            }}
          />
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
          className={`canvas-layer input-layer${pan ? " pan-layer" : ""}`}
          aria-label="Handwriting canvas, continuous notebook page"
          aria-disabled={disabled}
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
        <ol
          className="row-feedbacks"
          aria-live="polite"
          aria-label="Equation transcripts"
        >
          {document.getRows().map((row, index) => {
            const state = feedback[row.rowId] ?? {
              kind: "idle",
              transcript: "",
            };
            const result = accepted(row.rowId, state);
            const bounds = groupBounds(row);
            const context = results.current?.getContext("2d");
            const status = result
              ? resultStatus(
                  result,
                  !!context && !!measureAnswer(context, result),
                )
              : "";
            return (
              <li
                key={row.rowId}
                data-row={row.rowId}
                className={`row-feedback ${state.kind}`}
                style={{
                  top: `${(Math.max(0, (bounds?.y ?? 0) - 24) / PAGE.height) * 100}%`,
                  left: `${((bounds?.x ?? 44) / PAGE.width) * 100}%`,
                }}
              >
                <span className="feedback-row">Expression {index + 1}</span>
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
      <footer className="paper-footer">
        <span>Ink first. Answers alongside.</span>
        <span>PAGE {String(pageNumber).padStart(2, "0")}</span>
      </footer>
    </div>
  );
}
