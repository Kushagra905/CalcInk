import { getRowConfig, PAGE } from "../document/rows";
import type { InkOperation } from "../document/types";
import { type InkContext, replayInk } from "../ink/replay";

const surfaces = new WeakMap<InkContext, OffscreenCanvas | HTMLCanvasElement>();

export function replayRow(
  context: InkContext,
  rowId: string,
  operations: readonly InkOperation[],
) {
  getRowConfig(rowId);
  if (!operations.length) return;
  // Isolate each expression's masks so they cannot erase later ink in another
  // group. Groups may overlap anywhere on a continuous page.
  const transform = context.getTransform();
  const scaleX = Math.hypot(transform.a, transform.b);
  const scaleY = Math.hypot(transform.c, transform.d);
  const strokes = operations.filter((operation) => operation.kind === "stroke");
  if (!strokes.length || !scaleX || !scaleY) return;
  // Align the small compositing surface to device pixels. Reusing it avoids
  // allocating a full-page bitmap after every pen lift.
  const left = Math.max(
    0,
    Math.floor(
      Math.min(...strokes.map(({ stroke }) => stroke.bounds.x)) * scaleX,
    ) - 2,
  );
  const top = Math.max(
    0,
    Math.floor(
      Math.min(...strokes.map(({ stroke }) => stroke.bounds.y)) * scaleY,
    ) - 2,
  );
  const right = Math.min(
    Math.ceil(PAGE.width * scaleX),
    Math.ceil(
      Math.max(
        ...strokes.map(({ stroke }) => stroke.bounds.x + stroke.bounds.width),
      ) * scaleX,
    ) + 2,
  );
  const bottom = Math.min(
    Math.ceil(PAGE.height * scaleY),
    Math.ceil(
      Math.max(
        ...strokes.map(({ stroke }) => stroke.bounds.y + stroke.bounds.height),
      ) * scaleY,
    ) + 2,
  );
  const width = Math.max(1, right - left),
    height = Math.max(1, bottom - top);
  let surface = surfaces.get(context);
  if (!surface) {
    surface =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas");
    surfaces.set(context, surface);
  }
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  const ink = surface.getContext("2d") as InkContext | null;
  if (!ink) throw new Error("Canvas 2D is unavailable");
  ink.setTransform(1, 0, 0, 1, 0, 0);
  ink.clearRect(0, 0, width, height);
  ink.setTransform(scaleX, 0, 0, scaleY, -left, -top);
  replayInk(ink, operations);
  context.save();
  context.beginPath();
  context.rect(0, 0, PAGE.width, PAGE.height);
  context.clip();
  context.drawImage(
    surface,
    left / scaleX,
    top / scaleY,
    width / scaleX,
    height / scaleY,
  );
  context.restore();
}
