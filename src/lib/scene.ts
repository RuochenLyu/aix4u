/**
 * The scene engine.
 *
 * A single integer seed drives the whole composition. `buildScene()` is pure and
 * isomorphic: the page renders it at build time with DEFAULT_SEED so the static
 * HTML already carries usable positions (no-JS readability, see DESIGN §8), and
 * the browser re-runs the very same function with a random or ?seed= value.
 *
 * Model — two pools (DESIGN §3.2):
 *   floating  high-priority products, one per vertical lane, staggered heights;
 *   landed    everything else plus the link tiles, resting on an uneven stack
 *             that is grown from a random-walk skyline and deliberately keeps
 *             1-2 hollow gaps.
 * Lane count comes from the viewport, so pieces spill from the sky into the
 * stack as the screen narrows — a taller stack, never a cramped sky.
 *
 * All coordinates are in grid cells: x grows right, y grows down from the top
 * of the playfield. The renderer multiplies them by the CSS `--cell` length.
 */

import { SHAPES, type ShapeName } from './tetromino';
import type { SceneItem } from './content';

export const DEFAULT_SEED = 20260729;

export type Pool = 'floating' | 'landed';
export type LabelSide = 'left' | 'right' | 'above' | 'below';

export interface Breakpoint {
  name: 'narrow' | 'medium' | 'wide';
  /** Minimum viewport width (px) this breakpoint applies to. */
  minWidth: number;
  cols: number;
  rows: number;
  /** Vertical lanes available to the floating pool = floating capacity. */
  lanes: number;
  /** Rows the landed stack is allowed to grow into. */
  stackRows: number;
  /** Label card size in cells; the compact variant is used by landed pieces. */
  labelWidth: number;
  labelHeight: number;
  compactWidth: number;
  compactHeight: number;
  /** Floating labels sit beside the piece on roomy screens, above it otherwise. */
  labelBeside: boolean;
}

export const BREAKPOINTS: Breakpoint[] = [
  {
    name: 'wide',
    minWidth: 980,
    cols: 16,
    rows: 12,
    lanes: 4,
    stackRows: 4,
    labelWidth: 4.2,
    labelHeight: 1.6,
    compactWidth: 2.8,
    compactHeight: 0.85,
    labelBeside: true,
  },
  {
    name: 'medium',
    minWidth: 700,
    cols: 12,
    rows: 12,
    lanes: 3,
    stackRows: 4,
    labelWidth: 4.0,
    labelHeight: 1.6,
    compactWidth: 2.8,
    compactHeight: 0.85,
    labelBeside: true,
  },
  {
    name: 'narrow',
    minWidth: 0,
    cols: 9,
    rows: 14,
    lanes: 2,
    stackRows: 6,
    labelWidth: 4.4,
    labelHeight: 0.95,
    compactWidth: 2.8,
    compactHeight: 0.85,
    labelBeside: false,
  },
];

export function breakpointFor(viewportWidth: number): Breakpoint {
  return BREAKPOINTS.find((bp) => viewportWidth >= bp.minWidth) ?? BREAKPOINTS[BREAKPOINTS.length - 1]!;
}

export interface LabelPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  side: LabelSide;
  /** Leader-line length in cells, from the piece edge to the card. */
  leader: number;
  compact: boolean;
}

export interface PiecePlacement {
  id: string;
  pool: Pool;
  shape: ShapeName;
  x: number;
  y: number;
  /** Entry-animation order; landed pieces fall first (DESIGN §5.1). */
  order: number;
  /** Idle bob timing, per-piece so nothing breathes in unison. */
  bobPeriod: number;
  bobDelay: number;
  label: LabelPlacement | null;
}

export interface GhostPlacement {
  shape: ShapeName;
  x: number;
  duration: number;
  delay: number;
}

export interface Scene {
  seed: number;
  breakpoint: Breakpoint;
  pieces: PiecePlacement[];
  /** Anonymous blocks that make up the rest of the stack. */
  filler: { x: number; y: number }[];
  ghost: GhostPlacement;
}

/** mulberry32 — small, fast, and identical in Node and the browser. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffff) + 1;
}

type Rng = () => number;

const int = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

function shuffled<T>(rng: Rng, input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function buildScene(seed: number, viewportWidth: number, items: readonly SceneItem[]): Scene {
  const bp = breakpointFor(viewportWidth);
  const rng = createRandom(seed);

  const products = items
    .filter((item) => item.type === 'product')
    .sort((a, b) => (a.type === 'product' && b.type === 'product' ? a.priority - b.priority : 0));

  // Overflow rule: only as many protagonists as there are lanes.
  const floating = products.slice(0, bp.lanes);
  const landed: SceneItem[] = [...products.slice(bp.lanes), ...items.filter((item) => item.type === 'link')];

  const pieces: PiecePlacement[] = [];
  const occupied: Rect[] = [];

  const { filler, tops } = layoutStack(rng, bp, landed, pieces, occupied);
  layoutSky(rng, bp, floating, pieces, occupied, tops);

  // Landed pieces enter first, then the sky, bottom-up.
  pieces.sort((a, b) => (a.pool === b.pool ? b.y - a.y : a.pool === 'landed' ? -1 : 1));
  pieces.forEach((piece, index) => {
    piece.order = index;
  });

  placeLabels(bp, pieces, occupied, tops);

  const ghostShapes: ShapeName[] = ['T', 'L', 'S', 'O', 'I'];
  const ghost: GhostPlacement = {
    shape: ghostShapes[int(rng, 0, ghostShapes.length - 1)]!,
    x: int(rng, 0, bp.cols - 4),
    duration: int(rng, 16, 26),
    delay: int(rng, 0, 6),
  };

  return { seed, breakpoint: bp, pieces, filler, ghost };
}

/**
 * Grow the stack: a random-walk skyline, landed items dropped onto its flattest
 * runs, anonymous filler underneath, then 1-2 carved-out holes.
 * Returns the per-column stack height (in cells from the floor) so the sky
 * placement can stay clear of it.
 */
