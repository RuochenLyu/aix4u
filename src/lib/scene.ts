/**
 * The scene engine.
 *
 * A single integer seed drives the whole composition. `buildScene()` is pure and
 * isomorphic: the page renders it at build time with DEFAULT_SEED so the static
 * HTML already carries usable positions (no-JS readability, see DESIGN §9), and
 * the browser re-runs the very same function with a random or ?seed= value.
 *
 * Model — two pools (DESIGN §4.1):
 *   floating  high-priority products, one per vertical lane, staggered across
 *             the upper two thirds of the field;
 *   landed    everything else plus the link tiles, resting on an uneven stack
 *             that occupies a seed-placed window of the floor and deliberately
 *             keeps 1-2 hollow gaps.
 * Lane count comes from the viewport, so pieces spill from the sky into the
 * stack as the screen narrows — a taller stack, never a cramped sky. Below the
 * narrow breakpoint that inverts (DESIGN §7): every product floats in its own
 * band and the stack keeps only link tiles.
 *
 * v2 removed the label-placement engine. Names live *on* the piece now (the
 * sticker band, DESIGN §3.2) and the long copy lives in the one fixed info
 * panel (§4.4), so there is nothing left to route around the scene: the engine
 * only has to keep pieces off each other and off the stack.
 *
 * All coordinates are in grid cells: x grows right, y grows down from the top
 * of the playfield. The renderer multiplies them by the CSS `--cell` length.
 */

import { SHAPES, GHOST_SHAPES, type ShapeName } from './tetromino';
import type { SceneItem } from './content';

export const DEFAULT_SEED = 20260729;
/** Viewport width the build-time frame is composed for. */
export const DEFAULT_VIEWPORT = 1440;

export type Pool = 'floating' | 'landed';

export interface Breakpoint {
  name: 'narrow' | 'medium' | 'wide';
  /** Minimum viewport width (px) this breakpoint applies to. */
  minWidth: number;
  cols: number;
  /** Field height. `floatAll` fields grow past this to fit their column. */
  rows: number;
  /** Vertical lanes available to the floating pool = floating capacity. */
  lanes: number;
  /** Rows the landed stack may grow into. */
  stackRows: number;
  /** Share of the floor the stack spans; the rest of the floor stays bare. */
  stackRatio: number;
  /** Narrow screens float every product; the stack keeps only link tiles. */
  floatAll: boolean;
}

export const BREAKPOINTS: Breakpoint[] = [
  { name: 'wide', minWidth: 980, cols: 16, rows: 12, lanes: 4, stackRows: 4, stackRatio: 0.6, floatAll: false },
  { name: 'medium', minWidth: 700, cols: 12, rows: 12, lanes: 3, stackRows: 4, stackRatio: 0.8, floatAll: false },
  // `lanes` is unused here: every product floats, and `rows` is only the floor —
  // the field grows to whatever the column of pieces needs.
  { name: 'narrow', minWidth: 0, cols: 9, rows: 13, lanes: 0, stackRows: 4, stackRatio: 0.9, floatAll: true },
];

export function breakpointFor(viewportWidth: number): Breakpoint {
  return BREAKPOINTS.find((bp) => viewportWidth >= bp.minWidth) ?? BREAKPOINTS[BREAKPOINTS.length - 1]!;
}

export interface PiecePlacement {
  id: string;
  pool: Pool;
  shape: ShapeName;
  x: number;
  y: number;
  /** Entry-animation order; landed pieces fall first (DESIGN §6.1). */
  order: number;
  /** Idle bob timing, per-piece so nothing breathes in unison. */
  bobPeriod: number;
  bobDelay: number;
  /** Eye blink timing, seeded so the pieces never blink in chorus (DESIGN §3.3). */
  blinkPeriod: number;
  blinkDelay: number;
}

