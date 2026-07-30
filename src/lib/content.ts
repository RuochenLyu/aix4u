/**
 * Build-time validation of src/data/products.json.
 *
 * The JSON file is the CMS. A malformed entry must break `npm run build`, never
 * production, so this module is imported from the page frontmatter and throws
 * on the first problem it finds.
 */

import raw from '../data/products.json';
import { SHAPES, type ShapeName } from './tetromino';

export interface ProductItem {
  type: 'product';
  id: string;
  name: string;
  shape: ShapeName;
  accent: string;
  accentDark: string;
  priority: number;
  url: string;
  tagline: string;
  description: string;
  /** Optional pixel-art icon under /icons/; absent = initial-letter fallback. */
  icon?: string;
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
  next: { teaser: string };
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
function optionalIcon(where: string, value: Record<string, unknown>): string | undefined {
  const v = value['icon'];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.trim() === '') fail(where, '"icon" must be a non-empty string when present');
  if (!v.startsWith('/')) fail(where, `"icon" must be a root-relative path such as "/icons/foo.png", got "${v}"`);
  return v;
}

function color(where: string, value: unknown, field: string): string {
  const v = str(where, value, field);
  if (!HEX.test(v)) fail(where, `"${field}" must be a #rrggbb hex color, got "${v}"`);
  return v;
}

function validate(input: unknown): SiteContent {
  if (typeof input !== 'object' || input === null) fail('root', 'expected an object');
  const root = input as Record<string, unknown>;

  const nextRaw = root['next'];
  if (typeof nextRaw !== 'object' || nextRaw === null) fail('next', 'expected an object');
  const teaser = (nextRaw as Record<string, unknown>)['teaser'];
  if (typeof teaser !== 'string') fail('next.teaser', 'must be a string (empty = mystery block)');

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
      const link: LinkItem = {
        type: 'link',
        id,
        name: str(where, obj, 'name'),
        label: str(where, obj, 'label'),
        url: url(where, obj, 'url'),
        ...(optionalIcon(where, obj) ? { icon: optionalIcon(where, obj)! } : {}),
        ...(logo ? { logo: logo as LinkLogo } : {}),
      };
      if ([...link.label].length > 2) fail(where, '"label" must be at most 2 characters (it fills a 1x1 tile)');
      return link;
    }

    if (type !== 'product') fail(where, `"type" must be "product" or "link", got ${JSON.stringify(type)}`);

    const shape = str(where, obj, 'shape');
    if (!(shape in SHAPES)) fail(where, `"shape" must be one of ${Object.keys(SHAPES).join(', ')}`);

    const priority = obj['priority'];
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 1) {
      fail(where, '"priority" must be a positive integer (1 = most prominent)');
    }
    if (seenPriorities.has(priority)) fail(where, `duplicate priority ${priority}`);
    seenPriorities.add(priority);

    return {
      type: 'product',
      id,
      name: str(where, obj, 'name'),
      shape: shape as ShapeName,
      accent: color(where, obj, 'accent'),
      accentDark: color(where, obj, 'accentDark'),
      priority,
      url: url(where, obj, 'url'),
      tagline: str(where, obj, 'tagline'),
      description: str(where, obj, 'description'),
      ...(optionalIcon(where, obj) ? { icon: optionalIcon(where, obj)! } : {}),
    };
  });

  const products = items.filter((i): i is ProductItem => i.type === 'product');
  if (products.length === 0) fail('items', 'at least one entry must be a product');

  return {
    next: { teaser },
    items,
    products: [...products].sort((a, b) => a.priority - b.priority),
    links: items.filter((i): i is LinkItem => i.type === 'link'),
  };
}

export const content: SiteContent = validate(raw);
