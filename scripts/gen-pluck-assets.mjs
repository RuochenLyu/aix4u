/**
 * Pluck skin + icon generator (one-off, procedural).
 *
 * The J piece: bottom row = the photo (dunes + sun/moon) with a pale cat-shaped
 * hole in its right cell; top-right cell = that same cat, coral, lifted out and
 * sitting on a transparency checkerboard. Brand: pluck.aix4u.com (--coral
 * #ee4b45; icon = coral cat plucked from a dune photo).
 *
 * Logical canvas 144x96 (48px per cell), nearest-neighbour x5 -> 720x480.
 * Binary alpha, strict J mask, subtle baked seams at interior cell edges
 * (DESIGN §3.1 v2.1 — the current skin batch grids its own cells).
 */
import sharp from 'sharp';

const CELL = 48;
const W = 3 * CELL;
const H = 2 * CELL;
const SCALE = 5;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// J cells: [2,0] + bottom row.
const inPiece = (x, y) => (y >= CELL ? true : x >= 2 * CELL);

/* 4x4 Bayer matrix, for dithered gradients. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x, y) => (BAYER[y % 4][x % 4] + 0.5) / 16;

/* Deterministic speckle. */
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The sitting cat, in a 40x46 sprite box: two ears, round head, plump body,
 * a tail hooked up along the right. Same silhouette for the coral subject,
 * the hole in the photo, and the icon.
 */
function catMask(u, v) {
  if (u < 0 || v < 0 || u >= 40 || v >= 46) return false;
  // ears: apexes at (10,0) and (28,0), bases at v=10
  if (v <= 10 && (Math.abs(u - 10) <= v * 0.55 || Math.abs(u - 28) <= v * 0.55)) return true;
  // head: ellipse (19,19) rx 15 ry 12
  if (((u - 19) / 15) ** 2 + ((v - 19) / 12) ** 2 <= 1) return true;
  // body: ellipse (18,35) rx 14 ry 11, flat-clipped at v=45
  if (((u - 18) / 14) ** 2 + ((v - 35) / 11) ** 2 <= 1 && v <= 45) return true;
  // tail: a short hook off the body's right flank, round tip curling up
  if (u >= 33 && u <= 37 && v >= 33 && v <= 45) return true;
  if (((u - 35) / 3) ** 2 + ((v - 31) / 3) ** 2 <= 1) return true;
  return false;
}

/** Sprite origin per home: lifted cat floats in the top cell, the hole sits low. */
const CAT_TOP = { x: 2 * CELL + 3, y: 1 };
const CAT_HOLE = { x: 2 * CELL + 4, y: CELL + 2 };

