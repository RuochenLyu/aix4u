/**
 * Tetromino geometry, in grid cells.
 *
 * Each shape is listed in its **canonical orientation** (DESIGN §3): the engine
 * never rotates a piece, because the orientation carries meaning — L is a pair
 * of axes, S is a wave, I is a strip, O is a page, T is a doorway — and the skin
 * and the eye are designed against that one silhouette.
 *
 * Cells are [x, y] with the origin at the bounding box's top-left corner and y
 * growing downwards. v2.1 retired the sticker band (DESIGN §3.2), so a shape is
 * now nothing but its silhouette.
 */

export interface Shape {
  cells: readonly (readonly [number, number])[];
  width: number;
  height: number;
  /** Prose description of the canonical orientation, for schema errors and docs. */
  orientation: string;
}

function shape(cells: readonly (readonly [number, number])[], orientation: string): Shape {
  return {
    cells,
    width: Math.max(...cells.map(([x]) => x)) + 1,
    height: Math.max(...cells.map(([, y]) => y)) + 1,
    orientation,
  };
}

export const SHAPES = {
  //  XXX        X..        .XX        XX
  //  .X.        XXX        XX.        XX     XXXX
  T: shape([[0, 0], [1, 0], [2, 0], [1, 1]], '3-wide bar up, stem down'),
  L: shape([[0, 0], [0, 1], [1, 1], [2, 1]], 'vertical arm top-left, 3-wide arm along the bottom'),
  S: shape([[1, 0], [2, 0], [0, 1], [1, 1]], 'horizontal wave, upper row shifted right'),
  O: shape([[0, 0], [1, 0], [0, 1], [1, 1]], '2x2 block'),
  I: shape([[0, 0], [1, 0], [2, 0], [3, 0]], '4-wide horizontal strip'),
  /** 1x1 tile used by link widgets and by the NEXT mystery block. */
  DOT: shape([[0, 0]], 'single cell'),
} as const satisfies Record<string, Shape>;

export type ShapeName = keyof typeof SHAPES;

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/**
 * The seven standard tetrominoes, for the background ghost only (DESIGN §6.2).
 * They are deliberately *not* in `SHAPES`: that table is the set a product may
 * pick from, and its members carry a semantic assignment (§3.1). The ghost is
 * scenery — it draws from the whole bag, including the J and Z no product uses.
 */
export const GHOST_SHAPES: readonly Shape[] = [
  shape([[0, 0], [1, 0], [2, 0], [3, 0]], 'I'),
  shape([[0, 0], [1, 0], [0, 1], [1, 1]], 'O'),
  shape([[0, 0], [1, 0], [2, 0], [1, 1]], 'T'),
  shape([[1, 0], [2, 0], [0, 1], [1, 1]], 'S'),
  shape([[0, 0], [1, 0], [1, 1], [2, 1]], 'Z'),
  shape([[0, 0], [0, 1], [1, 1], [2, 1]], 'J'),
  shape([[2, 0], [0, 1], [1, 1], [2, 1]], 'L'),
];

/**
 * Per-column silhouette extremes, in piece coordinates: for each column of the
 * bounding box, the top edge of its highest cell and the bottom edge of its
 * lowest (`bottoms[cx]` = cy + 1). This is what turns landing collision from
 * box-vs-box into tooth-vs-tooth (v2.1.4 device review): a T's stem column
 * reaches one row deeper than its shoulders, and the drop math has to know
 * that to slot the stem into a notch instead of perching the box on it.
 */
export interface ColumnProfile {
  tops: readonly number[];
  bottoms: readonly number[];
}

export function columnProfile(shape: Shape): ColumnProfile {
  const tops = new Array<number>(shape.width).fill(Number.POSITIVE_INFINITY);
  const bottoms = new Array<number>(shape.width).fill(0);
  for (const [x, y] of shape.cells) {
    tops[x] = Math.min(tops[x]!, y);
    bottoms[x] = Math.max(bottoms[x]!, y + 1);
  }
  return { tops, bottoms };
}

/** True when `cell` is one of the shape's cells. */
export function hasCell(shape: Shape, cx: number, cy: number): boolean {
  return shape.cells.some(([x, y]) => x === cx && y === cy);
}

/**
 * Which of a cell's four edges lie on the piece's silhouette (no neighbouring
 * cell across them). The renderer needs this twice: the CSS seam is only drawn
 * on silhouette edges now that skins bake their own interior grid (§3.1 v2.1),
 * and the extruded bottom edge (§2 v2.1) follows the bottom silhouette.
 */
export interface CellEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export function edgesOf(shape: Shape, cx: number, cy: number): CellEdges {
  return {
    top: !hasCell(shape, cx, cy - 1),
    right: !hasCell(shape, cx + 1, cy),
    bottom: !hasCell(shape, cx, cy + 1),
    left: !hasCell(shape, cx - 1, cy),
  };
}
