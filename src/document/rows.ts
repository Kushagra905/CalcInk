export const PAGE = Object.freeze({ width: 960, height: 480 });
export const ROWS = Object.freeze(
  [0, 160, 320].map((top, index) =>
    Object.freeze({
      id: `row-${index + 1}`,
      top,
      height: 160,
      writingHeight: 136,
      baseline: top + 104,
    }),
  ),
);

export function getRowConfig(rowId: string) {
  const row = ROWS.find((candidate) => candidate.id === rowId);
  if (!row) throw new RangeError(`Unknown row: ${rowId}`);
  return row;
}
