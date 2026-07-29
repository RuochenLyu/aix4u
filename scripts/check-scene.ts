/**
 * Property check for the scene engine: across every breakpoint and a few
 * hundred seeds,
 *   - no label card may overlap a piece, the stack or another card, and
 *     nothing may leave the playfield;
 *   - every card must stay attached to its own piece — touching it, or joined
 *     by a leader that crosses no piece and no other card (DESIGN §6);
 *   - below the narrow breakpoint every product must float, with its card
 *     directly above or below it.
 * Run with `npm run check:scene`.
 */

import { buildScene, DEFAULT_SEED, leaderHits, leaderSegments, type Scene } from '../src/lib/scene';
import { SHAPES } from '../src/lib/tetromino';
import { content } from '../src/lib/content';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  what: string;
}

const EPSILON = 1e-6;

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
    what: 'stack filler',
  }));
  const labelRects: Rect[] = scene.pieces
    .filter((piece) => piece.label)
    .map((piece) => ({
      x: piece.label!.x,
      y: piece.label!.y,
      w: piece.label!.w,
      h: piece.label!.h,
      what: `label ${piece.id}`,
    }));

  for (const label of labelRects) {
    if (
      label.x < -EPSILON ||
      label.y < -EPSILON ||
      label.x + label.w > bp.cols + EPSILON ||
      label.y + label.h > bp.rows + EPSILON
    ) {
      found.push(`${label.what} leaves the field`);
    }
    for (const other of [...pieceRects, ...fillerRects]) {
      if (overlaps(label, other)) found.push(`${label.what} overlaps ${other.what}`);
    }
  }

  for (let i = 0; i < labelRects.length; i++) {
    for (let j = i + 1; j < labelRects.length; j++) {
      if (overlaps(labelRects[i]!, labelRects[j]!)) {
        found.push(`${labelRects[i]!.what} overlaps ${labelRects[j]!.what}`);
      }
    }
  }

  for (const piece of scene.pieces) {
    const shape = SHAPES[piece.shape];
    if (piece.x < 0 || piece.y < 0 || piece.x + shape.width > bp.cols || piece.y + shape.height > bp.rows) {
      found.push(`piece ${piece.id} leaves the field`);
    }

    // Narrow screens float every product, so that each card can sit in its own
    // piece's band rather than somewhere on a crowded stack (DESIGN §6).
    if (bp.floatAll && piece.shape !== 'DOT' && piece.pool !== 'floating') {
      found.push(`piece ${piece.id} is landed on a float-all breakpoint`);
    }

    // The leader elbow is drawn in the strip between the card and its piece, so
    // the recorded side must be one that actually separates the two.
    const label = piece.label;
    if (!label) continue;
    const separates =
      label.side === 'right'
        ? label.x >= piece.x + shape.width - EPSILON
        : label.side === 'left'
          ? label.x + label.w <= piece.x + EPSILON
          : label.side === 'above'
            ? label.y + label.h <= piece.y + EPSILON
            : label.y >= piece.y + shape.height - EPSILON;
    if (!separates) found.push(`label ${piece.id} is not actually ${label.side} of its piece`);

    // Association is a hard constraint: a card is either touching its piece or
    // joined to it by a leader, and that leader may cross empty grid only.
    if (!label.connected) found.push(`label ${piece.id} has no leader to its piece`);

    // A leader may run over bare grid and over the anonymous stack filler; it
    // may never cross a piece or another card.
    const own = { x: piece.x, y: piece.y, w: shape.width, h: shape.height, what: `piece ${piece.id}` };
    const others = [...pieceRects, ...labelRects].filter(
      (rect) => rect.what !== own.what && rect.what !== `label ${piece.id}` && !overlaps(rect, own),
    );
    const card = { x: label.x, y: label.y, w: label.w, h: label.h };
    for (const segment of leaderSegments(card, piece, shape.width, shape.height)) {
      for (const other of others) {
        if (leaderHits(segment, other)) found.push(`leader ${piece.id} crosses ${other.what}`);
      }
    }

    if (bp.floatAll) {
      if (label.side !== 'above' && label.side !== 'below') {
        found.push(`label ${piece.id} sits ${label.side} of its piece on a float-all breakpoint`);
      }
      // "Directly above/below" — the card has to cover part of its own piece's
      // columns, otherwise it reads as belonging to whatever is beside it.
      if (label.x >= piece.x + shape.width - EPSILON || label.x + label.w <= piece.x + EPSILON) {
        found.push(`label ${piece.id} does not sit over its own piece`);
      }
      if (label.leader > 1.2) found.push(`label ${piece.id} floats ${label.leader} cells from its piece`);
    }
  }

  return found;
}

const VIEWPORTS = [1440, 1024, 900, 760, 480, 375, 320];
const SEEDS = 400;

let failures = 0;
let checked = 0;

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
console.log(`scene check: ${checked} scenes across ${VIEWPORTS.length} viewports, no overlaps.`);
