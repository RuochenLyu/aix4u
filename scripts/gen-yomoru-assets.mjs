/**
 * Yomoru skin + icon post-processor (one-off).
 *
 * The Z piece: the transfer station. gpt-image-2 draws the scene as a full 3:2
 * rectangle (`gen_image.py`, prompts in the commit that added this file); this
 * script turns a candidate into a skin the way the Pluck generator builds one
 * from scratch — a 48px-per-cell logical canvas, binary alpha, a strict Z mask,
 * baked interior seams, then nearest-neighbour x5 to 720x480 lossless webp.
 *
 * The model cannot output transparency and does not know what a Z is, so the
 * prompt asked for a 3x2 grid with the two discarded cells (top-right and
 * bottom-left) left empty; the mask here is what actually cuts them.
 *
 *   node scripts/gen-yomoru-assets.mjs <light.png> <dark.png> <icon.png>
 */
import sharp from 'sharp';

const CELL = 48;
const W = 3 * CELL;
const H = 2 * CELL;
const SCALE = 5;

// Z cells: [0,0] [1,0] / [1,1] [2,1].
const inPiece = (x, y) => (y < CELL ? x < 2 * CELL : x >= CELL);

/**
 * Downsample a rendered candidate to the logical grid. The model's "chunky
 * pixels" are ~12px clusters on a 1536px canvas, which is not an integer
 * multiple of the 48px cell, so no sampling grid lines up with them: a plain
 * nearest pick breaks thin lines (the stair rail came out as dashes) and a
 * plain average comes out soft. Sharpen, average, then snap to a small palette —
 * the palette is what makes averaged edges read as drawn pixels again, at the
 * colour count the hand-drawn skins on the board actually use.
 */
async function logical(file, width, height, colours) {
  const averaged = await sharp(file)
    .sharpen({ sigma: 1.5 })
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const palette = await sharp(averaged, { raw: { width, height, channels: 3 } })
    .png({ palette: true, colours, dither: 0 })
    .toBuffer();
  return sharp(palette).removeAlpha().raw().toBuffer();
}

async function renderSkin(file) {
  const src = await logical(file, W, H, 32);
  const img = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (!inPiece(x, y)) continue;
      const i = (y * W + x) * 3;
      let c = [src[i], src[i + 1], src[i + 2]];
      // Baked interior seams (multiply-darken 2px at cell boundaries), the same
      // recipe as the Pluck skin: between [0,0]|[1,0], [1,0]/[1,1], [1,1]|[2,1].
      const seamV =
        (y < CELL && (x === CELL - 1 || x === CELL)) || (y >= CELL && (x === 2 * CELL - 1 || x === 2 * CELL));
      const seamH = x >= CELL && x < 2 * CELL && (y === CELL - 1 || y === CELL);
      if (seamV || seamH) c = c.map((v) => Math.round(v * 0.72));
      img[o] = c[0];
      img[o + 1] = c[1];
      img[o + 2] = c[2];
      img[o + 3] = 255;
    }
  }
  return img;
}

async function renderIcon(file) {
  // 64x64 logical, x8 -> 512. The model drew the cat on a ~40px grid, and at 32
  // the cap band and the ears melted into each other; 64 keeps them.
  const S = 64;
  const src = await logical(file, S, S, 16);
  const img = Buffer.alloc(S * S * 4);
  for (let p = 0; p < S * S; p++) {
    img[p * 4] = src[p * 3];
    img[p * 4 + 1] = src[p * 3 + 1];
    img[p * 4 + 2] = src[p * 3 + 2];
    img[p * 4 + 3] = 255;
  }
  return img;
}

const [light, dark, icon, skinsDir = 'public/skins', iconsDir = 'public/icons'] = process.argv.slice(2);
if (!light || !dark || !icon) {
  console.error('usage: node scripts/gen-yomoru-assets.mjs <light.png> <dark.png> <icon.png> [skinsDir] [iconsDir]');
  process.exit(2);
}

for (const [theme, file] of [['light', light], ['dark', dark]]) {
  await sharp(await renderSkin(file), { raw: { width: W, height: H, channels: 4 } })
    .resize(W * SCALE, H * SCALE, { kernel: 'nearest' })
    .webp({ lossless: true })
    .toFile(`${skinsDir}/yomoru-${theme}.webp`);
}
await sharp(await renderIcon(icon), { raw: { width: 64, height: 64, channels: 4 } })
  .resize(512, 512, { kernel: 'nearest' })
  .webp({ lossless: true })
  .toFile(`${iconsDir}/yomoru.webp`);
console.log('done');
