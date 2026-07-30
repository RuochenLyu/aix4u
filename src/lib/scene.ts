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
 * stack as the screen narrows — a taller stack, never a cramped sky. Below the
 * narrow breakpoint that inverts (DESIGN §6): every product floats in its own
 * band and the stack keeps only link tiles, because a crowded phone stack put
 * cards nowhere near the piece they name.
 *
 * Label cards are a hard constraint: a card may never overlap a piece, the
 * stack or another card, and it must stay attached to its own piece — either
 * touching it or joined by a leader that crosses nothing. `placeLabels`
 * degrades (full card → name-only card → name-only card pinned to the piece)
 * rather than accepting an overlap or a floating, unconnected card.
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
  /** Field height. `floatAll` fields grow past this to fit their bands. */
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
  /** Narrow screens float every product; the stack keeps only link tiles. */
  floatAll: boolean;
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
    floatAll: false,
  },
  {
    name: 'medium',
    minWidth: 700,
    cols: 12,
    rows: 12,
    lanes: 3,
    stackRows: 4,
    stackRatio: 0.8,
    labelWidth: 4.2,
    labelHeight: 1.7,
    compactWidth: 2.9,
    compactHeight: 0.95,
    labelBeside: true,
    floatAll: false,
  },
  {
    // `lanes` is unused here: every product floats, and `rows` is only the
    // floor — the field grows to whatever the column of bands needs.
    name: 'narrow',
    minWidth: 0,
    cols: 9,
    rows: 14,
    lanes: 0,
    stackRows: 4,
    stackRatio: 0.9,
    labelWidth: 6.2,
    // Two-and-a-bit cells of card for two lines of text was mostly padding on a
    // phone; the mockup's cards hug their copy.
    labelHeight: 1.8,
    compactWidth: 4.2,
    compactHeight: 1.1,
    labelBeside: false,
    floatAll: true,
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
  /**
   * A hole in the stack. Real Tetris stacks have them, and drawing them as
   * dashed outlines rather than nothing says "game in progress" out loud
   * (DESIGN §2). They still count as occupied for label placement — a card in a
   * visible slot would read as a filled cell.
   */
  empty: boolean;
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
  const occupied: Rect[] = [];
  /** Card slots the band layout has already earmarked, by piece id. */
  const reserved = new Map<string, Rect>();

  let bp = base;
  let filler: FillerCell[];
  let tops: number[];

  if (base.floatAll) {
    // Bands are laid out from the top down, so the field height falls out of
    // the layout rather than constraining it; then the floor goes underneath.
    const skyBottom = layoutBands(rng, base, floating, pieces, occupied, reserved);
    bp = { ...base, rows: Math.max(base.rows, Math.ceil(skyBottom + 0.4) + base.stackRows) };
    ({ filler, tops } = layoutStack(rng, bp, landed, pieces, occupied));
  } else {
    ({ filler, tops } = layoutStack(rng, bp, landed, pieces, occupied));
    layoutSky(rng, bp, floating, pieces, occupied, tops);
  }

  // Landed pieces enter first, then the sky, bottom-up.
  pieces.sort((a, b) => (a.pool === b.pool ? b.y - a.y : a.pool === 'landed' ? -1 : 1));
  pieces.forEach((piece, index) => {
    piece.order = index;
  });

  // Placement is greedy, so whoever goes last can find itself boxed in by cards
  // that had the whole field to choose from. Re-run with the stranded pieces
  // promoted to the front until nobody is stranded (usually the first pass).
  let priority: string[] = [];
  let best: (LabelPlacement | null)[] | null = null;
  let bestStranded = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 4; attempt++) {
    const stranded = placeLabels(bp, pieces, occupied, tops, reserved, priority);
    if (stranded.length === 0) {
      best = null;
      break;
    }
    if (stranded.length < bestStranded) {
      bestStranded = stranded.length;
      best = pieces.map((piece) => piece.label);
    }
    priority = [...stranded, ...priority];
  }
  if (best) pieces.forEach((piece, index) => (piece.label = best[index]!));

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
 *
 * Products land before link tiles and seal their columns: a landed product
 * carries a label card, and a card can only stay attached to a piece that is
 * still exposed at the top of its column (DESIGN §6).
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
  const sealed = new Array<boolean>(bp.cols).fill(false);
  // Widest product first: a wide piece dropped after the narrow ones finds the
  // floor already fragmented into runs too short to hold it exposed.
  const order = [
    ...shuffled(
      rng,
      landed.filter((item) => item.type === 'product'),
    ).sort((a, b) => SHAPES[b.type === 'product' ? b.shape : 'DOT'].width - SHAPES[a.type === 'product' ? a.shape : 'DOT'].width),
    ...shuffled(
      rng,
      landed.filter((item) => item.type === 'link'),
    ),
  ];

  for (const item of order) {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const slots: { x: number; top: number }[] = [];
    const buried: { x: number; top: number }[] = [];
    for (let x = stackStart; x + shape.width <= stackEnd; x++) {
      let top = 0;
      let clear = true;
      for (let dx = 0; dx < shape.width; dx++) {
        top = Math.max(top, heights[x + dx]!);
        clear &&= !sealed[x + dx];
      }
      if (top + shape.height > maxHeight + 1) continue;
      (clear ? slots : buried).push({ x, top });
    }
    // Prefer the lowest landing spots, but keep some seed-driven variety.
    slots.sort((a, b) => a.top - b.top);
    buried.sort((a, b) => a.top - b.top);
    const pool = slots.length > 0 ? slots : buried;
    const pick = pool[int(rng, 0, Math.min(2, pool.length - 1))] ?? { x: stackStart, top: 0 };

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
    if (item.type === 'product') {
      // Seal one column past each end as well: two landed products standing
      // shoulder to shoulder leave their two cards fighting over the same strip
      // of sky, and one of them loses.
      for (let x = pick.x - 1; x <= pick.x + shape.width; x++) {
        if (x >= 0 && x < bp.cols) sealed[x] = true;
      }
    }
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

    // Keep a band clear above the stack: the pieces resting in it need somewhere
    // to put their own cards, and a card must stay next to its piece.
    let localTop = 0;
    for (let dx = 0; dx < shape.width; dx++) localTop = Math.max(localTop, tops[x + dx] ?? 0);
    const floor = bp.rows - localTop - shape.height - bp.compactHeight - 2 * LABEL_GAP;
    const y = clamp(slots[index]! + (rng() - 0.5) * 0.5, bandTop, Math.max(bandTop, floor));

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: item.type === 'product' ? item.shape : 'DOT',
      x,
      y: round(y, 1),
      order: 0,
      bobPeriod: round(5.6 + rng() * 2.8, 1),
      bobDelay: round(rng() * 4, 1),
      label: null,
    });
    occupied.push({ x, y, w: shape.width, h: shape.height });
  });
}

