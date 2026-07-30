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
 * v2 removed the label-placement engine and v2.1 removed the sticker band that
 * replaced it: every word about a product now lives in the one fixed info panel
 * (§4.4), so there is nothing left to route around the scene and the engine only
 * has to keep pieces off each other and off the stack.
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

// v2.1: one stack ratio across the board (~85 %, DESIGN §4.1) and three rows of
// headroom instead of four — the bed is two deep with a tile on top, and a budget
// the layout cannot fill is a budget that invites it to build a tower.
export const BREAKPOINTS: Breakpoint[] = [
  { name: 'wide', minWidth: 980, cols: 16, rows: 12, lanes: 4, stackRows: 3, stackRatio: 0.85, floatAll: false },
  { name: 'medium', minWidth: 700, cols: 12, rows: 12, lanes: 3, stackRows: 3, stackRatio: 0.85, floatAll: false },
  // `lanes` is unused here: every product floats, and `rows` is only the floor —
  // the field grows to whatever the column of pieces needs.
  { name: 'narrow', minWidth: 0, cols: 9, rows: 13, lanes: 0, stackRows: 3, stackRatio: 0.85, floatAll: true },
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

/**
 * Where the mystery `?` tile rests (DESIGN §6.5 v2.1.2). It is a 1x1 tile
 * perched on the bed, placed and drawn exactly like the GitHub and X link tiles.
 * v2.1.1 promoted it to a whole tetromino and the device review sent it back: a
 * 3x2 dashed piece spent six cells of prime scene space on a footnote link.
 */
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

  const egg = eggSlot(rng, bp, tops, pieces);

  return { seed, breakpoint: bp, pieces, filler, stackTops: tops, ghost, egg };
}

/**
 * Perch the mystery `?` on the bed (DESIGN §6.5 v2.1.2) — the same grade of spot
 * a link tile takes: a 1x1 sitting on top of a bed column, never buried in it and
 * never over bare floor, because a tile standing on nothing has not landed yet.
 * It is not in `stackTops`, so nothing is built on top of it; what it does have
 * to avoid is the pieces, which is why they are passed in.
 */
function eggSlot(
  rng: Rng,
  bp: Breakpoint,
  tops: readonly number[],
  pieces: readonly PiecePlacement[],
): EggPlacement {
  const taken = (x: number, y: number): boolean =>
    pieces.some((piece) => {
      const shape = SHAPES[piece.shape];
      return x >= piece.x && x < piece.x + shape.width && y >= piece.y && y < piece.y + shape.height;
    });

  const slots: { x: number; y: number; depth: number }[] = [];
  for (let x = 0; x < bp.cols; x++) {
    const depth = tops[x] ?? 0;
    if (depth === 0) continue;
    const y = bp.rows - depth - 1;
    if (y < 0 || taken(x, y)) continue;
    slots.push({ x, y, depth });
  }
  if (slots.length === 0) return { x: 0, y: bp.rows - 1 };

  // The shallowest columns first, so the `?` tucks into a dip rather than
  // crowning the tallest bump; the seed picks among the three lowest.
  slots.sort((a, b) => a.depth - b.depth);
  const pick = slots[int(rng, 0, Math.min(2, slots.length - 1))]!;
  return { x: pick.x, y: pick.y };
}

/**
 * The stack is a **low bed** (DESIGN §4.1 v2.1), not a clump in a corner: it
 * spans ~85 % of the floor, runs one or two rows deep with at most one three-row
 * bump, and its landed products stand *in* it rather than on top of it — a wide
 * piece resting at floor level is part of the bed; the same piece dropped onto a
 * pile is a tower, which is what the previous version kept building.
 *
 * Built in four passes: landed products claim their columns on the floor, the bed
 * fills the rest of the window in runs, the link tiles perch on the bed top like
 * collectibles, and only then does the filler get laid in and holes taken out of
 * it. Returns the per-column height so the sky can stay clear of the skyline.
 */
