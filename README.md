# aix4u.com

The homepage of [aix4u.com](https://aix4u.com), built as a **frozen frame of an ongoing
Tetris game**. Every product I ship is a tetromino: it drops in, lands somewhere on the
board, and stays there. The page is mostly empty grid on purpose — the breathing room is
the point, and a wall of tiles would read as a shelf, not a game.

Astro, TypeScript, zero UI framework. One vanilla module positions the scene; everything
it positions already exists in the static HTML.

![The aix4u playfield: tetromino product pieces floating above an uneven stack](public/og.png)

<!-- TODO: replace with a real screenshot once the pixel icons land (see "Assets"). -->

## How it works

```
src/data/products.json   the CMS — five products, three link tiles, one NEXT teaser
src/lib/content.ts       build-time validation; a bad entry fails the build
src/lib/tetromino.ts     shape geometry in grid cells
src/lib/scene.ts         the scene engine (pure, isomorphic)
src/components/          HUD, playfield, piece + label card
src/scripts/main.ts      client entry: theme, seed lifecycle, reshuffle
src/styles/global.css    the whole visual language, themed with custom properties
```

**One seed, one scene.** A single integer runs through a mulberry32 PRNG and determines
lane order, floating heights, the shape of the stack, where the holes are, and the ghost
piece's path. `buildScene()` is pure and runs in both Node and the browser:

- at **build time** with a fixed seed, so `dist/index.html` ships a complete, readable,
  clickable scene — with JavaScript off the page still works;
- in the **browser** with a random seed (or `?seed=` from the URL), which only *moves*
  the elements that are already there. Pieces are real `<a href>` elements at every stage.

**Two pools.** High-priority products float in the sky, one per vertical lane. Everything
else — lower-priority products and the link tiles — rests on the stack at the bottom,
which is grown from a random-walk skyline and always keeps a hole or two, because real
Tetris stacks have holes. The lane count comes from the viewport, so on a narrow screen
the low-priority pieces spill down into the stack instead of crowding the sky. Ship more
products and the stack gets taller and prouder.

**Motion** is quantized (`steps()`, never smooth): pieces drop in with a settle-bounce,
label cards fade in behind them, floating pieces bob out of phase, and a ghost piece
falls through the background forever. Pressing <kbd>R</kbd> (or tapping the footer hint)
hard-drops the sky onto the stack, flashes a line clear, and replays the entry with a new
seed — the pieces never just vanish, they get cleared. `prefers-reduced-motion` skips
straight to the final frame. Only `transform` and `opacity` are ever animated.

**Themes.** Light is "TV gray", dark is "backlit console" — not an inversion, but the same
handheld with the backlight on. An inline `<head>` script resolves the theme before first
paint, so there is no flash; the choice persists in `localStorage`.

No analytics, no cookies, no third-party requests. The two fonts (Silkscreen, IBM Plex
Mono) are self-hosted latin subsets.

## Adding a product = editing one JSON entry

Append an object to `items` in [`src/data/products.json`](src/data/products.json):

```json
{
  "type": "product",
  "id": "new-thing",
  "name": "New Thing",
  "shape": "T",
  "accent": "#c46bd8",
  "accentDark": "#e08bf5",
  "priority": 6,
  "url": "https://newthing.example",
  "tagline": "One line, shown on the label card",
  "description": "A sentence or two. Used in the JSON-LD ItemList."
}
```

That is the entire change. The engine picks it up: the HUD counter becomes `06`, the piece
gets a lane or a spot on the stack depending on its `priority`, a label card is placed and
connected with a leader line, and the product joins the `ItemList` structured data.

Field notes:

| Field | Rules |
|---|---|
| `id` | kebab-case, unique — also becomes the DOM id (`piece-new-thing`) |
| `shape` | one of `T`, `L`, `S`, `O`, `I` (see `src/lib/tetromino.ts` to add more) |
| `accent` / `accentDark` | `#rrggbb`; the dark variant should read as *backlit*, not merely lighter |
| `priority` | unique integer, `1` = most prominent. Beyond the lane count, pieces land in the stack |
| `tagline` | one line — it has to fit a card roughly four cells wide |

Link tiles are 1×1 and use `{"type": "link", "id", "name", "label", "url"}`, where `label`
is at most two characters. Set `next.teaser` to a string to tease the next product in the
HUD; leave it empty and the HUD renders the mystery block.

Validation lives in `src/lib/content.ts` and runs during the build, so a typo fails
`npm run build` instead of production.

## Development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # astro check + static build into dist/
npm run preview  # serve dist/
```

Useful while working on the engine:

- `?seed=12345` reproduces a scene exactly. The current seed is written back to the URL
  after every reshuffle, so any layout you like is shareable.
- <kbd>R</kbd> reshuffles.
- `npm run sync-fonts` re-copies the font subsets out of the `@fontsource/*` packages
  into `public/fonts/` (only needed after bumping those dependencies).

## Deploying (Cloudflare Pages)

The site is a plain static bundle; Pages builds it on push.

| Setting | Value |
|---|---|
| Framework preset | Astro (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 or newer (`NODE_VERSION` environment variable) |

No environment variables, no functions, no CI configuration — that is deliberate. Set the
custom domain to `aix4u.com` and update `site` in `astro.config.mjs` if you fork this.

## Assets

Pixel icons per product, the real OG image and the favicon are produced separately and
land in `public/`. Until then, each piece shows the product's initial in its icon cell,
the favicon is an inline SVG tetromino, and `public/og.png` is rendered from
`scripts/og-placeholder.svg`.

## Design

[`docs/DESIGN.md`](docs/DESIGN.md) is the single source of truth for the visual and
interaction decisions — concept, palette, scene model, animation budget, responsiveness.
Changes to the design go through that document first.

## License

MIT © Ruochen Lyu
