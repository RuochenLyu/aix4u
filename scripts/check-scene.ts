/**
 * Property check for the scene engine: across every breakpoint and a few hundred
 * seeds,
 *   - no two pieces may overlap, and no piece may sit on the stack filler;
 *   - nothing may leave the playfield;
 *   - a floating piece must keep clear air under it — it is suspended mid-fall,
 *     so resting on the skyline would break the illusion;
 *   - below the narrow breakpoint every product must float (DESIGN §7);
 *   - every face mark and the icon badge must stay inside the piece's own
 *     cells (DESIGN §3.3), so none of them can hang in the notch of an S, and a
 *     two-eyed preset's eyes must not overlap into one blob;
 *   - the stack reads as a low bed, not a clump (DESIGN §4.1 v2.1).
 *
 * v2 dropped the label assertions along with the label engine, v2.1 the band
 * assertions along with the band and traded the one standard eye for five face
 * presets. What is left is the part that was always the real invariant: the scene
 * is a legal Tetris frame, and every piece carries its own identity inside its
 * own silhouette.
 *
 * Run with `npm run check:scene`.
 */

import { buildScene, DEFAULT_SEED, type PiecePlacement, type Scene } from '../src/lib/scene';
import { SHAPES, hasCell } from '../src/lib/tetromino';
import { content, FACE_PRESETS, type ProductItem } from '../src/lib/content';

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

  // The stack has to read as a low bed (DESIGN §4.1 v2.1). Three properties say
  // that in numbers: it spans most of the floor, it is shallow nearly everywhere,
  // and nothing in it floats.
  const filled = scene.stackTops.filter((h) => h > 0).length;
  const span = filled / bp.cols;
  if (span < 0.8) found.push(`the stack spans only ${(span * 100).toFixed(0)}% of the floor`);

  const deepest = Math.max(0, ...scene.stackTops);
  if (deepest > bp.stackRows) found.push(`the stack is ${deepest} rows deep, past the ${bp.stackRows}-row bed`);

  const solid = new Set<string>();
  for (const cell of scene.filler) if (!cell.empty) solid.add(`${cell.x}:${cell.y}`);
  const tiles: PiecePlacement[] = [];
  for (const piece of scene.pieces) {
    if (piece.pool !== 'landed') continue;
    if (piece.shape === 'DOT') tiles.push(piece);
    for (const [dx, dy] of SHAPES[piece.shape].cells) solid.add(`${piece.x + dx}:${piece.y + dy}`);
  }

  // The bed's own depth is measured without the perched tiles: a collectible
  // sitting on a two-row bed is the design, a three-row bed under it is not.
  const bedTops = new Array<number>(bp.cols).fill(0);
  for (let x = 0; x < bp.cols; x++) {
    const tile = tiles.some((t) => t.x === x);
    bedTops[x] = Math.max(0, (scene.stackTops[x] ?? 0) - (tile ? 1 : 0));
  }
  const bumps = bedTops.filter((h) => h > 2).length;
  if (bumps > 2) found.push(`${bumps} columns of bed rise above two rows — that is a pile, not a bed`);

  // Holes, both kinds: the dashed slots the engine draws and the plain voids it
  // leaves by not emitting a block. Every one of them has to be covered from
  // above (or it is a dip in the skyline, not a hole), bridged from at least one
  // side (or the blocks over it are floating), and alone in its column (or the
  // bridge test passes cell by cell while the column as a whole comes apart).
  const holes: { x: number; y: number; what: string }[] = [];
  for (const cell of scene.filler) if (cell.empty) holes.push({ x: cell.x, y: cell.y, what: 'dashed slot' });
  for (let x = 0; x < bp.cols; x++) {
    for (let row = 0; row < (scene.stackTops[x] ?? 0); row++) {
      const y = bp.rows - 1 - row;
      const dashed = scene.filler.some((c) => c.empty && c.x === x && c.y === y);
      if (!solid.has(`${x}:${y}`) && !dashed) holes.push({ x, y, what: 'hollow gap' });
    }
  }

  const perColumn = new Map<number, number>();
  for (const hole of holes) {
    perColumn.set(hole.x, (perColumn.get(hole.x) ?? 0) + 1);
    let roof = false;
    for (let y = hole.y - 1; y >= 0; y--) if (solid.has(`${hole.x}:${y}`)) roof = true;
    if (!roof) found.push(`${hole.what} ${hole.x},${hole.y} has nothing over it — that is a dip, not a hole`);
    if (!solid.has(`${hole.x - 1}:${hole.y}`) && !solid.has(`${hole.x + 1}:${hole.y}`)) {
      found.push(`${hole.what} ${hole.x},${hole.y} is bridged from neither side`);
    }
  }
  for (const [x, count] of perColumn) {
    if (count > 1) found.push(`column ${x} has ${count} holes stacked in it`);
  }
  for (const tile of tiles) {
    if (tile.y === bp.rows - 1) continue;
    if (!solid.has(`${tile.x}:${tile.y + 1}`)) found.push(`link tile ${tile.id} perches on nothing`);
  }

  // The mystery `?` is a 1x1 tile on the bed (DESIGN §6.5 v2.1.2), so it answers
  // to the same rules the link tiles do: it stays in the field, it touches
  // nothing, and it stands on something.
  const egg: Rect = { x: scene.egg.x, y: scene.egg.y, w: 1, h: 1, what: 'the mystery tile' };
  if (egg.x < 0 || egg.y < 0 || egg.x + egg.w > bp.cols || egg.y + egg.h > bp.rows) {
    found.push('the mystery tile leaves the field');
  }
  for (const rect of [...pieceRects, ...fillerRects]) {
    if (overlaps(egg, rect)) found.push(`the mystery tile overlaps ${rect.what}`);
  }
  if (egg.y + 1 < bp.rows && !solid.has(`${egg.x}:${egg.y + 1}`)) {
    found.push('the mystery tile perches on nothing');
  }

  return found;
}