function render(theme) {
  const dark = theme === 'dark';
  const img = Buffer.alloc(W * H * 4);

  const skyTop = dark ? hex('#2a221c') : hex('#ffe3ba');
  const skyBot = dark ? hex('#181310') : hex('#ffb27a');
  const duneBack = dark ? hex('#503a2e') : hex('#ff9a76');
  const duneBackEdge = dark ? hex('#6a4d3b') : hex('#ffb28c');
  const duneFront = dark ? hex('#38271f') : hex('#ee6a55');
  const duneFrontEdge = dark ? hex('#4c352a') : hex('#ff8266');
  const duneShade = dark ? hex('#2b1e18') : hex('#d95546');
  const sun = dark ? hex('#e8dfcc') : hex('#f7c164');
  const sunRim = dark ? hex('#cfc4ae') : hex('#ffd98f');
  const checkA = dark ? hex('#2b2520') : hex('#f2ede4');
  const checkB = dark ? hex('#1f1a16') : hex('#dcd5c8');
  const cat = dark ? hex('#ff756b') : hex('#ee4b45');
  const catRim = dark ? hex('#ffa38f') : hex('#ff8a6e');
  const catShade = dark ? hex('#c74842') : hex('#b83530');
  const hole = dark ? hex('#5d554c') : hex('#faf5ee');
  const holeShade = dark ? hex('#4c453d') : hex('#e7ddca');

  const backTop = (x) => 74 + 3 * Math.sin(x / 14 + 1);
  const frontTop = (x) => 83 + 2.5 * Math.sin(x / 10 + 4);

  const holeCat = (x, y) => catMask(x - CAT_HOLE.x, y - CAT_HOLE.y);
  const topCat = (x, y) => catMask(x - CAT_TOP.x, y - CAT_TOP.y);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inPiece(x, y)) continue;
      let c;

      if (y < CELL) {
        // top-right cell: transparency checkerboard + the plucked coral cat
        c = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? checkA : checkB;
        if (topCat(x, y)) {
          c = cat;
          if (!topCat(x - 1, y - 1) || !topCat(x - 2, y - 2)) c = catRim;
          else if (!topCat(x + 1, y + 1) || !topCat(x + 2, y + 2)) c = catShade;
          // belly dither
          else if (y - CAT_TOP.y > 30 && hash(x, y) < 0.25) c = mix(cat, catShade, 0.6);
        }
      } else {
        // the photo: dithered sky, sun/moon, two dune ridges
        const t = Math.min((y - CELL) / 30, 1);
        c = mix(skyTop, skyBot, t + (bayer(x, y) - 0.5) * 0.22);
        const d = Math.hypot(x - 26, y - 63);
        if (d <= 6) c = sun;
        else if (d <= 7.5) c = sunRim;
        else if (!dark && d <= 10 && bayer(x, y) < 0.35) c = mix(c, sunRim, 0.7);
        if (dark) {
          // a few fixed stars
          for (const [sx, sy] of [[8, 54], [46, 51], [70, 58], [88, 52], [118, 55], [135, 62]]) {
            if (x === sx && y === sy) c = sunRim;
          }
        }
        if (y >= backTop(x)) {
          c = y - backTop(x) < 1.5 ? duneBackEdge : duneBack;
          if (y - backTop(x) >= 1.5 && hash(x, y) < 0.12) c = mix(duneBack, duneShade, 0.5);
        }
        if (y >= frontTop(x)) {
          c = y - frontTop(x) < 1.5 ? duneFrontEdge : duneFront;
          if (y > 89 && bayer(x, y) < 0.4) c = duneShade;
          else if (y - frontTop(x) >= 1.5 && hash(x + 7, y) < 0.1) c = mix(duneFront, duneShade, 0.6);
        }
        // the cat-shaped hole the subject left behind
        if (holeCat(x, y)) {
          c = hole;
          if (!holeCat(x, y - 1) || !holeCat(x - 1, y)) c = holeShade;
        }
      }

      // baked interior seams (multiply-darken 2px at cell boundaries)
      const seamV = y >= CELL && (x === CELL - 1 || x === CELL || x === 2 * CELL - 1 || x === 2 * CELL);
      const seamH = x >= 2 * CELL && (y === CELL - 1 || y === CELL);
      if (seamV || seamH) c = c.map((v) => Math.round(v * 0.72));

      const i = (y * W + x) * 4;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
      img[i + 3] = 255;
    }
  }
  return img;
}

function renderIcon() {
  // 32x32 logical, x16 -> 512: coral cat on a light checkerboard
  const S = 32;
  const img = Buffer.alloc(S * S * 4);
  const checkA = hex('#f2ede4');
  const checkB = hex('#dcd5c8');
  const cat = hex('#ee4b45');
  const catRim = hex('#ff8a6e');
  const catShade = hex('#b83530');
  const m = (u, v) => catMask(((u - 1) / 30) * 40, ((v - 1) / 30) * 46);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let c = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? checkA : checkB;
      if (m(x, y)) {
        c = cat;
        if (!m(x - 1, y - 1)) c = catRim;
        else if (!m(x + 1, y + 1)) c = catShade;
      }
      const i = (y * S + x) * 4;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
      img[i + 3] = 255;
    }
  }
  return img;
}

const out = process.argv[2] ?? 'public/skins';
for (const theme of ['light', 'dark']) {
  await sharp(render(theme), { raw: { width: W, height: H, channels: 4 } })
    .resize(W * SCALE, H * SCALE, { kernel: 'nearest' })
    .webp({ lossless: true })
    .toFile(`${out}/pluck-${theme}.webp`);
}
await sharp(renderIcon(), { raw: { width: 32, height: 32, channels: 4 } })
  .resize(512, 512, { kernel: 'nearest' })
  .webp({ lossless: true })
  .toFile(`${process.argv[3] ?? 'public/icons'}/pluck.webp`);
console.log('done');
