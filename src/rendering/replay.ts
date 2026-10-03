import { getRowConfig, PAGE } from "../document/rows";
import type { InkOperation } from "../document/types";
import { type InkContext, replayInk } from "../ink/replay";

export function replayRow(
  context: InkContext,
  rowId: string,
  operations: readonly InkOperation[],
) {
  const row = getRowConfig(rowId);
  context.save();
  context.beginPath();
  context.rect(0, row.top, PAGE.width, row.writingHeight);
  context.clip();
  replayInk(context, operations);
  context.restore();
}
