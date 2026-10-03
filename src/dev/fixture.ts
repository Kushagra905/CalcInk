import type { InkOperation } from "../document/types";
import { strokeBounds } from "../ink/geometry";

// Synthetic contract fixture; never include it in a handwriting accuracy benchmark.
const paths = [
  [
    [48, 52],
    [48, 102],
  ],
  [
    [84, 77],
    [74, 69],
    [74, 56],
    [85, 49],
    [97, 56],
    [97, 69],
    [84, 77],
    [73, 86],
    [74, 98],
    [86, 105],
    [98, 98],
    [97, 85],
    [84, 77],
  ],
  [
    [120, 77],
    [149, 77],
  ],
  [
    [135, 62],
    [135, 92],
  ],
  [
    [191, 49],
    [173, 82],
    [202, 82],
  ],
  [
    [195, 49],
    [195, 104],
  ],
  [
    [225, 62],
    [250, 93],
  ],
  [
    [250, 62],
    [225, 93],
  ],
  [
    [279, 52],
    [299, 52],
    [309, 63],
    [297, 77],
    [310, 89],
    [302, 103],
    [279, 103],
  ],
  [
    [334, 69],
    [366, 69],
  ],
  [
    [334, 87],
    [366, 87],
  ],
];

export function createFixture(): readonly InkOperation[] {
  return paths.map((path, index) => {
    const points = path.map(([x, y], t) => ({ x, y, t, pressure: 0.5 }));
    return {
      kind: "stroke",
      stroke: {
        id: `fixture-${index}`,
        rowId: "row-1",
        width: 3,
        points,
        bounds: strokeBounds(points, 3, "row-1"),
      },
    };
  });
}
