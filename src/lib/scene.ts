/**
 * The scene engine.
 *
 * A single integer seed drives the whole composition. `buildScene()` is pure and
 * isomorphic: the page renders it at build time with DEFAULT_SEED so the static
 * HTML already carries usable positions (no-JS readability, see DESIGN §8), and
 * the browser re-runs the very same function with a random or ?seed= value.
 *
 * Model — two pools (DESIGN §3.2):
 *   floating  high-priority products, one per vertical lane, staggered across
 *             the upper two thirds of the field;
 *   landed    everything else plus the link tiles, resting on an uneven stack
 *             that occupies a seed-placed window of the floor and deliberately
 *             keeps 1-2 hollow gaps.
 * Lane count comes from the viewport, so pieces spill from the sky into the
 * stack as the screen narrows — a taller stack, never a cramped sky.
 *
 * Label cards are a hard constraint: a card may never overlap a piece, the
 * stack or another card. `placeLabels` degrades (full card → name-only card →
 * nearest free slot) rather than accepting an overlap.
 *
 * All coordinates are in grid cells: x grows right, y grows down from the top
 * of the playfield. The renderer multiplies them by the CSS `--cell` length.
 */

import { SHAPES, type ShapeName } from './tetromino';
import type { SceneItem } from './content';

export const DEFAULT_SEED = 20260729;
/** Viewport width the build-time frame is composed for. */
export const DEFAULT_VIEWPORT = 1440;

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
  /** Rows the landed stack may grow into. */
  stackRows: number;
  /** Share of the floor the stack spans; the rest of the floor stays bare. */
  stackRatio: number;
  /** Label card size in cells; the compact variant drops the tagline. */
  labelWidth: number;
  labelHeight: number;
  compactWidth: number;
  compactHeight: number;
  /** Floating labels sit beside the piece on roomy screens, above/below otherwise. */
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
    stackRatio: 0.6,
    labelWidth: 4.2,
    labelHeight: 1.7,
    compactWidth: 2.9,
    compactHeight: 0.95,
    labelBeside: true,
  },
  {
    name: 'medium',
    minWidth: 700,
    cols: 12,
    rows: 12,
    lanes: 3,
    stackRows: 4,
    stackRatio: 0.7,
    labelWidth: 4.2,
    labelHeight: 1.7,
    compactWidth: 2.9,
    compactHeight: 0.95,
    labelBeside: true,
  },
  {
    name: 'narrow',
    minWidth: 0,
    cols: 9,
    rows: 16,
    lanes: 2,
    stackRows: 5,
    stackRatio: 0.9,
    labelWidth: 4.4,
    labelHeight: 1.05,
    compactWidth: 3.2,
    compactHeight: 1.05,
    labelBeside: false,
  },
];

/**
 * Which way the leader elbow bends away from the card's centre line.
 * `flat` means the card lines up with its piece and the leader is straight.
 */
export function crossDirection(cross: number): 'flat' | 'start' | 'end' {
  if (Math.abs(cross) < 0.06) return 'flat';
  return cross > 0 ? 'end' : 'start';
}

export function breakpointFor(viewportWidth: number): Breakpoint {
  return BREAKPOINTS.find((bp) => viewportWidth >= bp.minWidth) ?? BREAKPOINTS[BREAKPOINTS.length - 1]!;
}

export interface LabelPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  side: LabelSide;
  /** False when the card sits too far away to draw a leader without crossing the scene. */
  connected: boolean;
  /** Leader-line run along the card→piece axis, in cells. */
  leader: number;
  /** Signed offset across that axis; the leader draws an elbow when non-zero. */
  cross: number;
  crossAbs: number;
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

