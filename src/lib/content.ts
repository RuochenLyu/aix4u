/**
 * Build-time validation of src/data/products.json.
 *
 * The JSON file is the CMS. A malformed entry must break `npm run build`, never
 * production, so this module is imported from the page frontmatter and throws
 * on the first problem it finds.
 *
 * A v2 product entry configures its whole identity (DESIGN §3, §10): shape (and
 * with it the canonical orientation), accents, the light/dark skin paths, the
 * cell the eye sits in, the motion-personality preset, and the info-panel copy.
 */

import raw from '../data/products.json';
import { SHAPES, hasCell, type ShapeName } from './tetromino';

/**
 * Motion personality presets (DESIGN §3.4). One shared keyframe set, driven by
 * per-piece CSS variables — so a new personality is a row in this table, not a
 * new animation.
 *
 *   tease   degrees of the pre-landing rotation tease (T's T-spin wink)
 *   prop    px the piece overshoots upwards after landing (L propping up)
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
  'prop-up': { tease: 0, prop: 4, sway: 0, squash: 0.94, bob: 2, beat: 'breath' },
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
  /** The single eye (DESIGN §3.3). */
  eye: CellPoint;
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
  panel: { idle: string; cta: string };
  items: SceneItem[];
  products: ProductItem[];
  links: LinkItem[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

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
  const panel = { idle: str('panel', panelRaw, 'idle'), cta: str('panel', panelRaw, 'cta') };

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
      kind: taxonomy(where, obj, 'kind'),
      status: taxonomy(where, obj, 'status'),
      tagline: str(where, obj, 'tagline'),
      description: str(where, obj, 'description'),
      ...(icon ? { icon } : {}),
      iconAt: cellPoint(where, obj, 'iconAt', shape, home),
      eye: cellPoint(where, obj, 'eye', shape, home),
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

/** `MEIKYU · WEB · DAILY — Deduce the daily dungeon in six tries` (DESIGN §4.4). */
export function panelLine(product: ProductItem): string {
  return `${product.name.toUpperCase()} · ${product.kind} · ${product.status} — ${product.tagline}`;
}
