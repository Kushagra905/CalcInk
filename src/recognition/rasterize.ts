import type { Bounds, InkOperation, RowId } from "../document/types";
import { replayInk } from "../ink/replay";

export function rowTop(rowId: RowId): number {
  const index = ["row-1", "row-2", "row-3"].indexOf(rowId);
  if (index < 0) throw new Error("UNKNOWN_ROW");
  return index * 160;
}

export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function rasterizeRow(
  operations: readonly InkOperation[],
  rowId: RowId,
) {
  if (typeof OffscreenCanvas === "undefined")
    throw new Error("OFFSCREEN_CANVAS_UNSUPPORTED");
  const top = rowTop(rowId);
  const canvas = new OffscreenCanvas(960, 136);
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    if (
      operations.some(
        (operation) =>
          (operation.kind === "stroke"
            ? operation.stroke.rowId
            : operation.mask.rowId) !== rowId,
      )
    ) {
      throw new Error("MIXED_ROW_OPERATIONS");
    }
    context.translate(0, -top);
    replayInk(context, operations);
    const local = alphaBounds(
      context.getImageData(0, 0, 960, 136).data,
      960,
      136,
    );
    if (!local) return { canvas: null, visibleInkBounds: null };
    const margin = 16;
    const crop = new OffscreenCanvas(
      local.width + margin * 2,
      local.height + margin * 2,
    );
    try {
      const cropContext = crop.getContext("2d");
      if (!cropContext) throw new Error("CANVAS_UNAVAILABLE");
      cropContext.drawImage(
        canvas,
        local.x,
        local.y,
        local.width,
        local.height,
        margin,
        margin,
        local.width,
        local.height,
      );
      // The adapter owns the returned crop until preprocessing has finished.
      return { canvas: crop, visibleInkBounds: { ...local, y: local.y + top } };
    } catch (error) {
      crop.width = crop.height = 0;
      throw error;
    }
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Ink-on expects white ink on black, top-left alignment, height 256, width multiple of 64. */
export function prepareComer(canvas: OffscreenCanvas) {
  const scale = Math.min(128 / canvas.height, (1024 - 16) / canvas.width);
  const contentW = Math.max(1, Math.round(canvas.width * scale));
  const contentH = Math.max(1, Math.round(canvas.height * scale));
  const width = Math.min(
    1024,
    Math.max(128, Math.ceil((contentW + 16) / 64) * 64),
  );
  const target = new OffscreenCanvas(width, 256);
  try {
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    // Only alpha is needed: the crop already contains composited surviving ink.
    context.drawImage(canvas, 0, 0, contentW, contentH);
    const rgba = context.getImageData(0, 0, width, 256).data;
    const tensor = new Float32Array(width * 256);
    const mask = new Uint8Array(width * 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        tensor[index] = rgba[index * 4 + 3] / 255;
        mask[index] = y < contentH && x < contentW ? 0 : 1;
      }
    }
    return {
      tensor,
      mask,
      height: 256,
      width,
      maskHeight: 256,
      maskWidth: width,
    };
  } finally {
    target.width = target.height = 0;
  }
}