export interface FillerCell {
  x: number;
  y: number;
  /** 0-2: a hair of tonal variation so the stack is not one flat slab. */
  tone: number;
  /**
   * A hole in the stack. Real Tetris stacks have them, and drawing them as
   * dashed outlines rather than nothing says "game in progress" out loud
   * (DESIGN §2).
   */
  empty: boolean;
}

/**
 * The background ghost (DESIGN §6.2). `shape` indexes `GHOST_SHAPES`, the full
 * bag of seven standard tetrominoes — the ghost is scenery, so it is not limited
 * to the five silhouettes the products claimed. Each cycle draws again (see
 * `rollGhost`), which is why this is a roll rather than a fixed placement.
 */
export interface GhostPlacement {
  shape: number;
  x: number;
  duration: number;
  delay: number;
}

export function rollGhost(rng: Rng, cols: number): GhostPlacement {
  const shape = int(rng, 0, GHOST_SHAPES.length - 1);
  return {
    shape,
    x: int(rng, 0, Math.max(0, cols - GHOST_SHAPES[shape]!.width)),
    duration: int(rng, 16, 26),
    delay: 0,
  };
}

/** Where the NEXT mystery block lands if the easter egg fires (DESIGN §6.5). */
export interface EggPlacement {
  x: number;
  y: number;
}