function layoutStack(
  rng: Rng,
  bp: Breakpoint,
  landed: readonly SceneItem[],
  pieces: PiecePlacement[],
  occupied: Rect[],
): { filler: { x: number; y: number }[]; tops: number[] } {
  const heights: number[] = [];
  let walk = int(rng, 1, 2);
  for (let c = 0; c < bp.cols; c++) {
    // A continuous floor with an uneven skyline; the gaps come from carved holes.
    walk = clamp(walk + int(rng, -1, 1), 1, 3);
    heights.push(walk);
  }

  const pieceCells = new Set<string>();
  const maxHeight = bp.stackRows;

  for (const item of shuffled(rng, landed)) {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const slots: { x: number; top: number }[] = [];
    for (let x = 0; x + shape.width <= bp.cols; x++) {
      let top = 0;
      for (let dx = 0; dx < shape.width; dx++) top = Math.max(top, heights[x + dx]!);
      if (top + shape.height <= maxHeight) slots.push({ x, top });
    }
    // Prefer the lowest landing spots, but keep some seed-driven variety.
    slots.sort((a, b) => a.top - b.top);
    const pick = slots[int(rng, 0, Math.min(2, slots.length - 1))] ?? { x: 0, top: 0 };

    const y = bp.rows - pick.top - shape.height;
    pieces.push({
      id: item.id,
      pool: 'landed',
      shape: item.type === 'product' ? item.shape : 'DOT',
      x: pick.x,
      y,
      order: 0,
      bobPeriod: 0,
      bobDelay: 0,
      label: null,
    });
    occupied.push({ x: pick.x, y, w: shape.width, h: shape.height });
    for (const [dx, dy] of shape.cells) {
      pieceCells.add(`${pick.x + dx}:${bp.rows - 1 - (pick.top + shape.height - 1 - dy)}`);
    }
    for (let dx = 0; dx < shape.width; dx++) heights[pick.x + dx] = pick.top + shape.height;
  }

  const filler: { x: number; y: number }[] = [];
  for (let x = 0; x < bp.cols; x++) {
    for (let row = 0; row < heights[x]!; row++) {
      const y = bp.rows - 1 - row;
      if (!pieceCells.has(`${x}:${y}`)) filler.push({ x, y });
    }
  }

  // Real stacks have holes. Only carve cells that are covered from above.
  const coverable = filler.filter((cell) => {
    const above = `${cell.x}:${cell.y - 1}`;
    return pieceCells.has(above) || filler.some((f) => f.x === cell.x && f.y === cell.y - 1);
  });
  const holes = int(rng, 1, 2);
  for (let i = 0; i < holes && coverable.length > 0; i++) {
    const victim = coverable.splice(int(rng, 0, coverable.length - 1), 1)[0]!;
    const index = filler.findIndex((f) => f.x === victim.x && f.y === victim.y);
    if (index >= 0) filler.splice(index, 1);
  }

  return { filler, tops: heights };
}

/** Hang the floating pool: one lane each, staggered heights, never over the stack. */
function layoutSky(
  rng: Rng,
  bp: Breakpoint,
  floating: readonly SceneItem[],
  pieces: PiecePlacement[],
  occupied: Rect[],
  tops: readonly number[],
): void {
  const laneWidth = bp.cols / bp.lanes;
  const lanes = shuffled(
    rng,
    Array.from({ length: bp.lanes }, (_, i) => i),
  );

  // Spread heights over the airy band above the stack, then shuffle the rows so
  // the skyline of floating pieces is uneven rather than a neat staircase.
  const bandTop = 0.6;
  const bandBottom = Math.max(bandTop + 1, bp.rows - bp.stackRows - 0.8);
  const step = (bandBottom - bandTop) / Math.max(1, floating.length - 1 || 1);
  const rows = shuffled(
    rng,
    floating.map((_, i) => bandTop + step * i),
  );

  floating.forEach((item, index) => {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const lane = lanes[index]!;
    const laneStart = lane * laneWidth;
    const slack = Math.max(0, laneWidth - shape.width);
    const x = clamp(Math.round(laneStart + rng() * slack), 0, bp.cols - shape.width);

    let y = rows[index]! + (rng() - 0.5) * 0.6;
    const floor = bp.rows - (tops[x] ?? 0) - shape.height - 1.4;
    y = clamp(y, 0.3, Math.max(0.3, floor));

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: item.type === 'product' ? item.shape : 'DOT',
      x,
      y: Math.round(y * 10) / 10,
      order: 0,
      bobPeriod: Math.round((3.4 + rng() * 2.6) * 10) / 10,
      bobDelay: Math.round(rng() * 30) / 10,
      label: null,
    });
    occupied.push({ x, y, w: shape.width, h: shape.height });
  });
}

