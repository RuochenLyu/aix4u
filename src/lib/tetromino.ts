/**
 * Tetromino geometry, in grid cells.
 *
 * Every shape is listed in its spawn orientation, cells given as [x, y] with the
 * origin at the shape's top-left bounding-box corner and y growing downwards.
 * `icon` is the index of the cell that carries the product's pixel icon.
 */

export interface Shape {
  cells: readonly (readonly [number, number])[];
  width: number;
  height: number;
  icon: number;
}

function shape(cells: readonly (readonly [number, number])[], icon: number): Shape {
  return {
    cells,
    width: Math.max(...cells.map(([x]) => x)) + 1,
    height: Math.max(...cells.map(([, y]) => y)) + 1,
    icon,
  };
}

export const SHAPES = {
  //  .X.        ..X        .XX        XX
  //  XXX        XXX        XX.        XX     XXXX
  T: shape([[1, 0], [0, 1], [1, 1], [2, 1]], 2),
  L: shape([[2, 0], [0, 1], [1, 1], [2, 1]], 1),
  S: shape([[1, 0], [2, 0], [0, 1], [1, 1]], 3),
  O: shape([[0, 0], [1, 0], [0, 1], [1, 1]], 0),
  I: shape([[0, 0], [1, 0], [2, 0], [3, 0]], 1),
  /** 1x1 tile used by link widgets. */
  DOT: shape([[0, 0]], 0),
} as const satisfies Record<string, Shape>;

export type ShapeName = keyof typeof SHAPES;

export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];
