/**
 * Build-time validation of src/data/products.json.
 *
 * The JSON file is the CMS. A malformed entry must break `npm run build`, never
 * production, so this module is imported from the page frontmatter and throws
 * on the first problem it finds.
 *
 * A v2 product entry configures its whole identity (DESIGN §3, §10): shape (and
 * with it the canonical orientation), accents, the light/dark skin paths, the
 * face preset and its anchor cells, the motion-personality preset, and the
 * info-panel copy.
 */

import raw from '../data/products.json';
import { SHAPES, hasCell, type ShapeName } from './tetromino';

/**
 * Motion personality presets (DESIGN §3.4). One shared keyframe set, driven by
 * per-piece CSS variables — so a new personality is a row in this table, not a
 * new animation.
 *
 *   tease   degrees of the pre-landing rotation tease (T's T-spin wink)
 *   prop    px the *whole piece* overshoots upwards after landing (L propping
 *           up; per-cell displacement is banned under skins, v2.1.4)
 *   sway    px of horizontal sway while falling (S, the wave)
 *   squash  scaleY at the landing frame — lower squashes harder (O, the mascot)
 *   bob     px of idle bob amplitude; `metronome` bobs on a stricter beat
 *   beat    idle easing: 'breath' drifts, 'metronome' ticks (I)
 */
export interface MotionPreset {
  tease: number;
  prop: number;
  sway: number;
  squash: number;
  bob: number;
  beat: 'breath' | 'metronome';
}

export const MOTION_PRESETS = {
  'tease-rotate': { tease: 90, prop: 0, sway: 0, squash: 0.94, bob: 2, beat: 'breath' },
  'prop-up': { tease: 0, prop: 2, sway: 0, squash: 0.94, bob: 2, beat: 'breath' },
  sway: { tease: 0, prop: 0, sway: 2, squash: 0.95, bob: 2, beat: 'breath' },
  squash: { tease: 0, prop: 0, sway: 0, squash: 0.84, bob: 2, beat: 'breath' },
  metronome: { tease: 0, prop: 0, sway: 0, squash: 0.96, bob: 2, beat: 'metronome' },
} as const satisfies Record<string, MotionPreset>;

export type MotionName = keyof typeof MOTION_PRESETS;
export const MOTION_NAMES = Object.keys(MOTION_PRESETS) as MotionName[];

/** Default personality per shape — the presets are derived from shape mechanics. */
const MOTION_BY_SHAPE: Record<ShapeName, MotionName> = {
  T: 'tease-rotate',
  L: 'prop-up',
  S: 'sway',
  O: 'squash',
  I: 'metronome',
  DOT: 'squash',
};

/** A point inside one grid cell of the piece: the cell, plus where in it. */
export interface CellPoint {
  cx: number;
  cy: number;
  /** Fractions of the cell; 0.5/0.5 is dead centre. */
  ax: number;
  ay: number;
}

/* --- faces (DESIGN §3.3 v2.1) --------------------------------------------- */

/**
 * (v2.1.3) One eye size for the whole board, in cells (DESIGN §3.3, "the
 * googly-sticker anatomy"). Every preset scales *this*; nothing states a size of
 * its own. The first pass let each preset pick its own width and the board came
 * out with a white pill on the T and two lost dots on the L — five eyes that
 * plainly did not come from the same factory.
 */
export const EYE_SIZE = 0.3;

/**
 * What the lid is doing, and the only axis a preset is allowed to vary besides
 * count and placement. `half` covers the top of the sclera with a straight lid;
 * `squint` closes the eye down to a curved seam. Both are drawn at the one
 * stroke weight the stylesheet holds.
 */
export type LidMode = 'open' | 'half' | 'squint';

/** One eye: how big, relative to `EYE_SIZE`, and what its lid is doing. */
export interface FaceEyeSpec {
  /** Multiplier on the shared `EYE_SIZE` token. Kept close to 1 on purpose. */
  scale: number;
  lid: LidMode;
}