export interface FillerCell {
  x: number;
  y: number;
  /** 0-2: a hair of tonal variation so the stack is not one flat slab. */
  tone: number;
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
  filler: FillerCell[];
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
const round = (v: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round(v * factor) / factor;
};

export interface Rect {
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
 * Grow the stack inside a seed-placed window of the floor: a ragged skyline
 * (neighbouring columns always differ by 1-2 cells), landed items dropped onto
 * its flattest runs, anonymous filler underneath, then 1-2 carved-out holes.
 * Returns the per-column stack height so the sky can stay clear of it.
 */
function layoutStack(
  rng: Rng,
  bp: Breakpoint,
  landed: readonly SceneItem[],
  pieces: PiecePlacement[],
  occupied: Rect[],
): { filler: FillerCell[]; tops: number[] } {
  const widest = landed.reduce(
    (max, item) => Math.max(max, SHAPES[item.type === 'product' ? item.shape : 'DOT'].width),
    1,
  );
  const stackWidth = clamp(Math.round(bp.cols * bp.stackRatio), widest + 1, bp.cols);
  const stackStart = int(rng, 0, bp.cols - stackWidth);
  const stackEnd = stackStart + stackWidth;
  const maxHeight = bp.stackRows;

  const heights: number[] = new Array<number>(bp.cols).fill(0);
  let walk = int(rng, 1, 3);
  for (let x = stackStart; x < stackEnd; x++) {
    heights[x] = walk;
    // Always step, so the skyline never flattens into a table edge.
    walk = clamp(walk + int(rng, 1, 2) * (rng() < 0.5 ? -1 : 1), 1, maxHeight - 1);
  }

  const pieceCells = new Set<string>();

  for (const item of shuffled(rng, landed)) {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const slots: { x: number; top: number }[] = [];
    for (let x = stackStart; x + shape.width <= stackEnd; x++) {
      let top = 0;
      for (let dx = 0; dx < shape.width; dx++) top = Math.max(top, heights[x + dx]!);
      if (top + shape.height <= maxHeight + 1) slots.push({ x, top });
    }
    // Prefer the lowest landing spots, but keep some seed-driven variety.
    slots.sort((a, b) => a.top - b.top);
    const pick = slots[int(rng, 0, Math.min(2, slots.length - 1))] ?? { x: stackStart, top: 0 };

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
    for (const [dx, dy] of shape.cells) pieceCells.add(`${pick.x + dx}:${y + dy}`);
    for (let dx = 0; dx < shape.width; dx++) heights[pick.x + dx] = pick.top + shape.height;
  }

  const filler: FillerCell[] = [];
  for (let x = 0; x < bp.cols; x++) {
    for (let row = 0; row < heights[x]!; row++) {
      const y = bp.rows - 1 - row;
      if (!pieceCells.has(`${x}:${y}`)) filler.push({ x, y, tone: int(rng, 0, 2) });
    }
  }

  // Real stacks have holes. Only carve cells that are covered from above.
  const coverable = filler.filter(
    (cell) => pieceCells.has(`${cell.x}:${cell.y - 1}`) || filler.some((f) => f.x === cell.x && f.y === cell.y - 1),
  );
  for (let i = 0, holes = int(rng, 1, 2); i < holes && coverable.length > 0; i++) {
    const victim = coverable.splice(int(rng, 0, coverable.length - 1), 1)[0]!;
    const index = filler.findIndex((f) => f.x === victim.x && f.y === victim.y);
    if (index >= 0) filler.splice(index, 1);
  }

  return { filler, tops: heights };
}

/**
 * Hang the floating pool: one lane each, heights spread across the upper two
 * thirds of the field, never over the stack.
 */
function layoutSky(
  rng: Rng,
  bp: Breakpoint,
  floating: readonly SceneItem[],
  pieces: PiecePlacement[],
  occupied: Rect[],
  tops: readonly number[],
): void {
  if (floating.length === 0) return;

  const laneWidth = bp.cols / bp.lanes;
  const lanes = shuffled(
    rng,
    Array.from({ length: bp.lanes }, (_, i) => i),
  );

  const stackTop = Math.max(0, ...tops);
  const bandTop = 0.3;
  const bandBottom = Math.max(bandTop + 1.5, Math.min(bp.rows * 0.68, bp.rows - stackTop - 1.4) - 2);
  const span = bandBottom - bandTop;
  const slots = shuffled(
    rng,
    floating.map((_, i) => bandTop + (floating.length === 1 ? span / 2 : (span / (floating.length - 1)) * i)),
  );

  floating.forEach((item, index) => {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const lane = lanes[index]!;
    const slack = Math.max(0, laneWidth - shape.width);
    const x = clamp(Math.round(lane * laneWidth + rng() * slack), 0, bp.cols - shape.width);

    const floor = bp.rows - (tops[x] ?? 0) - shape.height - 1.2;
    const y = clamp(slots[index]! + (rng() - 0.5) * 0.5, bandTop, Math.max(bandTop, floor));

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: item.type === 'product' ? item.shape : 'DOT',
      x,
      y: round(y, 1),
      order: 0,
      bobPeriod: round(3.4 + rng() * 2.6, 1),
      bobDelay: round(rng() * 3, 1),
      label: null,
    });
    occupied.push({ x, y, w: shape.width, h: shape.height });
  });
}

