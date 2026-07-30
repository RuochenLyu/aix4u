/**
 * Link policy check (DESIGN §4.15), run against the built HTML.
 *
 * Every off-site anchor has to open in a new tab with `rel="noopener noreferrer"`,
 * and every product anchor has to carry the descriptive `aria-label` that
 * replaced the retired sticker band as the thing anything reading anchors gets to
 * see. It used to be a `title`; v2.1.2 took every native tooltip off the page
 * (§4.15), so the assertion moved with the attribute — and it must *stay* an
 * assertion, because "the label quietly went missing" is the exact failure the
 * band's retirement made possible.
 *
 * This one reads `dist/`, not the source, because the rule is about what ships:
 * a component that forgets the attribute and a component that never renders are
 * different bugs, and only the output can tell them apart. It therefore runs
 * *after* `astro build`, unlike check-scene which is a property test of the
 * engine and runs before it.
 *
 * Run with `npm run check:links` (part of `npm run build`).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { content } from '../src/lib/content';

const DIST = 'dist';

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...htmlFiles(path));
    else if (entry.endsWith('.html')) out.push(path);
  }
  return out;
}

/** Attributes off one tag, lowercased names, quotes stripped. */
function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of tag.matchAll(/([a-zA-Z_:@-][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const name = match[1]!.toLowerCase();
    if (name === 'a') continue;
    const raw = match[2] ?? '';
    attrs.set(name, raw.replace(/^["']|["']$/g, ''));
  }
  return attrs;
}

const problems: string[] = [];
let anchors = 0;
let external = 0;

/** The label every product anchor must carry, from the same source as the panel. */
const expectedLabels = new Map(
  content.products.map((product) => [product.url, `${product.name} — ${product.tagline}`]),
);

let files: string[];
try {
  files = htmlFiles(DIST);
} catch {
  console.error(`link check: no ${DIST}/ to read — run this after \`astro build\`.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`link check: ${DIST}/ contains no HTML.`);
  process.exit(1);
}

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<a\b[^>]*>/g)) {
    anchors++;
    const attrs = attributes(match[0]);
    const href = attrs.get('href') ?? '';
    if (!/^https?:\/\//i.test(href)) continue;
    external++;

    const where = `${file}: <a href="${href}">`;
    if (attrs.get('target') !== '_blank') {
      problems.push(`${where} is off-site but does not open in a new tab`);
    }
    const rel = (attrs.get('rel') ?? '').split(/\s+/);
    for (const token of ['noopener', 'noreferrer']) {
      if (!rel.includes(token)) problems.push(`${where} is off-site but its rel is missing "${token}"`);
    }

    // No native tooltips anywhere on the page (DESIGN §4.15 v2.1.2).
    if (attrs.has('title')) problems.push(`${where} carries a title attribute`);

    // Products are the anchors that carry a flavour line; they also carry the label.
    if (attrs.has('data-flavor')) {
      const expected = expectedLabels.get(href);
      const label = attrs.get('aria-label') ?? '';
      if (!label) problems.push(`${where} is a product and has no aria-label`);
      else if (expected && label !== expected) {
        problems.push(`${where} aria-label is "${label}", expected "${expected}"`);
      }
    }
  }
}

// A page with no external anchors would pass every rule above by doing nothing,
// which is the one way this check could quietly stop checking.
if (external < content.products.length + content.links.length) {
  problems.push(
    `only ${external} off-site anchors in the build, expected at least ${content.products.length + content.links.length}`,
  );
}

// The panel reads its rows off the anchors' data attributes at runtime, so the
// copy cannot be checked from the href — assert it exists at the source instead,
// which is the part the markup cannot drift from on its own.
for (const product of content.products) {
  if (product.tagline.trim() === '' || product.kind.trim() === '' || product.status.trim() === '') {
    problems.push(`${product.id} would render an empty info-panel row`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`link policy: ${problem}`);
  console.error(`\n${problems.length} link policy violation(s).`);
  process.exit(1);
}

console.log(`link check: ${external} off-site anchors of ${anchors} across ${files.length} page(s), all sandboxed.`);