/**
 * Piece identity is static — it comes from products.json, not from the seed — so
 * it is checked once rather than per scene. With the sticker band retired (§3.2
 * v2.1) what is left is the face and the placeholder badge: both are drawn over
 * the artwork, so every mark has to sit inside the silhouette, not merely inside
 * the bounding box.
 */
function identityProblems(product: ProductItem): string[] {
  const found: string[] = [];
  const shape = SHAPES[product.shape];
  const preset = FACE_PRESETS[product.face.preset];

  /**
   * A mark is inside the piece when all four corners of its box land on cells the
   * shape actually occupies. The bounding box is not enough: an S's notch is
   * inside the box and outside the piece, and an eye drawn there would hang in
   * mid-air over the background (DESIGN §3.3, "clear of key skin features").
   */
  const marks: { what: string; x: number; y: number; w: number; h: number }[] = [
    { what: 'icon badge', x: product.iconAt.cx + product.iconAt.ax, y: product.iconAt.cy + product.iconAt.ay, w: 0.4, h: 0.4 },
    ...product.face.eyes.map((eye, i) => ({
      what: product.face.eyes.length > 1 ? `face eye ${i + 1}` : 'face eye',
      ...eye,
    })),
    ...(product.face.mouth ? [{ what: 'face mouth', ...product.face.mouth }] : []),
  ];

  for (const mark of marks) {
    for (const [dx, dy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ] as const) {
      const px = mark.x + dx * mark.w;
      const py = mark.y + dy * mark.h;
      // Nudge off the exact boundary so a mark flush with a silhouette edge is not
      // read as having crossed it.
      const cx = Math.floor(px + (dx < 0 ? EPSILON : -EPSILON));
      const cy = Math.floor(py + (dy < 0 ? EPSILON : -EPSILON));
      if (!hasCell(shape, cx, cy)) {
        found.push(
          `${product.id}: the ${mark.what} at (${mark.x}, ${mark.y}) crosses the ${product.shape} outline near cell (${cx}, ${cy})`,
        );
        break;
      }
    }
  }

  // The restraint rules, in numbers (DESIGN §3.3): at most two eyes and one small
  // mouth mark — the schema cannot express "two", but this can.
  if (preset.eyes.length < 1 || preset.eyes.length > 2) {
    found.push(`${product.id}: the ${product.face.preset} preset draws ${preset.eyes.length} eyes; the rule is one or two`);
  }

  // Two eyes have to be two eyes. Overlapping boxes are one blob with a seam, and
  // a blob is the failure mode the whole "alive, not a toy" line exists to avoid.
  if (product.face.eyes.length === 2) {
    const [a, b] = product.face.eyes as [(typeof product.face.eyes)[0], (typeof product.face.eyes)[0]];
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    const touching = (a.w + b.w) / 2;
    if (gap < touching + 0.02) {
      found.push(
        `${product.id}: its two eyes are ${gap.toFixed(3)} cells apart but ${touching.toFixed(3)} wide together — they overlap`,
      );
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
const faceMarks = content.products.reduce((n, p) => n + p.face.eyes.length + (p.face.mouth ? 1 : 0), 0);
console.log(
  `scene check: ${content.products.length} piece identities (${faceMarks} face marks), ${checked} scenes across ${VIEWPORTS.length} viewports, no overlaps.`,
);