/**
 * Narrow screens: every product floats (DESIGN §6). Each piece owns a
 * contiguous vertical *band* holding the piece and its card, and the bands are
 * stacked down the field, alternating between the left and right edge. Because
 * a band is contiguous and bands never overlap, a card can only ever sit next
 * to the piece it names — the failure mode that made the crowded phone stack
 * unusable is structurally impossible here. Returns the bottom of the last band.
 */
function layoutBands(
  rng: Rng,
  bp: Breakpoint,
  floating: readonly SceneItem[],
  pieces: PiecePlacement[],
  occupied: Rect[],
  reserved: Map<string, Rect>,
): number {
  const cardW = Math.min(bp.labelWidth, bp.cols);
  const cardH = bp.labelHeight;
  let left = rng() < 0.5;
  let y = 0.3;

  for (const item of floating) {
    const shape = SHAPES[item.type === 'product' ? item.shape : 'DOT'];
    const slack = Math.max(0, bp.cols - shape.width);
    const inset = Math.min(int(rng, 0, 1), slack);
    const x = left ? inset : slack - inset;

    // The card takes the top or the bottom half of the band; either way the
    // band stays one contiguous block, so the rhythm reads as staggered
    // without any risk of a card drifting into a neighbour's territory.
    const cardAbove = rng() < 0.45;
    const pieceY = cardAbove ? y + cardH + LABEL_GAP : y;
    const cardY = cardAbove ? y : y + shape.height + LABEL_GAP;

    pieces.push({
      id: item.id,
      pool: 'floating',
      shape: item.type === 'product' ? item.shape : 'DOT',
      x,
      y: round(pieceY, 1),
      order: 0,
      bobPeriod: round(5.6 + rng() * 2.8, 1),
      bobDelay: round(rng() * 4, 1),
      label: null,
    });
    occupied.push({ x, y: round(pieceY, 1), w: shape.width, h: shape.height });
    reserved.set(item.id, {
      x: round(clamp(x + shape.width / 2 - cardW / 2, 0, Math.max(0, bp.cols - cardW))),
      y: round(cardY, 1),
      w: cardW,
      h: cardH,
    });

    y += shape.height + LABEL_GAP + cardH + 0.4 + rng() * 0.5;
    left = !left;
  }

  return y;
}

