import { useEffect, useRef, useState } from "react";
import type { GraphEquation } from "../graph/equation";
import {
  type GraphView,
  INITIAL_VIEW,
  plotSegments,
  toWorld,
  zoomView,
} from "../graph/plot";

function drawGraph(
  canvas: HTMLCanvasElement,
  view: GraphView,
  equation: GraphEquation | null,
) {
  const box = canvas.getBoundingClientRect();
  const width = box.width,
    height = box.height;
  if (!width || !height) return;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  ctx.fillStyle = "#fffef8";
  ctx.fillRect(0, 0, width, height);
  const screen = (x: number, y: number) => ({
    x: width / 2 + (x - view.x) * view.scale,
    y: height / 2 - (y - view.y) * view.scale,
  });
  const topLeft = toWorld(view, width, height, 0, 0),
    bottomRight = toWorld(view, width, height, width, height);
  const base = 10 ** Math.floor(Math.log10(70 / view.scale));
  const step =
    [1, 2, 5, 10].map((n) => n * base).find((n) => n * view.scale >= 50) ??
    base * 10;
  const origin = screen(0, 0);
  ctx.font = '11px "Inter", sans-serif';
  for (const axis of ["x", "y"] as const) {
    const min = axis === "x" ? topLeft.x : bottomRight.y;
    const max = axis === "x" ? bottomRight.x : topLeft.y;
    for (let n = Math.ceil(min / step); n <= Math.floor(max / step); n++) {
      const value = n * step,
        point = screen(value, value);
      ctx.beginPath();
      ctx.strokeStyle = n === 0 ? "#62695d" : "#dce7df";
      ctx.lineWidth = n === 0 ? 1.5 : 1;
      if (axis === "x") {
        ctx.moveTo(point.x, 0);
        ctx.lineTo(point.x, height);
      } else {
        ctx.moveTo(0, point.y);
        ctx.lineTo(width, point.y);
      }
      ctx.stroke();
      if (n === 0) continue;
      ctx.fillStyle = "#62695d";
      const label = Number(value.toPrecision(6)).toString();
      if (axis === "x")
        ctx.fillText(
          label,
          point.x + 4,
          Math.max(15, Math.min(height - 8, origin.y + 16)),
        );
      else
        ctx.fillText(
          label,
          Math.max(5, Math.min(width - 36, origin.x + 7)),
          point.y - 5,
        );
    }
  }
  ctx.fillStyle = "#30352f";
  ctx.fillText(
    "x",
    width - 16,
    Math.max(16, Math.min(height - 8, origin.y - 8)),
  );
  ctx.fillText("y", Math.max(8, Math.min(width - 16, origin.x + 9)), 16);
  if (equation) {
    ctx.strokeStyle = "#2155cd";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, b] of plotSegments(equation, view, width, height)) {
      const from = screen(a.x, a.y),
        to = screen(b.x, b.y);
      if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) continue;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
}