export interface Scene {
  seed: number;
  breakpoint: Breakpoint;
  pieces: PiecePlacement[];
  /** Anonymous blocks that make up the rest of the stack. */
  filler: FillerCell[];
  /** Per-column stack height, so overlays can find the skyline. */
  stackTops: number[];
  ghost: GhostPlacement;
  egg: EggPlacement;
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

/** Clearance kept between a floating piece and whatever is under it, in cells. */
const SKY_CLEARANCE = 0.6;
/** Vertical breathing room between two stacked bands on a narrow screen. */
const BAND_GAP = 0.75;

function shapeOf(item: SceneItem): ShapeName {
  return item.type === 'product' ? item.shape : 'DOT';
}

export function buildScene(seed: number, viewportWidth: number, items: readonly SceneItem[]): Scene {
  const base = breakpointFor(viewportWidth);
  const rng = createRandom(seed);

  const products = items
    .filter((item) => item.type === 'product')
    .sort((a, b) => (a.type === 'product' && b.type === 'product' ? a.priority - b.priority : 0));

  // Overflow rule: only as many protagonists as there are lanes — unless the
  // breakpoint floats everything, in which case the stack is links-only.
  const floating = base.floatAll ? products : products.slice(0, base.lanes);
  const landed: SceneItem[] = base.floatAll
    ? items.filter((item) => item.type === 'link')
    : [...products.slice(base.lanes), ...items.filter((item) => item.type === 'link')];

  const pieces: PiecePlacement[] = [];

  let bp = base;
  let filler: FillerCell[];
  let tops: number[];

  if (base.floatAll) {
    // The column of pieces is laid out from the top down, so the field height
    // falls out of the layout rather than constraining it; the floor goes under.
    const skyBottom = layoutColumn(rng, base, floating, pieces);
    bp = { ...base, rows: Math.max(base.rows, Math.ceil(skyBottom + SKY_CLEARANCE) + base.stackRows) };
    ({ filler, tops } = layoutStack(rng, bp, landed, pieces));
  } else {
    ({ filler, tops } = layoutStack(rng, bp, landed, pieces));
    layoutSky(rng, bp, floating, pieces, tops);
  }

  // Landed pieces enter first, then the sky, bottom-up.
  pieces.sort((a, b) => (a.pool === b.pool ? b.y - a.y : a.pool === 'landed' ? -1 : 1));
  pieces.forEach((piece, index) => {
    piece.order = index;
    piece.blinkPeriod = round(4 + rng() * 4, 1);
    piece.blinkDelay = round(rng() * piece.blinkPeriod, 1);
  });

  const ghost: GhostPlacement = { ...rollGhost(rng, bp.cols), delay: int(rng, 0, 6) };

  return { seed, breakpoint: bp, pieces, filler, stackTops: tops, ghost, egg: eggSlot(rng, bp, tops, pieces) };
}

/**
 * A free 1x1 landing spot for the NEXT mystery block: on top of the shortest
 * column that is actually part of the stack. It has to be somewhere the block
 * visibly *joins* the stack, otherwise the joke reads as a stray tile — and it
 * must not land inside a suspended piece, which is why the floating pool is an
 * obstacle here and not just the skyline.
 */
function eggSlot(
  rng: Rng,
  bp: Breakpoint,
  tops: readonly number[],
  pieces: readonly PiecePlacement[],
): EggPlacement {
  const blocked = (x: number, y: number): boolean =>
    pieces.some((piece) => {
      const shape = SHAPES[piece.shape];
      return x < piece.x + shape.width && piece.x < x + 1 && y < piece.y + shape.height && piece.y < y + 1;
    });

  // One candidate per column: the cell directly on top of that column's stack,
  // which is free of filler and of landed pieces by construction.
  const slots = tops
    .map((h, x) => ({ x, y: bp.rows - h - 1, onStack: h > 0 }))
    .filter((slot) => slot.y >= 0 && !blocked(slot.x, slot.y));

  // Prefer a dip in the skyline, so the block tucks into the stack; a bare patch
  // of floor is the fallback, and only a completely boxed-in field gives up.
  const onStack = slots.filter((slot) => slot.onStack);
  const pool = onStack.length > 0 ? onStack : slots;
  if (pool.length === 0) return { x: 0, y: 0 };
  const lowest = Math.max(...pool.map((slot) => slot.y));
  const candidates = pool.filter((slot) => slot.y === lowest);
  const pick = candidates[int(rng, 0, candidates.length - 1)]!;
  return { x: pick.x, y: pick.y };
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
): { filler: FillerCell[]; tops: number[] } {
  const widest = landed.reduce((max, item) => Math.max(max, SHAPES[shapeOf(item)].width), 1);
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
  // Widest product first: a wide piece dropped after the narrow ones finds the
  // floor already fragmented into runs too short to hold it.
  const order = [
    ...shuffled(
      rng,
      landed.filter((item) => item.type === 'product'),
    ).sort((a, b) => SHAPES[shapeOf(b)].width - SHAPES[shapeOf(a)].width),
    ...shuffled(
      rng,
      landed.filter((item) => item.type === 'link'),
    ),
  ];

  for (const item of order) {
    const shape = SHAPES[shapeOf(item)];
    const slots: { x: number; top: number }[] = [];
    for (let x = stackStart; x + shape.width <= stackEnd; x++) {
      let top = 0;
      for (let dx = 0; dx < shape.width; dx++) top = Math.max(top, heights[x + dx]!);
      if (top + shape.height > maxHeight + 1) continue;
      slots.push({ x, top });
    }
    // Prefer the lowest landing spots, but keep some seed-driven variety.
    slots.sort((a, b) => a.top - b.top);
    const pick = slots[int(rng, 0, Math.min(2, slots.length - 1))] ?? { x: stackStart, top: 0 };

    const y = bp.rows - pick.top - shape.height;
    pieces.push({
      id: item.id,
      pool: 'landed',
      shape: shapeOf(item),
      x: pick.x,
      y,
      order: 0,
      bobPeriod: 0,
      bobDelay: 0,
      blinkPeriod: 6,
      blinkDelay: 0,
    });
    for (const [dx, dy] of shape.cells) pieceCells.add(`${pick.x + dx}:${y + dy}`);
    for (let dx = 0; dx < shape.width; dx++) heights[pick.x + dx] = pick.top + shape.height;
  }

  const filler: FillerCell[] = [];
  for (let x = 0; x < bp.cols; x++) {
    for (let row = 0; row < heights[x]!; row++) {
      const y = bp.rows - 1 - row;
      if (!pieceCells.has(`${x}:${y}`)) filler.push({ x, y, tone: int(rng, 0, 2), empty: false });
    }
  }

  // Real stacks have holes. Only hollow out cells that are covered from above —
  // a gap on the skyline is just a shorter column, not a hole.
  const coverable = filler.filter(
    (cell) => pieceCells.has(`${cell.x}:${cell.y - 1}`) || filler.some((f) => f.x === cell.x && f.y === cell.y - 1),
  );
  for (let i = 0, holes = int(rng, 1, 2); i < holes && coverable.length > 0; i++) {
    const victim = coverable.splice(int(rng, 0, coverable.length - 1), 1)[0]!;
    const cell = filler.find((f) => f.x === victim.x && f.y === victim.y);
    if (cell) cell.empty = true;
  }

  return { filler, tops: heights };
}

/**
 * Hang the floating pool: one lane each, heights spread across the upper two
 * thirds of the field, never over the stack. Lanes are exclusive strips — a
 * piece is placed in [lane, lane + laneWidth - width] — which is what keeps two
 * protagonists from ever sharing airspace.
 */
function layoutSky(
  rng: Rng,
  bp: Breakpoint,
  floating: readonly SceneItem[],
  pieces: PiecePlacement[],
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
  const bandBottom = Math.max(bandTop + 1.5, Math.min(bp.rows * 0.66, bp.rows - stackTop - 1.2) - 1.6);
  const span = bandBottom - bandTop;
  const slots = shuffled(
    rng,
    floating.map((_, i) => bandTop + (floating.length === 1 ? span / 2 : (span / (floating.length - 1)) * i)),
  );

  floating.forEach((item, index) => {
    const shape = SHAPES[shapeOf(item)];
    const lane = lanes[index]!;
    // Stay inside the lane: `slack` is the room the piece has to wander in it,
    // and it is never negative because every lane is at least 4 cells wide.
    const laneStart = Math.floor(lane * laneWidth);
    const slack = Math.max(0, Math.floor(laneWidth) - shape.width);
    const x = clamp(laneStart + int(rng, 0, slack), 0, bp.cols - shape.width);

    let localTop = 0;
    for (let dx = 0; dx < shape.width; dx++) localTop = Math.max(localTop, tops[x + dx] ?? 0);
    const floor = bp.rows - localTop - shape.height - SKY_CLEARANCE;
    const y = clamp(slots[index]! + (rng() - 0.5) * 0.5, bandTop, Math.max(bandTop, floor));

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: shapeOf(item),
      x,
      y: round(y, 1),
      order: 0,
      bobPeriod: round(5.6 + rng() * 2.8, 1),
      bobDelay: round(rng() * 4, 1),
      blinkPeriod: 6,
      blinkDelay: 0,
    });
  });
}

/**
 * Narrow screens: every product floats (DESIGN §7). The pieces run down the
 * field as one column, alternating between the left and right edge — with the
 * name now riding on the piece, a band only has to hold the piece itself, so
 * the phone layout is just a rhythm, not a packing problem. Returns the bottom
 * of the last piece.
 */
function layoutColumn(
  rng: Rng,
  bp: Breakpoint,
  floating: readonly SceneItem[],
  pieces: PiecePlacement[],
): number {
  let left = rng() < 0.5;
  let y = 0.4;

  for (const item of floating) {
    const shape = SHAPES[shapeOf(item)];
    const slack = Math.max(0, bp.cols - shape.width);
    const inset = Math.min(int(rng, 0, 1), slack);
    const x = left ? inset : slack - inset;

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: shapeOf(item),
      x,
      y: round(y, 1),
      order: 0,
      bobPeriod: round(5.6 + rng() * 2.8, 1),
      bobDelay: round(rng() * 4, 1),
      blinkPeriod: 6,
      blinkDelay: 0,
    });

    y += shape.height + BAND_GAP + rng() * 0.4;
    left = !left;
  }

  return y;
}