const LABEL_GAP = 0.4;
/** Outward search: how far past the piece edge a card may be parked, in cells. */
const LABEL_RUNS = [LABEL_GAP, 0.9, 1.5, 2.1, 2.7, 3.3];
/** …and how far it may slide across that axis. Both grow outwards from zero. */
const LABEL_CROSSES = [0, -0.7, 0.7, -1.4, 1.4, -2.1, 2.1, -2.8, 2.8];
/**
 * The leader is a 2px line, so it is tested as a line, not as a box: it clears
 * an obstacle unless it cuts more than this far inside it. Running along a
 * neighbour's edge is fine; running through its middle is not.
 */
const LEADER_CLEARANCE = 0.12;

interface LabelSize {
  w: number;
  h: number;
  compact: boolean;
}

interface LabelGeometry {
  side: LabelSide;
  /** Leader run from the piece edge to the card, along `side`. */
  run: number;
  /** Signed offset across that axis; the leader elbows back by this much. */
  cross: number;
}

/** Where the leader would go for a card at `rect`. Mirrors what the CSS draws. */
function labelGeometry(rect: Rect, piece: PiecePlacement, pw: number, ph: number): LabelGeometry {
  const side = separatingSide(rect, piece, pw, ph);
  const horizontal = side === 'left' || side === 'right';
  const run =
    side === 'right'
      ? rect.x - (piece.x + pw)
      : side === 'left'
        ? piece.x - (rect.x + rect.w)
        : side === 'above'
          ? piece.y - (rect.y + rect.h)
          : rect.y - (piece.y + ph);
  const pieceCenter = horizontal ? piece.y + ph / 2 : piece.x + pw / 2;
  const cardCenter = horizontal ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
  return { side, run, cross: pieceCenter - cardCenter };
}

/**
 * The two thin rectangles the stepped leader occupies: the run out from the
 * piece, then the elbow along the card's edge back to its centre line. A leader
 * may cross empty grid, never a piece or another card, so these are what the
 * placement search (and the build-time check) test against.
 */
export function leaderSegments(rect: Rect, piece: PiecePlacement, pw: number, ph: number): Rect[] {
  const geo = labelGeometry(rect, piece, pw, ph);
  const run = Math.max(geo.run, 0);
  const cross = Math.abs(geo.cross);

  if (geo.side === 'left' || geo.side === 'right') {
    const line = piece.y + ph / 2;
    const edge = geo.side === 'right' ? rect.x : rect.x + rect.w;
    return [
      { x: geo.side === 'right' ? edge - run : edge, y: line, w: run, h: 0 },
      { x: edge, y: Math.min(line, rect.y + rect.h / 2), w: 0, h: cross },
    ];
  }

  const line = piece.x + pw / 2;
  const edge = geo.side === 'below' ? rect.y : rect.y + rect.h;
  return [
    { x: line, y: geo.side === 'below' ? edge - run : edge, w: 0, h: run },
    { x: Math.min(line, rect.x + rect.w / 2), y: edge, w: cross, h: 0 },
  ];
}

/** True when a leader segment cuts through `other` rather than skirting it. */
export function leaderHits(segment: Rect, other: Rect): boolean {
  if (segment.w <= 0 && segment.h <= 0) return false;
  const c = LEADER_CLEARANCE;
  return (
    segment.x < other.x + other.w - c &&
    other.x + c < segment.x + segment.w &&
    segment.y < other.y + other.h - c &&
    other.y + c < segment.y + segment.h
  );
}

/** The band a leader occupies, for keeping later cards from covering it. */
function leaderBand(segment: Rect): Rect {
  const c = LEADER_CLEARANCE;
  return { x: segment.x - c, y: segment.y - c, w: segment.w + 2 * c, h: segment.h + 2 * c };
}

