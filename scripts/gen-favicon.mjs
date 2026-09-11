/**
 * Favicon generator (procedural, deterministic).
 *
 * The mark is the site in one glyph: a bevelled amber T piece with one googly
 * eye, sitting on the dark console chassis — the same three things the OG card
 * and the HUD are made of. Two hand-plotted sizes rather than one downscaled:
 * a 16px tab icon and a 32px one (Retina tabs, pinned tabs) each get pixels
 * placed for that size, because a 1px bevel halved is no bevel at all.
 *
 *   favicon-16.png        16x16, the 16 grid at 1:1
 *   favicon-32.png        32x32, the 32 grid at 1:1
 *   favicon.png           256x256, the 32 grid x8 (legacy path, large-icon UIs)
 *   apple-touch-icon.png  180x180, opaque — iOS paints transparency black and
 *                         rounds the corners itself, so this one is a flat
 *                         chassis square with the 32 grid x5 centred on it
 *
 *   node scripts/gen-favicon.mjs [outDir=public]
 */
import sharp from 'sharp';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* The stylesheet's tokens: chassis (HUD bar) and the T's amber (Meikyu, priority 1). */
const CHASSIS_TOP = hex('#1c2027');
const CHASSIS_BOTTOM = hex('#0e1015');
const CHASSIS_EDGE = hex('#050608');
const PALETTE = {
  L: hex('#ffd069'), // bevel light
  A: hex('#e8a33d'), // amber fill
  D: hex('#a56a1c'), // bevel dark
  K: hex('#22242a'), // outline / eye ring
  W: hex('#fdf6e4'), // sclera
  P: hex('#14151a'), // pupil
};

/**
 * 16 grid: 4px cells, 1px bevel, a 2x2 eye (three whites and a pupil — the
 * smallest thing that still reads as "looking"). No outline: at this size the
 * dark chassis is the outline.
 */
const GRID_16 = [
  '................',
  '................',
  '................',
  '................',
  '..LLLDLLLDLLLD..',
  '..LAADLAADLWWD..',
  '..LAADLAADLPWD..',
  '..DDDDDDDDDDDD..',
  '......LLLD......',
  '......LAAD......',
  '......LAAD......',
  '......DDDD......',
  '................',
  '................',
  '................',
  '................',
];

/**
 * 32 grid: 8px cells, 1px bevel, a 1px near-black outline around the silhouette
 * (the OG card's T has one), and the full googly anatomy on the top-right cell:
 * ring, sclera, oversized pupil, one catchlight pinned upper-left.
 */
const GRID_32 = [
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
  '...KLLLLLLLDLLLLLLLDLLLLLLLDK...',
  '...KLAAAAAADLAAAAAADLAAAAAADK...',
  '...KLAAAAAADLAAAAAADLAKKKAADK...',
  '...KLAAAAAADLAAAAAADLKWWWKADK...',
  '...KLAAAAAADLAAAAAADLKWWPKADK...',
  '...KLAAAAAADLAAAAAADLKWPPKADK...',
  '...KLAAAAAADLAAAAAADLAKKKAADK...',
  '...KDDDDDDDDDDDDDDDDDDDDDDDDK...',
  '...KKKKKKKKKLLLLLLLDKKKKKKKKK...',
  '...........KLAAAAAADK...........',
  '...........KLAAAAAADK...........',
  '...........KLAAAAAADK...........',
  '...........KLAAAAAADK...........',
  '...........KLAAAAAADK...........',
  '...........KLAAAAAADK...........',
  '...........KDDDDDDDDK...........',
  '...........KKKKKKKKKK...........',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
  '................................',
];

/** Rounded-square chassis: inside test for a square of `size` with corner radius `r`. */
function insideChassis(x, y, size, r) {
  const cx = x < r ? r - 0.5 : x >= size - r ? size - r - 0.5 : x;
  const cy = y < r ? r - 0.5 : y >= size - r ? size - r - 0.5 : y;
  return Math.hypot(x - cx, y - cy) <= r;
}

/**
 * Paint one logical canvas: chassis (rounded, edged, vertical gradient) under
 * the plotted grid. A `fill` replaces the plate with a full-bleed background —
 * the opaque touch icon.
 */
function paint(grid, size, radius, { plate = true, fill = null } = {}) {
  const img = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = null;
      if (fill) c = fill(y);
      else if (plate && insideChassis(x, y, size, radius)) {
        const edge = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([nx, ny]) => !insideChassis(nx, ny, size, radius));
        c = edge ? CHASSIS_EDGE : mix(CHASSIS_TOP, CHASSIS_BOTTOM, y / (size - 1));
      }
      const ch = grid[y]?.[x] ?? '.';
      if (ch !== '.') {
        const p = PALETTE[ch];
        if (!p) throw new Error(`unknown glyph "${ch}" at ${x},${y}`);
        c = p;
      }
      if (!c) continue;
      const i = (y * size + x) * 4;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
      img[i + 3] = 255;
    }
  }
  return img;
}

const out = process.argv[2] ?? 'public';
const png = (buf, size) => sharp(buf, { raw: { width: size, height: size, channels: 4 } });

await png(paint(GRID_16, 16, 2), 16).png({ compressionLevel: 9 }).toFile(`${out}/favicon-16.png`);
await png(paint(GRID_32, 32, 4), 32).png({ compressionLevel: 9 }).toFile(`${out}/favicon-32.png`);
await png(paint(GRID_32, 32, 4), 32)
  .resize(256, 256, { kernel: 'nearest' })
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${out}/favicon.png`);

// The touch icon: an opaque 36x36 chassis-coloured canvas with the 32 grid
// centred on it, x5 -> 180. iOS rounds the corners; we only supply the plate.
const TOUCH = 36;
const touchGrid = GRID_32.map((row) => `..${row}..`);
touchGrid.unshift('.'.repeat(TOUCH), '.'.repeat(TOUCH));
touchGrid.push('.'.repeat(TOUCH), '.'.repeat(TOUCH));
await png(
  paint(touchGrid, TOUCH, 0, { fill: (y) => mix(CHASSIS_TOP, CHASSIS_BOTTOM, y / (TOUCH - 1)) }),
  TOUCH,
)
  .resize(180, 180, { kernel: 'nearest' })
  .png({ compressionLevel: 9, palette: true })
  .toFile(`${out}/apple-touch-icon.png`);

console.log('done');