/**
 * A face preset (DESIGN §3.3): the minimal face derived from a piece's motion
 * personality, so the way it looks and the way it falls say the same thing. The
 * restraint rules live here as types — at most two eyes and one small mouth
 * mark, and nothing else is expressible.
 */
export interface FacePreset {
  /** One or two, never more — the restraint rule, asserted in check-scene. */
  eyes: readonly FaceEyeSpec[];
  /** Default centre-to-centre spacing of a two-eye face, in cells. */
  gap: number;
  /** Whether the preset carries the one small mouth mark. */
  mouth: boolean;
  /** Where the default mouth sits below the eye midpoint, in cells. */
  mouthDrop: number;
  /** Mouth diameter, in cells. */
  mouthSize: number;
  /** Which of the three micro-palette inks the mouth is drawn in (§3.3). */
  ink: 1 | 2 | 3;
}

/**
 * Five characters, one anatomy (DESIGN §3.3 v2.1.3). Every entry below varies
 * exactly three things — how many eyes, how far apart, and what the lids are
 * doing. The scales stay within ±20 % of the shared token, because "wide eye"
 * and "small close-set eyes" are readings the *placement* has to carry; a preset
 * that drew its own eye is how the first pass ended up with five build qualities.
 */
export const FACE_PRESETS = {
  /** T — the dungeon keeper: one wide, half-lidded eye. */
  keeper: {
    eyes: [{ scale: 1.18, lid: 'half' }],
    gap: 0,
    mouth: false,
    mouthDrop: 0,
    mouthSize: 0,
    ink: 1,
  },
  /** L — the collector: two small round eyes, close-set. */
  collector: {
    eyes: [
      { scale: 0.88, lid: 'open' },
      { scale: 0.88, lid: 'open' },
    ],
    gap: 0.36,
    mouth: false,
    mouthDrop: 0,
    mouthSize: 0,
    ink: 1,
  },
  /** S — watching the chart: one eye open, the other squinting. */
  watcher: {
    eyes: [
      { scale: 1, lid: 'open' },
      { scale: 1, lid: 'squint' },
    ],
    gap: 0.44,
    mouth: false,
    mouthDrop: 0,
    mouthSize: 0,
    ink: 1,
  },
  /** O — the mascot: two big round eyes and a tiny "o" mouth. */
  mascot: {
    eyes: [
      { scale: 1.12, lid: 'open' },
      { scale: 1.12, lid: 'open' },
    ],
    gap: 0.7,
    mouth: true,
    mouthDrop: 0.42,
    mouthSize: 0.24,
    ink: 1,
  },
  /** I — one calm eye, blinking on its own metronome. */
  calm: {
    eyes: [{ scale: 1, lid: 'open' }],
    gap: 0,
    mouth: false,
    mouthDrop: 0,
    mouthSize: 0,
    ink: 1,
  },
} as const satisfies Record<string, FacePreset>;

export type FaceName = keyof typeof FACE_PRESETS;
export const FACE_NAMES = Object.keys(FACE_PRESETS) as FaceName[];

/** Default face per shape — a preset is derived from the shape, like the motion. */
const FACE_BY_SHAPE: Record<ShapeName, FaceName> = {
  T: 'keeper',
  L: 'collector',
  S: 'watcher',
  O: 'mascot',
  I: 'calm',
  DOT: 'calm',
};

/** A resolved mark, in piece coordinates (cells from the bounding box corner). */
export interface FaceMark {
  x: number;
  y: number;
  /** Width in cells; the height is `w * aspect` for eyes, `w` for the mouth. */
  w: number;
  h: number;
}

export interface FaceEye extends FaceMark {
  /** Multiplier on `EYE_SIZE`, handed to the stylesheet as `--eye-scale`. */
  scale: number;
  lid: LidMode;
}

/**
 * A product's face, with every anchor already resolved out of cell coordinates
 * and into piece coordinates — the renderer multiplies by `--cell`, and the
 * scene check measures the result against the silhouette.
 */
export interface Face {
  preset: FaceName;
  eyes: FaceEye[];
  mouth?: FaceMark;
  ink: 1 | 2 | 3;
}