const LABEL_GAP = 0.4;
/** Past this run (or elbow) the leader would slice across the scene, so we drop it. */
const LABEL_LEADER_MAX = 2.6;
/** Cross-axis slack (in cells) a card may slide before we try another side. */
const LABEL_NUDGES = [0, -1.2, 1.2, -2.4, 2.4];

interface LabelSize {
  w: number;
  h: number;
  compact: boolean;
}

/**
 * Label cards, in order of preference:
 *   1. the full card beside (or above/below) its piece,
 *   2. the same positions with the tagline dropped,
 *   3. the nearest free slot anywhere on the field.
 * Overlap is a hard failure at every step, so a card only ever covers something
 * if the field has genuinely run out of room.
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
    if (piece.shape === 'DOT') continue; // link tiles use a hover tooltip instead
    const shape = SHAPES[piece.shape];
    const beside = piece.pool === 'floating' && bp.labelBeside;
    const sides: LabelSide[] = besideIndex++ % 2 === 0 ? ['right', 'left'] : ['left', 'right'];

    const full: LabelSize = beside
      ? { w: bp.labelWidth, h: bp.labelHeight, compact: false }
      : { w: bp.compactWidth, h: bp.compactHeight, compact: true };
    const small: LabelSize = { w: bp.compactWidth, h: bp.compactHeight, compact: true };

    let chosen: { rect: Rect; size: LabelSize } | null = null;
    for (const size of full.compact ? [full] : [full, small]) {
      const hit = labelCandidates(bp, piece, shape.width, shape.height, size, beside, sides).find(
        (rect) => penalty(rect, taken, bp) === 0,
      );
      if (hit) {
        chosen = { rect: hit, size };
        break;
      }
    }
    chosen ??= scanForSlot(bp, piece, shape.width, shape.height, small, taken);
    chosen ??= {
      rect: {
        x: clamp(piece.x + shape.width / 2 - small.w / 2, 0, Math.max(0, bp.cols - small.w)),
        y: clamp(piece.y - small.h - LABEL_GAP, 0, Math.max(0, bp.rows - small.h)),
        w: small.w,
        h: small.h,
      },
      size: small,
    };

    const { rect, size } = chosen;
    taken.push(rect);

    // The side is re-derived from the geometry rather than trusted from the
    // candidate: the leader elbow only stays clear of the piece if it is drawn
    // on an axis that actually separates the card from it.
    const side = separatingSide(rect, piece, shape.width, shape.height);
    const horizontal = side === 'left' || side === 'right';
    const pieceCenter = horizontal ? piece.y + shape.height / 2 : piece.x + shape.width / 2;
    const cardCenter = horizontal ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
    const run =
      side === 'right'
        ? rect.x - (piece.x + shape.width)
        : side === 'left'
          ? piece.x - (rect.x + rect.w)
          : side === 'above'
            ? piece.y - (rect.y + rect.h)
            : rect.y - (piece.y + shape.height);

    const cross = pieceCenter - cardCenter;
    const connected = run <= LABEL_LEADER_MAX && Math.abs(cross) <= LABEL_LEADER_MAX;

    piece.label = {
      x: round(rect.x),
      y: round(rect.y),
      w: size.w,
      h: size.h,
      side,
      connected,
      leader: connected ? round(Math.max(run, LABEL_GAP)) : 0,
      cross: connected ? round(cross) : 0,
      crossAbs: connected ? round(Math.abs(cross)) : 0,
      compact: size.compact,
    };
  }
}

/**
 * Which side of the piece the card really sits on. A card and its piece never
 * overlap, so at least one axis separates them; when both do (a diagonal
 * placement) the roomier gap wins, which gives the leader a longer run.
 */
