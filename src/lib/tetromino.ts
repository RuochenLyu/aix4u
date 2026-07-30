/**
 * Tetromino geometry, in grid cells.
 *
 * Each shape is listed in its **canonical orientation** (DESIGN §3): the engine
 * never rotates a piece, because the orientation carries meaning — L is a pair
 * of axes, S is a wave, I is a strip, O is a page, T is a doorway — and the
 * sticker band and the eye are designed against that one silhouette.
 *
 * Cells are [x, y] with the origin at the bounding box's top-left corner and y
 * growing downwards. `band` is the sticker strip that carries the product name,
 * in the same cell units, relative to the same origin.
 */

export interface BandGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lines the band is designed for; O is the only two-liner (DESIGN §3.2). */
  lines: 1 | 2;
}

export interface Shape {
  cells: readonly (readonly [number, number])[];
  width: number;
  height: number;
  /** Prose description of the canonical orientation, for schema errors and docs. */
  orientation: string;
  /** Link tiles are 1x1 and carry no name band. */
  band: BandGeometry | null;
}

function shape(
  cells: readonly (readonly [number, number])[],
  orientation: string,
  band: BandGeometry | null,
): Shape {
  return {
    cells,
    width: Math.max(...cells.map(([x]) => x)) + 1,
    height: Math.max(...cells.map(([, y]) => y)) + 1,
    orientation,
    band,
  };
}

/**
 * Bands sit in the lower half of their row, the way a sticker sits low on a
 * cartridge. That is not only a look: it leaves the top ~0.4 of the row clear,
 * which is where the eye and the placeholder icon badge live.
 */
export const SHAPES = {
  //  XXX        X..        .XX        XX
  //  .X.        XXX        XX.        XX     XXXX
  T: shape(
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    '3-wide bar up, stem down',
    { x: 0.14, y: 0.42, w: 2.72, h: 0.4, lines: 1 },
  ),
  L: shape(
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    'vertical arm top-left, 3-wide arm along the bottom',
    { x: 0.14, y: 1.42, w: 2.72, h: 0.4, lines: 1 },
  ),
  S: shape(
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    'horizontal wave, upper row shifted right',
    /*
     * DESIGN §3.2 asks for a band across "the waist row where all 3 columns have
     * coverage". No such row exists: a horizontal S is two offset pairs, so every
     * strip that spans all three columns crosses the notch, and a sticker with its
     * first glyphs hanging in empty air is worse than a narrower sticker. The band
     * therefore rides the lower arm — the trough of the wave — and the entry
     * carries the short `bandName` the same section asks for (`AHR999`), which fits
     * two cells with room to spare. The full name still ships in the info panel,
     * the sr-only line and the JSON-LD.
     */
    { x: 0.14, y: 1.42, w: 1.72, h: 0.4, lines: 1 },
  ),
  O: shape(
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    '2x2 block',
    { x: 0.11, y: 0.52, w: 1.78, h: 0.96, lines: 2 },
  ),
  I: shape(
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    '4-wide horizontal strip',
    { x: 0.14, y: 0.44, w: 3.72, h: 0.4, lines: 1 },
  ),
  /** 1x1 tile used by link widgets and by the NEXT mystery block. */
  DOT: shape([[0, 0]], 'single cell', null),
} as const satisfies Record<string, Shape>;

export type ShapeName = keyof typeof SHAPES;

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** True when `cell` is one of the shape's cells. */
export function hasCell(shape: Shape, cx: number, cy: number): boolean {
  return shape.cells.some(([x, y]) => x === cx && y === cy);
}