export function GraphCanvas({ equation }: { equation: GraphEquation | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<GraphView>(INITIAL_VIEW);
  const current = useRef({ view, equation });
  current.current = { view, equation };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let frame = 0;
    const paint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        drawGraph(surface, current.current.view, current.current.equation),
      );
    };
    const observer = new ResizeObserver(paint);
    observer.observe(surface);
    let dprQuery: MediaQueryList;
    function watchDpr() {
      dprQuery?.removeEventListener("change", dprChanged);
      dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", dprChanged);
    }
    function dprChanged() {
      paint();
      watchDpr();
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const box = surface?.getBoundingClientRect();
      if (box)
        setView((v) =>
          zoomView(
            v,
            box.width,
            box.height,
            Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.004),
            event.clientX - box.left,
            event.clientY - box.top,
          ),
        );
    }
    surface.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", paint);
    watchDpr();
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dprQuery.removeEventListener("change", dprChanged);
      surface.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", paint);
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (canvas.current) drawGraph(canvas.current, view, equation);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, equation]);
  const zoom = (factor: number) => {
    const box = canvas.current?.getBoundingClientRect();
    if (box) setView((v) => zoomView(v, box.width, box.height, factor));
  };
  return (
    <section className="graph-card" aria-label="Graph plot">
      <div className="graph-card-heading">
        <div>
          <p className="eyebrow">A DIFFERENT POINT OF VIEW</p>
          <h2>Your graph</h2>
        </div>
        <div className="graph-controls">
          <button
            type="button"
            className="button"
            aria-label="Zoom graph out"
            onClick={() => zoom(0.8)}
          >
            −
          </button>
          <button
            type="button"
            className="button"
            aria-label="Zoom graph in"
            onClick={() => zoom(1.25)}
          >
            +
          </button>
          <button
            type="button"
            className="button"
            onClick={() => setView(INITIAL_VIEW)}
          >
            Reset view
          </button>
        </div>
      </div>
      <div className="graph-plane">
        <canvas
          ref={canvas}
          aria-label="Interactive graph. Drag to pan, scroll or pinch to zoom. Arrow keys pan; plus and minus zoom; Home resets."
          role="img"
          tabIndex={0}
          onKeyDown={(event) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-40, 0],
              ArrowRight: [40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };
            const move = moves[event.key];
            if (move) {
              event.preventDefault();
              setView((v) => ({
                ...v,
                x: v.x + move[0] / v.scale,
                y: v.y + move[1] / v.scale,
              }));
            } else if (["+", "=", "-", "Home"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Home") setView(INITIAL_VIEW);
              else zoom(event.key === "-" ? 0.8 : 1.25);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || pointers.current.size >= 2) return;
            const box = event.currentTarget.getBoundingClientRect();
            pointers.current.set(event.pointerId, {
              x: event.clientX - box.left,
              y: event.clientY - box.top,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const previous = pointers.current.get(event.pointerId);
            if (!previous) return;
            const box = event.currentTarget.getBoundingClientRect();
            const next = {
              x: event.clientX - box.left,
              y: event.clientY - box.top,
            };
            const other = [...pointers.current.entries()].find(
              ([id]) => id !== event.pointerId,
            )?.[1];
            pointers.current.set(event.pointerId, next);
            setView((v) => {
              if (!other)
                return {
                  ...v,
                  x: v.x - (next.x - previous.x) / v.scale,
                  y: v.y + (next.y - previous.y) / v.scale,
                };
              const before = Math.hypot(
                  previous.x - other.x,
                  previous.y - other.y,
                ),
                after = Math.hypot(next.x - other.x, next.y - other.y);
              const midpoint = {
                x: (previous.x + other.x) / 2,
                y: (previous.y + other.y) / 2,
              };
              const scaled = zoomView(
                v,
                box.width,
                box.height,
                before > 1 ? after / before : 1,
                midpoint.x,
                midpoint.y,
              );
              return {
                ...scaled,
                x: scaled.x - (next.x - previous.x) / 2 / scaled.scale,
                y: scaled.y + (next.y - previous.y) / 2 / scaled.scale,
              };
            });
          }}
          onPointerUp={(event) => {
            pointers.current.delete(event.pointerId);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            pointers.current.delete(event.pointerId);
          }}
          onLostPointerCapture={(event) => {
            pointers.current.delete(event.pointerId);
          }}
        />
      </div>
      <footer className="graph-footer">
        <span>Drag to move · scroll or pinch to zoom</span>
        <output
          data-testid="graph-view"
          data-x={view.x}
          data-y={view.y}
          data-scale={view.scale}
        >
          Centre ({Number(view.x.toFixed(2))}, {Number(view.y.toFixed(2))}) ·{" "}
          {Math.round((view.scale / INITIAL_VIEW.scale) * 100)}%
        </output>
      </footer>
    </section>
  );
}