export function separatingSide(rect: Rect, piece: PiecePlacement, pw: number, ph: number): LabelSide {
  const right = rect.x - (piece.x + pw);
  const left = piece.x - (rect.x + rect.w);
  const below = rect.y - (piece.y + ph);
  const above = piece.y - (rect.y + rect.h);

  const horizontal = right >= 0 ? { side: 'right' as const, gap: right } : left >= 0 ? { side: 'left' as const, gap: left } : null;
  const vertical = below >= 0 ? { side: 'below' as const, gap: below } : above >= 0 ? { side: 'above' as const, gap: above } : null;

  if (horizontal && vertical) return horizontal.gap >= vertical.gap ? horizontal.side : vertical.side;
  return horizontal?.side ?? vertical?.side ?? 'above';
}

function labelCandidates(
  bp: Breakpoint,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  size: LabelSize,
  beside: boolean,
  sides: readonly LabelSide[],
): Rect[] {
  const { w, h } = size;
  const centerX = clamp(piece.x + pw / 2 - w / 2, 0, Math.max(0, bp.cols - w));
  const middleY = piece.y + ph / 2 - h / 2;
  const candidates: Rect[] = [];

  const pushBeside = () => {
    for (const side of sides) {
      for (const dy of LABEL_NUDGES) {
        candidates.push({
          x: side === 'right' ? piece.x + pw + LABEL_GAP : piece.x - LABEL_GAP - w,
          y: middleY + dy,
          w,
          h,
        });
      }
    }
  };
  const pushStacked = () => {
    for (const dy of [0, -1.2, -2.4]) candidates.push({ x: centerX, y: piece.y - h - LABEL_GAP + dy, w, h });
    for (const dy of [0, 1.2, 2.4]) candidates.push({ x: centerX, y: piece.y + ph + LABEL_GAP + dy, w, h });
  };

  // Narrow screens keep cards directly above or below their piece (DESIGN §6),
  // so beside placement is not even offered there.
  if (beside) {
    pushBeside();
    pushStacked();
  } else {
    pushStacked();
  }
  return candidates;
}

/** Last structured resort: the free slot nearest the piece, scanned on a half-cell grid. */
function scanForSlot(
  bp: Breakpoint,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  size: LabelSize,
  taken: readonly Rect[],
): { rect: Rect; size: LabelSize } | null {
  const anchorX = piece.x + pw / 2;
  const anchorY = piece.y + ph / 2;
  let best: { rect: Rect; size: LabelSize } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y <= bp.rows - size.h; y += 0.5) {
    for (let x = 0; x <= bp.cols - size.w; x += 0.5) {
      const rect: Rect = { x, y, w: size.w, h: size.h };
      if (penalty(rect, taken, bp) !== 0) continue;
      const dx = x + size.w / 2 - anchorX;
      const dy = y + size.h / 2 - anchorY;
      const distance = dx * dx + dy * dy;
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = { rect, size };
    }
  }
  return best;
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