/**
 * Skin art (DESIGN §3.1, §11): one image per theme, laid across the piece's
 * whole bounding box under the CSS bevels and the silhouette seam. Both paths
 * empty = fall back to the accent-fill placeholder.
 */
export interface Skin {
  light: string;
  dark: string;
}

export interface ProductItem {
  type: 'product';
  id: string;
  name: string;
  shape: ShapeName;
  accent: string;
  accentDark: string;
  priority: number;
  url: string;
  /**
   * The href the page renders: `url` plus `?ref=aix4u` (DESIGN §13.3), unless
   * the entry opts out. `url` itself stays clean — it is the canonical address
   * for JSON-LD and anything else that names the product rather than links it.
   */
  href: string;
  /** Opt-out for destinations where unknown params are unwelcome (§13.3). */
  noRef: boolean;
  /** Info-panel taxonomy, e.g. `WEB` / `DAILY` (DESIGN §8). */
  kind: string;
  status: string;
  /** One-line flavour text for the info panel and the sr-only fallback. */
  tagline: string;
  description: string;
  /** Optional pixel-art icon under /icons/; the placeholder badge. */
  icon?: string;
  /** Where the placeholder icon badge sits. Defaults to the piece's first cell. */
  iconAt: CellPoint;
  /** The per-piece face preset and its resolved marks (DESIGN §3.3). */
  face: Face;
  motion: MotionName;
  skin: Skin;
}

/** Link tiles that ship an inline pixel logo rather than a text glyph. */
export type LinkLogo = 'github' | 'x';
export const LINK_LOGOS: readonly LinkLogo[] = ['github', 'x'];

export interface LinkItem {
  type: 'link';
  id: string;
  name: string;
  label: string;
  url: string;
  icon?: string;
  logo?: LinkLogo;
}

export type SceneItem = ProductItem | LinkItem;