function layoutStack(
  rng: Rng,
  bp: Breakpoint,
  landed: readonly SceneItem[],
  pieces: PiecePlacement[],
): { filler: FillerCell[]; tops: number[] } {
  const widest = landed.reduce((max, item) => Math.max(max, SHAPES[shapeOf(item)].width), 1);
  const stackWidth = clamp(Math.round(bp.cols * bp.stackRatio), Math.min(bp.cols, widest + 2), bp.cols);
  const stackStart = int(rng, 0, bp.cols - stackWidth);
  const stackEnd = stackStart + stackWidth;

  const heights: number[] = new Array<number>(bp.cols).fill(0);
  /** Columns a landed product stands in — the bed does not overwrite them. */
  const claimed: boolean[] = new Array<boolean>(bp.cols).fill(false);
  /**
   * Every cell inside a landed piece's bounding box. Filler stays out of all of
   * them, not only the ones the piece actually draws: the skin is laid across the
   * whole box, so a grey block in an S's notch would sit *under* the artwork.
   * The notch is left genuinely hollow instead — which is precisely the kind of
   * hole a real game leaves under an overhang.
   */
  const reserved = new Set<string>();

  // 1. Landed products, widest first, standing on the floor.
  for (const item of shuffled(
    rng,
    landed.filter((it) => it.type === 'product'),
  ).sort((a, b) => SHAPES[shapeOf(b)].width - SHAPES[shapeOf(a)].width)) {
    const shape = SHAPES[shapeOf(item)];
    const spots: number[] = [];
    for (let x = stackStart; x + shape.width <= stackEnd; x++) {
      let free = true;
      for (let dx = 0; dx < shape.width; dx++) if (claimed[x + dx]) free = false;
      if (free) spots.push(x);
    }
    const x = spots.length > 0 ? spots[int(rng, 0, spots.length - 1)]! : stackStart;
    const y = bp.rows - shape.height;

    pieces.push({
      id: item.id,
      pool: 'landed',
      shape: shapeOf(item),
      x,
      y,
      order: 0,
      bobPeriod: 0,
      bobDelay: 0,
      blinkPeriod: 6,
      blinkDelay: 0,
    });

    for (let dx = 0; dx < shape.width; dx++) {
      claimed[x + dx] = true;
      heights[x + dx] = shape.height;
      for (let dy = 0; dy < shape.height; dy++) reserved.add(`${x + dx}:${y + dy}`);
    }
  }

  // 2. The bed, in runs of a few columns at the same depth. Runs rather than a
  // per-column coin flip: a bed that alternates 1,2,1,2 is not a bed, it is a saw.
  for (let x = stackStart; x < stackEnd; ) {
    const depth = rng() < 0.45 ? 2 : 1;
    for (let i = 0, run = int(rng, 2, 4); i < run && x < stackEnd; i++, x++) {
      if (!claimed[x]) heights[x] = depth;
    }
  }

  // …and at most one bump, one or two columns wide, somewhere inside the bed.
  if (stackWidth >= 6 && rng() < 0.6) {
    const spots: number[] = [];
    for (let x = stackStart + 1; x < stackEnd - 1; x++) if (!claimed[x] && heights[x]! > 0) spots.push(x);
    if (spots.length > 0) {
      const at = spots[int(rng, 0, spots.length - 1)]!;
      for (let i = 0, w = int(rng, 1, 2); i < w; i++) {
        if (at + i < stackEnd && !claimed[at + i]) heights[at + i] = 3;
      }
    }
  }

  // 3. Link tiles perch on the bed top: 1x1 collectibles sitting on the surface,
  // never buried in it. They avoid the products' columns so they read as resting
  // *on* the bed rather than as a piece's fifth cell.
  const perched = new Set<number>();
  /** Cells that hold a perched tile up. A hole here would leave it in mid-air. */
  const support = new Set<string>();
  for (const item of shuffled(
    rng,
    landed.filter((it) => it.type === 'link'),
  )) {
    // Three grades of surface, in order of preference: bare bed, the top of a
    // landed product, and — when the window is fully spoken for, which happens on
    // the medium breakpoint where two products and a bump can claim eight of ten
    // columns — the floor just outside the bed, which widens it rather than
    // building on it. A column already holding a tile is never reused, and a
    // three-row bump is never built on: either would make a tower.
    const bed: number[] = [];
    const onProduct: number[] = [];
    const bare: number[] = [];
    for (let x = 0; x < bp.cols; x++) {
      if (perched.has(x)) continue;
      const h = heights[x]!;
      if (h === 0) bare.push(x);
      else if (h <= 2) (claimed[x] ? onProduct : bed).push(x);
    }
    const spots = bed.length > 0 ? bed : onProduct.length > 0 ? onProduct : bare;
    // The lowest surfaces first, so a tile tucks into a dip in the bed; the
    // seed picks between the three lowest so it is not always the same dip.
    spots.sort((a, b) => heights[a]! - heights[b]!);
    const x = spots[int(rng, 0, Math.min(2, spots.length - 1))] ?? stackStart;
    const y = bp.rows - heights[x]! - 1;

    pieces.push({
      id: item.id,
      pool: 'landed',
      shape: shapeOf(item),
      x,
      y,
      order: 0,
      bobPeriod: 0,
      bobDelay: 0,
      blinkPeriod: 6,
      blinkDelay: 0,
    });
    reserved.add(`${x}:${y}`);
    support.add(`${x}:${y + 1}`);
    perched.add(x);
    heights[x] = heights[x]! + 1;
  }

  // 4. Anonymous filler fills what is left under the skyline.
  const filler: FillerCell[] = [];
  for (let x = 0; x < bp.cols; x++) {
    for (let row = 0; row < heights[x]!; row++) {
      const y = bp.rows - 1 - row;
      if (!reserved.has(`${x}:${y}`)) filler.push({ x, y, tone: int(rng, 0, 2), empty: false });
    }
  }

  // Real stacks have holes, and a hole is only a hole if something covers it — a
  // gap on the skyline is just a shorter column. Two kinds, both from the covered
  // set: a dashed slot (drawn, "a piece goes here") and a plain hollow gap (the
  // cell is simply not emitted). The design asks for 1-2 of each. A cell holding
  // a perched tile up is off limits: a 1x1 tile over a void is not a hole in the
  // stack, it is a tile that forgot to fall.
  const hollow = new Set<FillerCell>();
  const carved = new Set<string>();
  const holedColumns = new Set<number>();
  const slots = int(rng, 1, 2);
  const wanted = slots + int(rng, 1, 2);
  /** Solid *now* — a cell already carved has stopped holding anything up. */
  const holds = (x: number, y: number): boolean =>
    !carved.has(`${x}:${y}`) && occupied(x, y, filler, reserved);

  for (const cell of shuffled(rng, filler)) {
    if (carved.size >= wanted) break;
    // One hole per column: two in the same column is how a bed grows a floating
    // block even when every single cell passed the bridge test on its own.
    if (holedColumns.has(cell.x)) continue;
    if (support.has(`${cell.x}:${cell.y}`)) continue;
    // Covered from above, which is what makes it a hole rather than a dip…
    if (!holds(cell.x, cell.y - 1)) continue;
    // …and bridged from at least one side, which is what holds the cover up. The
    // test has to run against the state *after* the earlier carvings, or two
    // neighbours each pass by leaning on the other and the row comes apart.
    if (!holds(cell.x - 1, cell.y) && !holds(cell.x + 1, cell.y)) continue;
    // And no hole may touch another: carving beside an existing hole can take away
    // the bridge that one was relying on, which is a violation the candidate's own
    // test cannot see. Keeping them apart also just looks more like a game.
    if (carved.has(`${cell.x - 1}:${cell.y}`) || carved.has(`${cell.x + 1}:${cell.y}`)) continue;

    holedColumns.add(cell.x);
    carved.add(`${cell.x}:${cell.y}`);
    if (carved.size <= slots) cell.empty = true;
    else hollow.add(cell);
  }

  return { filler: filler.filter((cell) => !hollow.has(cell)), tops: heights };
}

function occupied(x: number, y: number, filler: readonly FillerCell[], reserved: ReadonlySet<string>): boolean {
  return reserved.has(`${x}:${y}`) || filler.some((cell) => cell.x === x && cell.y === y);
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