/**
 * Label cards, in order of preference (DESIGN §6):
 *   1. the full card, at the nearest spot around its piece whose leader is
 *      clear — the tagline is worth a slightly longer leader,
 *   2. the same search with the tagline dropped,
 *   3. the name-only card pinned against the piece.
 * Overlap is a hard failure at every step, and so is a card that cannot be
 * joined to its piece: the search only accepts a spot whose leader crosses
 * nothing, and the last resort is adjacency, never a distant leaderless card.
 *
 * `priority` pieces are served first; the returned ids are the pieces that had
 * to fall back onto an occupied slot, which is what the caller retries with.
 */
function placeLabels(
  bp: Breakpoint,
  pieces: PiecePlacement[],
  occupied: Rect[],
  tops: readonly number[],
  reserved: ReadonlyMap<string, Rect>,
  priority: readonly string[],
): string[] {
  const stack: Rect[] = [];
  for (let x = 0; x < bp.cols; x++) {
    const h = tops[x] ?? 0;
    if (h > 0) stack.push({ x, y: bp.rows - h, w: 1, h });
  }
  // Two obstacle sets. A card may not cover anything at all; a leader may run
  // over bare grid and over the anonymous stack filler, but never across a
  // piece or another card (DESIGN §6).
  const solid: Rect[] = [...occupied, ...stack];
  // Slots the band layout earmarked count as occupied until their own piece
  // claims them, so no card can wander into a neighbouring band.
  let cards: Rect[] = [...reserved.values()];
  let leaders: Rect[] = [];

  // Most constrained first: a landed card has the stack on one side and its
  // neighbours on the others, while a floating card has most of the sky. Giving
  // the protagonists first pick used to strand the landed cards.
  const rank = (piece: PiecePlacement): number => {
    const promoted = priority.indexOf(piece.id);
    if (promoted >= 0) return promoted - priority.length;
    return piece.pool === 'landed' ? 0 : 1;
  };
  const ordered = [...pieces].sort((a, b) => rank(a) - rank(b));
  const stranded: string[] = [];
  let sideIndex = 0;

  for (const piece of ordered) {
    if (piece.shape === 'DOT') continue; // link tiles use a hover tooltip instead
    const shape = SHAPES[piece.shape];
    const pw = shape.width;
    const ph = shape.height;
    const flip = sideIndex++ % 2 === 0;
    const sides: LabelSide[] = bp.labelBeside
      ? flip
        ? ['right', 'left', 'above', 'below']
        : ['left', 'right', 'below', 'above']
      : flip
        ? ['below', 'above']
        : ['above', 'below'];

    // Full cards are for the protagonists; landed pieces stay compact and put
    // their tagline on hover (DESIGN §3.2).
    const full: LabelSize =
      piece.pool === 'floating'
        ? { w: bp.labelWidth, h: bp.labelHeight, compact: false }
        : { w: bp.compactWidth, h: bp.compactHeight, compact: true };
    const small: LabelSize = { w: bp.compactWidth, h: bp.compactHeight, compact: true };

    const own = reserved.get(piece.id);
    const otherCards = own ? cards.filter((rect) => rect !== own) : cards;
    const available = [...solid, ...otherCards, ...leaders];
    // The leader starts at the piece's own edge, so whatever it already sits
    // inside (its column of the stack) cannot be an obstacle for it.
    const pieceRect: Rect = { x: piece.x, y: piece.y, w: pw, h: ph };
    const obstacles = [...occupied, ...otherCards, ...leaders].filter((rect) => !overlaps(rect, pieceRect));

    let chosen: { rect: Rect; size: LabelSize } | null = null;
    if (own && penalty(own, available, bp) === 0 && leaderClear(own, piece, pw, ph, obstacles)) {
      chosen = { rect: own, size: full };
    }
    for (const size of full.compact ? [full] : [full, small]) {
      if (chosen) break;
      const rect = nearestSlot(bp, piece, pw, ph, size, sides, available, obstacles);
      if (rect) chosen = { rect, size };
    }
    if (!chosen) {
      const pinned = pinnedSlot(bp, piece, pw, ph, small, sides, available);
      if (pinned.score > 0) stranded.push(piece.id);
      chosen = { rect: pinned.rect, size: small };
    }

    const { rect, size } = chosen;
    const geo = labelGeometry(rect, piece, pw, ph);
    const run = Math.max(geo.run, LABEL_GAP);
    cards = [...otherCards, rect];
    leaders = [...leaders, ...leaderSegments(rect, piece, pw, ph).map(leaderBand)];

    piece.label = {
      x: round(rect.x),
      y: round(rect.y),
      w: size.w,
      h: size.h,
      side: geo.side,
      connected: true,
      leader: round(run),
      cross: round(geo.cross),
      crossAbs: round(Math.abs(geo.cross)),
      compact: size.compact,
    };
  }

  return stranded;
}