export interface SiteContent {
  next: { teaser: string; url: string };
  panel: { idle: string };
  items: SceneItem[];
  products: ProductItem[];
  links: LinkItem[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Referral param (DESIGN §13.3): appended at build time, so the static HTML —
 * the thing crawlers and no-JS visitors see — already carries it. Zero scripts;
 * measurement happens on the products' own analytics.
 */
export function withRef(raw: string): string {
  const url = new URL(raw);
  url.searchParams.set('ref', 'aix4u');
  return url.toString();
}

function fail(where: string, message: string): never {
  throw new Error(`[products.json] ${where}: ${message}`);
}

function str(where: string, value: unknown, field: string): string {
  const v = (value as Record<string, unknown>)[field];
  if (typeof v !== 'string' || v.trim() === '') fail(where, `"${field}" must be a non-empty string`);
  return v as string;
}

function url(where: string, value: unknown, field: string): string {
  const v = str(where, value, field);
  if (!/^https?:\/\//.test(v)) fail(where, `"${field}" must be an absolute http(s) URL`);
  return v;
}

/** Optional asset path. Absolute-rooted so it survives any base path change. */
function optionalAsset(where: string, value: Record<string, unknown>, field: string): string | undefined {
  const v = value[field];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') fail(where, `"${field}" must be a string when present`);
  if (!v.startsWith('/')) fail(where, `"${field}" must be a root-relative path such as "/skins/foo.png", got "${v}"`);
  return v;
}

function color(where: string, value: unknown, field: string): string {
  const v = str(where, value, field);
  if (!HEX.test(v)) fail(where, `"${field}" must be a #rrggbb hex color, got "${v}"`);
  return v;
}

/**
 * A `[cx, cy]` cell, or `[cx, cy, ax, ay]` to nudge inside it. The cell has to
 * be one the shape actually occupies — an eye floating in the notch of an S is
 * a bug that a schema can catch, so it does.
 */
function cellPoint(
  where: string,
  value: Record<string, unknown>,
  field: string,
  shape: ShapeName,
  fallback: CellPoint,
): CellPoint {
  const v = value[field];
  if (v === undefined || v === null) return fallback;
  if (!Array.isArray(v) || v.length < 2 || v.length > 4 || v.some((n) => typeof n !== 'number')) {
    fail(where, `"${field}" must be [cx, cy] or [cx, cy, ax, ay] numbers`);
  }
  const [cx, cy, ax = 0.5, ay = 0.5] = v as number[];
  if (!hasCell(SHAPES[shape], cx!, cy!)) {
    fail(where, `"${field}" cell [${cx}, ${cy}] is not part of the ${shape} piece (${SHAPES[shape].orientation})`);
  }
  if (ax! < 0 || ax! > 1 || ay! < 0 || ay! > 1) fail(where, `"${field}" alignment must be within 0..1`);
  return { cx: cx!, cy: cy!, ax: ax!, ay: ay! };
}

/**
 * The `face` block (DESIGN §3.3 v2.1): a preset name plus the anchor cells the
 * preset's marks hang off.
 *
 * A one-eye preset takes a single `at`. A two-eye preset takes either `at` as the
 * midpoint plus a `gap` (the preset ships a default), or both anchors spelled out
 * as `at` and `at2` — the same `[cx, cy, ax, ay]` grammar the eye always used.
 * Anything a preset has no use for is an error rather than a silently ignored
 * key: a `gap` on a one-eyed piece means whoever wrote it expected two eyes.
 */
function face(where: string, value: Record<string, unknown>, shape: ShapeName, home: CellPoint): Face {
  // v2 gave every piece the same eye (DESIGN §3.3 v2); an entry still carrying
  // one is config from before the presets, and stale config fails the build.
  if (value['eye'] !== undefined) {
    fail(where, '"eye" is retired: pieces carry a "face" preset now (DESIGN §3.3 v2.1)');
  }

  const raw = value['face'];
  if (raw === undefined || raw === null) fail(where, '"face" is required: { "preset": …, "at": [cx, cy, ax, ay] }');
  if (typeof raw !== 'object' || Array.isArray(raw)) fail(where, '"face" must be an object');
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!['preset', 'at', 'at2', 'gap', 'mouth'].includes(key)) {
      fail(where, `"face" has no "${key}" slot (preset, at, at2, gap, mouth)`);
    }
  }

  const presetName = obj['preset'] ?? FACE_BY_SHAPE[shape];
  if (!FACE_NAMES.includes(presetName as FaceName)) {
    fail(where, `"face.preset" must be one of ${FACE_NAMES.join(', ')}`);
  }
  const preset: FacePreset = FACE_PRESETS[presetName as FaceName];
  const twoEyed = preset.eyes.length === 2;

  const at = cellPoint(where, obj, 'at', shape, home);
  const mid = { x: at.cx + at.ax, y: at.cy + at.ay };

  if (!twoEyed && (obj['at2'] !== undefined || obj['gap'] !== undefined)) {
    fail(where, `"face.preset" ${String(presetName)} has one eye, so "at2"/"gap" mean nothing`);
  }

  const eyes: FaceEye[] = [];
  // Round, always: the sclera is one shape at one size, and the character comes
  // from the lid over it (DESIGN §3.3 v2.1.3).
  const mark = (spec: FaceEyeSpec, x: number, y: number): FaceEye => ({
    x,
    y,
    w: EYE_SIZE * spec.scale,
    h: EYE_SIZE * spec.scale,
    scale: spec.scale,
    lid: spec.lid,
  });

  if (!twoEyed) {
    eyes.push(mark(preset.eyes[0]!, mid.x, mid.y));
  } else if (obj['at2'] !== undefined) {
    const at2 = cellPoint(where, obj, 'at2', shape, home);
    eyes.push(mark(preset.eyes[0]!, mid.x, mid.y), mark(preset.eyes[1]!, at2.cx + at2.ax, at2.cy + at2.ay));
  } else {
    const gapRaw = obj['gap'] ?? preset.gap;
    if (typeof gapRaw !== 'number' || !(gapRaw > 0)) fail(where, '"face.gap" must be a positive number of cells');
    eyes.push(
      mark(preset.eyes[0]!, mid.x - gapRaw / 2, mid.y),
      mark(preset.eyes[1]!, mid.x + gapRaw / 2, mid.y),
    );
  }

  if (!preset.mouth && obj['mouth'] !== undefined) {
    fail(where, `"face.preset" ${String(presetName)} carries no mouth mark (DESIGN §3.3)`);
  }

  let mouth: FaceMark | undefined;
  if (preset.mouth) {
    const spot =
      obj['mouth'] === undefined
        ? { x: mid.x, y: mid.y + preset.mouthDrop }
        : (() => {
            const p = cellPoint(where, obj, 'mouth', shape, home);
            return { x: p.cx + p.ax, y: p.cy + p.ay };
          })();
    mouth = { ...spot, w: preset.mouthSize, h: preset.mouthSize };
  }

  return { preset: presetName as FaceName, eyes, ...(mouth ? { mouth } : {}), ink: preset.ink };
}

function skin(where: string, value: Record<string, unknown>): Skin {
  const v = value['skin'];
  if (v === undefined || v === null) return { light: '', dark: '' };
  if (typeof v !== 'object' || Array.isArray(v)) fail(where, '"skin" must be an object with "light" and "dark" paths');
  const obj = v as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'light' && key !== 'dark') fail(where, `"skin" has no "${key}" slot (only light/dark)`);
  }
  return {
    light: optionalAsset(where, obj, 'light') ?? '',
    dark: optionalAsset(where, obj, 'dark') ?? '',
  };
}

