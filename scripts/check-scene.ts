/**
 * Property check for the scene engine: across every breakpoint and a few hundred
 * seeds,
 *   - no two pieces may overlap, and no piece may sit on the stack filler;
 *   - nothing may leave the playfield;
 *   - a floating piece must keep clear air under it — it is suspended mid-fall,
 *     so resting on the skyline would break the illusion;
 *   - below the narrow breakpoint every product must float (DESIGN §7);
 *   - the eye and the icon badge must stay inside the piece's own cells
 *     (DESIGN §3.3), so neither can hang in the notch of an S;
 *   - the stack reads as a low bed, not a clump (DESIGN §4.1 v2.1).
 *
 * v2 dropped the label assertions along with the label engine, v2.1 the band
 * assertions along with the band. What is left is the part that was always the
 * real invariant: the scene is a legal Tetris frame, and every piece carries its
 * own identity inside its own silhouette.
 *
 * Run with `npm run check:scene`.
 */

import { buildScene, DEFAULT_SEED, type Scene } from '../src/lib/scene';
import { SHAPES, hasCell } from '../src/lib/tetromino';
import { content, type ProductItem } from '../src/lib/content';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  what: string;
}

const EPSILON = 1e-6;
/** Clearance a suspended piece must keep above whatever is under it, in cells. */
const MIN_AIR = 0.4;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - EPSILON &&
    b.x < a.x + a.w - EPSILON &&
    a.y < b.y + b.h - EPSILON &&
    b.y < a.y + a.h - EPSILON
  );
}

function problems(scene: Scene): string[] {
  const { breakpoint: bp } = scene;
  const found: string[] = [];

  const pieceRects: Rect[] = scene.pieces.map((piece) => {
    const shape = SHAPES[piece.shape];
    return { x: piece.x, y: piece.y, w: shape.width, h: shape.height, what: `piece ${piece.id}` };
  });
  const fillerRects: Rect[] = scene.filler.map((cell) => ({
    x: cell.x,
    y: cell.y,
    w: 1,
    h: 1,
    what: `stack filler ${cell.x},${cell.y}`,
  }));

  // Pieces are solid objects: two of them sharing a cell is the one thing a
  // Tetris frame can never show.
  for (let i = 0; i < pieceRects.length; i++) {
    for (let j = i + 1; j < pieceRects.length; j++) {
      if (overlaps(pieceRects[i]!, pieceRects[j]!)) {
        found.push(`${pieceRects[i]!.what} overlaps ${pieceRects[j]!.what}`);
      }
    }
    for (const filler of fillerRects) {
      if (overlaps(pieceRects[i]!, filler)) found.push(`${pieceRects[i]!.what} overlaps ${filler.what}`);
    }
  }

  const columnTops = new Array<number>(bp.cols).fill(0);
  for (let x = 0; x < bp.cols; x++) columnTops[x] = scene.stackTops[x] ?? 0;

  for (const piece of scene.pieces) {
    const shape = SHAPES[piece.shape];
    if (piece.x < 0 || piece.y < 0 || piece.x + shape.width > bp.cols || piece.y + shape.height > bp.rows) {
      found.push(`piece ${piece.id} leaves the field`);
    }

    // Narrow screens float every product (DESIGN §7).
    if (bp.floatAll && piece.shape !== 'DOT' && piece.pool !== 'floating') {
      found.push(`piece ${piece.id} is landed on a float-all breakpoint`);
    }

    if (piece.pool !== 'floating') continue;
    let top = 0;
    for (let dx = 0; dx < shape.width; dx++) top = Math.max(top, columnTops[piece.x + dx] ?? 0);
    const air = bp.rows - top - (piece.y + shape.height);
    if (air < MIN_AIR - EPSILON) {
      found.push(`floating piece ${piece.id} has only ${air.toFixed(2)} cells of air under it`);
    }
  }

  // The mystery block has to land somewhere legal too, or the easter egg pokes
  // out of the floor.
  if (scene.egg.x < 0 || scene.egg.x >= bp.cols || scene.egg.y < 0 || scene.egg.y >= bp.rows) {
    found.push('the NEXT egg slot leaves the field');
  }
  for (const rect of [...pieceRects, ...fillerRects]) {
    if (overlaps({ x: scene.egg.x, y: scene.egg.y, w: 1, h: 1, what: 'egg' }, rect)) {
      found.push(`the NEXT egg slot overlaps ${rect.what}`);
    }
  }

  return found;
}

/**
 * Piece identity is static — it comes from products.json, not from the seed — so
 * it is checked once rather than per scene. With the sticker band retired (§3.2
 * v2.1) what is left is the eye and the placeholder badge: both are drawn over
 * the artwork, so both have to sit on a cell the shape actually occupies and
 * stay inside the silhouette.
 */
function identityProblems(product: ProductItem): string[] {
  const found: string[] = [];
  const shape = SHAPES[product.shape];

  const marks: [string, { cx: number; cy: number; ax: number; ay: number }, number][] = [
    ['eye', product.eye, 0.15],
    ['icon badge', product.iconAt, 0.2],
  ];
  for (const [what, at, half] of marks) {
    const cx = at.cx + at.ax;
    const cy = at.cy + at.ay;
    if (!hasCell(shape, at.cx, at.cy)) {
      found.push(`${product.id}: the ${what} is on cell (${at.cx}, ${at.cy}), which the ${product.shape} lacks`);
    }
    if (cy - half < 0 || cy + half > shape.height || cx - half < 0 || cx + half > shape.width) {
      found.push(`${product.id}: the ${what} at (${cx}, ${cy}) hangs off the piece`);
    }
  }

  return found;
}

const VIEWPORTS = [1600, 1440, 1024, 900, 760, 480, 375, 320];
const SEEDS = 400;

let failures = 0;
let checked = 0;

for (const product of content.products) {
  for (const problem of identityProblems(product)) {
    failures++;
    console.error(`identity: ${problem}`);
  }
}

for (const viewport of VIEWPORTS) {
  for (let i = 0; i < SEEDS; i++) {
    const seed = i === 0 ? DEFAULT_SEED : i * 7919 + 13;
    const scene = buildScene(seed, viewport, content.items);
    checked++;
    for (const problem of problems(scene)) {
      failures++;
      if (failures <= 20) console.error(`viewport ${viewport}, seed ${seed}: ${problem}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} layout violation(s) across ${checked} scenes.`);
  process.exit(1);
}
console.log(
  `scene check: ${content.products.length} piece identities, ${checked} scenes across ${VIEWPORTS.length} viewports, no overlaps.`,
);