/** True when the leader for a card at `rect` crosses nothing on its way over. */
function leaderClear(
  rect: Rect,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  obstacles: readonly Rect[],
): boolean {
  return leaderSegments(rect, piece, pw, ph).every(
    (segment) => !obstacles.some((other) => leaderHits(segment, other)),
  );
}

/**
 * The closest clear spot around the piece, found by walking outwards: run first
 * (distance from the piece edge), then cross (slide along that edge). Sorting
 * every candidate by its resulting leader length — rather than taking the first
 * hit of a hand-ordered list — is what makes "nearest" actually true.
 */
function nearestSlot(
  bp: Breakpoint,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  size: LabelSize,
  sides: readonly LabelSide[],
  taken: readonly Rect[],
  obstacles: readonly Rect[],
): Rect | null {
  let best: Rect | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  sides.forEach((side, order) => {
    for (const run of LABEL_RUNS) {
      for (const cross of LABEL_CROSSES) {
        const rect = candidateRect(bp, piece, pw, ph, size, side, run, cross);
        const geo = labelGeometry(rect, piece, pw, ph);
        if (geo.run < -1e-9) continue;
        // A tiny bias for the preferred side keeps cards alternating around the
        // field; it never outweighs a genuinely closer spot.
        const cost = geo.run + Math.abs(geo.cross) * 0.8 + order * 0.08;
        if (cost >= bestCost) continue;
        if (penalty(rect, taken, bp) !== 0) continue;
        if (!leaderClear(rect, piece, pw, ph, obstacles)) continue;
        bestCost = cost;
        best = rect;
      }
    }
  });

  return best;
}

/**
 * Last resort: pin the card against the piece on its least crowded side. It
 * stays attached — the one thing we never trade away — but it may end up
 * covering something, which is what `score > 0` reports back.
 */
function pinnedSlot(
  bp: Breakpoint,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  size: LabelSize,
  sides: readonly LabelSide[],
  taken: readonly Rect[],
): { rect: Rect; score: number } {
  const own: Rect = { x: piece.x, y: piece.y, w: pw, h: ph };
  let best: Rect | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const side of [...sides, 'above' as const, 'below' as const, 'left' as const, 'right' as const]) {
    for (const cross of LABEL_CROSSES) {
      const rect = candidateRect(bp, piece, pw, ph, size, side, LABEL_GAP, cross);
      // Covering its own piece defeats the point of the card entirely, so that
      // counts for much more than covering a neighbour.
      const score = penalty(rect, taken, bp) + penalty(rect, [own], bp) * 9;
      if (score >= bestScore) continue;
      bestScore = score;
      best = rect;
    }
  }
  return { rect: best!, score: bestScore };
}

/** One candidate position, kept inside the field. */
function candidateRect(
  bp: Breakpoint,
  piece: PiecePlacement,
  pw: number,
  ph: number,
  size: LabelSize,
  side: LabelSide,
  run: number,
  cross: number,
): Rect {
  const { w, h } = size;
  const maxX = Math.max(0, bp.cols - w);
  const maxY = Math.max(0, bp.rows - h);

  if (side === 'left' || side === 'right') {
    const x = side === 'right' ? piece.x + pw + run : piece.x - run - w;
    return { x: clamp(x, 0, maxX), y: clamp(piece.y + ph / 2 - h / 2 + cross, 0, maxY), w, h };
  }
  const y = side === 'below' ? piece.y + ph + run : piece.y - run - h;
  return { x: clamp(piece.x + pw / 2 - w / 2 + cross, 0, maxX), y: clamp(y, 0, maxY), w, h };
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