/** Panel copy is typeset in the pixel font, uppercase; keep it terse. */
function taxonomy(where: string, value: unknown, field: string): string {
  const v = str(where, value, field).trim();
  if (!/^[A-Z0-9 +/-]{2,10}$/.test(v)) {
    fail(where, `"${field}" must be 2-10 uppercase characters (it is a panel tag), got "${v}"`);
  }
  return v;
}

function validate(input: unknown): SiteContent {
  if (typeof input !== 'object' || input === null) fail('root', 'expected an object');
  const root = input as Record<string, unknown>;

  const nextRaw = root['next'];
  if (typeof nextRaw !== 'object' || nextRaw === null) fail('next', 'expected an object');
  const teaser = (nextRaw as Record<string, unknown>)['teaser'];
  if (typeof teaser !== 'string') fail('next.teaser', 'must be a string (empty = mystery block)');
  const nextUrl = url('next', nextRaw, 'url');

  const panelRaw = root['panel'];
  if (typeof panelRaw !== 'object' || panelRaw === null) fail('panel', 'expected an object');
  // `▸ PLAY` is retired (DESIGN §4.4 v2.1.2): the CTA is a key legend now, and a
  // key legend is chrome copy, not content. A stale `cta` fails the build.
  if ((panelRaw as Record<string, unknown>)['cta'] !== undefined) {
    fail('panel', '"cta" is retired: the panel shows a key legend, not a button (DESIGN §4.4)');
  }
  const panel = { idle: str('panel', panelRaw, 'idle') };

  if (!Array.isArray(root['items'])) fail('items', 'expected an array');
  const rawItems = root['items'] as unknown[];
  if (rawItems.length === 0) fail('items', 'must contain at least one entry');

  const seenIds = new Set<string>();
  const seenPriorities = new Set<number>();
  const items: SceneItem[] = rawItems.map((entry, index) => {
    const where = `items[${index}]`;
    if (typeof entry !== 'object' || entry === null) fail(where, 'expected an object');
    const obj = entry as Record<string, unknown>;

    const id = str(where, obj, 'id');
    if (!/^[a-z0-9-]+$/.test(id)) fail(where, `"id" must be kebab-case ascii, got "${id}"`);
    if (seenIds.has(id)) fail(where, `duplicate id "${id}"`);
    seenIds.add(id);

    const type = obj['type'];
    if (type === 'link') {
      const logo = obj['logo'];
      if (logo !== undefined && !LINK_LOGOS.includes(logo as LinkLogo)) {
        fail(where, `"logo" must be one of ${LINK_LOGOS.join(', ')} when present`);
      }
      const icon = optionalAsset(where, obj, 'icon');
      const link: LinkItem = {
        type: 'link',
        id,
        name: str(where, obj, 'name'),
        label: str(where, obj, 'label'),
        url: url(where, obj, 'url'),
        ...(icon ? { icon } : {}),
        ...(logo ? { logo: logo as LinkLogo } : {}),
      };
      if ([...link.label].length > 2) fail(where, '"label" must be at most 2 characters (it fills a 1x1 tile)');
      return link;
    }

    if (type !== 'product') fail(where, `"type" must be "product" or "link", got ${JSON.stringify(type)}`);

    const shapeName = str(where, obj, 'shape');
    if (!(shapeName in SHAPES)) fail(where, `"shape" must be one of ${Object.keys(SHAPES).join(', ')}`);
    if (shapeName === 'DOT') fail(where, '"shape" DOT is reserved for link tiles');
    const shape = shapeName as ShapeName;

    // Orientation is not a free parameter: the shape *is* its canonical
    // orientation (DESIGN §3). An entry may restate it, and then it has to match.
    const orientation = obj['orientation'];
    if (orientation !== undefined && orientation !== SHAPES[shape].orientation) {
      fail(where, `"orientation" is fixed for ${shape}: "${SHAPES[shape].orientation}"`);
    }

    const priority = obj['priority'];
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 1) {
      fail(where, '"priority" must be a positive integer (1 = most prominent)');
    }
    if (seenPriorities.has(priority)) fail(where, `duplicate priority ${priority}`);
    seenPriorities.add(priority);

    const motion = obj['motion'] ?? MOTION_BY_SHAPE[shape];
    if (!MOTION_NAMES.includes(motion as MotionName)) {
      fail(where, `"motion" must be one of ${MOTION_NAMES.join(', ')}`);
    }

    // `noRef` keeps `?ref=aix4u` off links where a stranger's query param is a
    // liability (DESIGN §13.3 names the Chrome Web Store). Boolean `true` only:
    // `"noRef": false` is noise, and noise in the CMS fails the build.
    const noRef = obj['noRef'];
    if (noRef !== undefined && noRef !== true) fail(where, '"noRef" must be true when present (omit it otherwise)');

    const first = SHAPES[shape].cells[0]!;
    const home: CellPoint = { cx: first[0], cy: first[1], ax: 0.5, ay: 0.5 };
    const icon = optionalAsset(where, obj, 'icon');
    const name = str(where, obj, 'name');
    // The sticker band is gone (DESIGN §3.2 v2.1); an entry that still carries a
    // `bandName` is stale config, and stale config in the CMS fails the build.
    if (obj['bandName'] !== undefined) {
      fail(where, '"bandName" is retired: the piece carries no name text (DESIGN §3.2)');
    }

    return {
      type: 'product',
      id,
      name,
      shape,
      accent: color(where, obj, 'accent'),
      accentDark: color(where, obj, 'accentDark'),
      priority,
      url: url(where, obj, 'url'),
      href: noRef === true ? url(where, obj, 'url') : withRef(url(where, obj, 'url')),
      noRef: noRef === true,
      kind: taxonomy(where, obj, 'kind'),
      status: taxonomy(where, obj, 'status'),
      tagline: str(where, obj, 'tagline'),
      description: str(where, obj, 'description'),
      ...(icon ? { icon } : {}),
      iconAt: cellPoint(where, obj, 'iconAt', shape, home),
      face: face(where, obj, shape, home),
      motion: motion as MotionName,
      skin: skin(where, obj),
    };
  });

  const products = items.filter((i): i is ProductItem => i.type === 'product');
  if (products.length === 0) fail('items', 'at least one entry must be a product');

  return {
    next: { teaser, url: nextUrl },
    panel,
    items,
    products: [...products].sort((a, b) => a.priority - b.priority),
    links: items.filter((i): i is LinkItem => i.type === 'link'),
  };
}

export const content: SiteContent = validate(raw);
