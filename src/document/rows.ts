export const ROW_HEIGHT = 160;
export const ROW_COUNT = 8;
export const RULE_SPACING = 40;
export const PAGE = Object.freeze({
  width: 960,
  height: ROW_HEIGHT * ROW_COUNT,
});
export const ROWS = Object.freeze(
  Array.from({ length: ROW_COUNT }, (_, index) =>
    Object.freeze({
      id: `row-${index + 1}`,
      top: index * ROW_HEIGHT,
      height: ROW_HEIGHT,
      writingHeight: 136,
      baseline: index * ROW_HEIGHT + 104,
    }),
  ),
);

// Recognition identities are storage slots, not physical writing boundaries.
export const GROUPS = Object.freeze(
  Array.from({ length: 32 }, (_, index) =>
    Object.freeze({ id: `row-${index + 1}` }),
  ),
);

export function getRowConfig(rowId: string) {
  const row = ROWS.find((candidate) => candidate.id === rowId);
  if (row) return row;
  if (!GROUPS.some((group) => group.id === rowId))
    throw new RangeError(`Unknown row: ${rowId}`);
  return {
    id: rowId,
    top: 0,
    height: PAGE.height,
    writingHeight: PAGE.height,
    baseline: 104,
  };
}