const LABEL_GAP = 0.35;
/** Vertical slack (in cells) a beside-card may slide before we try another side. */
const LABEL_NUDGES = [0, -1.1, 1.1, -2.2, 2.2, -3.3, 3.3];

/**
 * Label cards: sides alternate left/right, a card slides vertically before it
 * gives up on a side, and every candidate is scored against the pieces, the
 * stack silhouette and the cards already placed. Lowest overlap wins, so a card
 * never sits on a piece and two cards never sit on each other.
 */
function placeLabels(bp: Breakpoint, pieces: PiecePlacement[], occupied: Rect[], tops: readonly number[]): void {
  const taken: Rect[] = [...occupied];
  for (let x = 0; x < bp.cols; x++) {
    const h = tops[x] ?? 0;
    if (h > 0) taken.push({ x, y: bp.rows - h, w: 1, h });
  }

  // Protagonists first: they get the roomiest slots.
  const ordered = [...pieces].sort((a, b) => (a.pool === b.pool ? 0 : a.pool === 'floating' ? -1 : 1));
  let besideIndex = 0;

  for (const piece of ordered) {
    if (piece.shape === 'DOT') continue; // link tiles speak for themselves
    const shape = SHAPES[piece.shape];
    const beside = piece.pool === 'floating' && bp.labelBeside;
    const compact = !beside;
    const w = compact ? bp.compactWidth : bp.labelWidth;
    const h = compact ? bp.compactHeight : bp.labelHeight;

    const centerX = clamp(piece.x + shape.width / 2 - w / 2, 0, Math.max(0, bp.cols - w));
    const middleY = piece.y + shape.height / 2 - h / 2;
    const candidates: { side: LabelSide; rect: Rect }[] = [];

    const sides: LabelSide[] = besideIndex++ % 2 === 0 ? ['right', 'left'] : ['left', 'right'];
    const pushBeside = (nudges: readonly number[]) => {
      for (const side of sides) {
        for (const dy of nudges) {
          candidates.push({
            side,
            rect: {
              x: side === 'right' ? piece.x + shape.width + LABEL_GAP : piece.x - LABEL_GAP - w,
              y: middleY + dy,
              w,
              h,
            },
          });
        }
      }
    };
    const pushStacked = () => {
      for (const dy of [0, -1.1, -2.2]) {
        candidates.push({ side: 'above', rect: { x: centerX, y: piece.y - h - LABEL_GAP + dy, w, h } });
      }
      for (const dy of [0, 1.1, 2.2]) {
        candidates.push({ side: 'below', rect: { x: centerX, y: piece.y + shape.height + LABEL_GAP + dy, w, h } });
      }
    };

    // Preferred arrangement first; the rest stay in the pool as fallbacks.
    if (beside) {
      pushBeside(LABEL_NUDGES);
      pushStacked();
    } else {
      pushStacked();
      pushBeside([0, -1.1, 1.1]);
    }

    let best = candidates[0]!;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const score = penalty(candidate.rect, taken, bp);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (bestScore === 0) break;
    }

    const rect = {
      ...best.rect,
      x: clamp(best.rect.x, 0, Math.max(0, bp.cols - w)),
      y: clamp(best.rect.y, 0, Math.max(0, bp.rows - h)),
    };
    taken.push(rect);
    piece.label = {
      x: Math.round(rect.x * 100) / 100,
      y: Math.round(rect.y * 100) / 100,
      w,
      h,
      side: best.side,
      leader: Math.round(leaderLength(best.side, rect, piece, shape.width, shape.height) * 100) / 100,
      compact,
    };
  }
}

/** The leader has to actually reach the piece, however far the card was pushed. */
function leaderLength(side: LabelSide, rect: Rect, piece: PiecePlacement, pw: number, ph: number): number {
  const distance =
    side === 'right'
      ? rect.x - (piece.x + pw)
      : side === 'left'
        ? piece.x - (rect.x + rect.w)
        : side === 'above'
          ? piece.y - (rect.y + rect.h)
          : rect.y - (piece.y + ph);
  return clamp(distance, LABEL_GAP, 4);
}

/** Overlap area against everything already placed, plus a penalty for leaving the field. */
function penalty(rect: Rect, taken: readonly Rect[], bp: Breakpoint): number {
  let score = 0;
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > bp.cols || rect.y + rect.h > bp.rows) score += 100;
  for (const other of taken) {
    if (!overlaps(rect, other)) continue;
    const dx = Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x);
    const dy = Math.min(rect.y + rect.h, other.y + other.h) - Math.max(rect.y, other.y);
    score += dx * dy;
  }
  return score;
}
