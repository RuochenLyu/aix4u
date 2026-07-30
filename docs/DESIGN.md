# aix4u.com — Design Document (v2)

The homepage of aix4u.com is a product portfolio built as a **frozen frame of an ongoing Tetris game** ("Mid-game" concept). Every product **is** a tetromino piece — not a card with a tetromino theme. Shipping a new product means a new piece drops into the world.

This document is the single source of truth. Implementation follows it; design changes go through this file first.

**v2 supersedes v1**: external label cards are removed (replaced by piece-integrated identity + a fixed info panel), pieces gained a full identity system (skin, eye, motion personality — the sticker band came with v2 and was retired in v2.1, see §3.2), and canonical orientations replace free placement of shapes.

## 1. Concept & non-goals

- First glance reads as **a Tetris game in progress**: airy playfield, uneven stack at the bottom, pieces suspended mid-fall.
- Breathing room is a feature. Never pack pieces into a tight wall.
- The pieces are **alive but not childish**: minimal per-piece faces (§3.3) and motion personalities — every piece a different character, none of them a cartoon.
- **Non-goals**: no warm-paper/cream palettes, no playable Tetris, no floating popovers/modals (web language, not game language), no CMS — `products.json` is the CMS.

## 2. Visual language

Pixel/retro handheld-console aesthetic. Cute but gender-neutral.

**Fidelity reference:** `docs/reference/m1.png` (light desktop), `m2.png` (dark desktop), `m3.png` (light ultrawide), `m4.png` (dark mobile) define the level of finish. Flat rectangles with plain fills are below the bar:

- **Cells are candy, not paint chips**: slightly rounded corners (~3px), bright top/top-left bevel, darker bottom edge, subtle vertical gradient, faint horizontal scanline texture inside cells. Dark seams between cells stay.
- **HUD is a console bezel in both themes**: near-black bar, inset bordered sections with dotted dividers, accent-outlined pixel logo, seven-segment counter, `NEXT` crate slot, full-color pixel sun/moon toggle.
- **Falling pieces carry motion trails** (2–3 dashed ticks above, fading after landing).
- **The stack contains 1–2 dashed empty slots.**
- **(v2.1) One chassis width**: the HUD, the playfield and the bottom bezel share a single content width and horizontal margins — three different widths read as three unrelated widgets. The reshuffle hint is no longer a free-floating pill: it docks **inside the bottom bezel's right end** (panel text left, key hint right), the way a game status bar carries its button legend.
- **(v2.1.1) Depth — the keycap is convex, and the recipe already exists on the page**: the gray bed tiles read as keys, and what makes them keys is the **inset bevel** — a light inner edge along the top/left and a dark inner edge along the bottom/right, *inside* the silhouette — plus a 1px dark outer lip at the bottom and one faint contact shadow. Pieces adopt **that exact recipe** (the tiles' tokens, scaled), with the bevel frame drawn *over* the skin: the art stays full-strength in the middle, the inner frame curves the surface. The previous external "extruded side face" strip is retired — a dark bar under a flat image reads as a floating paper shadow, not thickness (verified on device). Multi-offset drop shadows stay banned. Press states: hover brightens the top bevel and lifts 1px; active inverts the bevel (dark top, light bottom = pressed in) and sinks 1px — the classic convex/concave flip. One recipe for pieces, tiles and chrome keys.
- **(v2.1) Background recedes**: fine-grid opacity halved, coarse line barely-there; the scene's contrast budget belongs to the pieces, not the lattice.
- **(v2.1.2) Native feel**: the scene is an app surface, not a document — `user-select: none` on scene chrome/pieces (panel text stays selectable), `-webkit-touch-callout: none`, `draggable="false"` on every img, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`, and `html` painted with the theme background so iOS/macOS rubber-band never exposes raw white.
- **(v2.1.2) Reshuffle vanishes as one body**: a piece's skin, face, icon and trails dissolve together with its cells during the line-clear crumble — an orphaned eye or glyph floating over an empty field between phases is a bug, not a transition. Same for link-tile glyphs.
- **The bezels are opaque and sit above the field**: pieces falling in slide *behind* the HUD and the bottom bezel, which is what sells "a screen inside a machine".

### Light mode ("TV gray")
Pale gray-blue background (`#c9d2dd` ± tuning), saturated piece colors, thick near-black outlines (`~#22242a`), and the keycap extrusion above — a solid side face plus one hard contact line. (This bullet used to call for "hard two-step pixel shadows"; the v2.1 Depth entry supersedes it, since two stacked offsets are exactly what read as paper on the real device.)

### Dark mode ("backlit console")
Deep charcoal (`~#141519`), soft accent glow around each piece. Not an inversion — "the backlight is on at night". Theme: `prefers-color-scheme` → manual toggle → `localStorage`, inline head script prevents FOUC; `?theme=light|dark` forces a theme for one load without persisting it (a debug/share override in the same spirit as `?seed=`).

A piece in dark mode is a **dim pane of its own colour behind a lit accent frame**: the cell fill is the accent mixed down into the background (~24 %), the seam is the bright `accentDark`. Warm off-white (`~#f3ecdb`) stays the ink for chrome with no accent of its own — link tiles, the ghost piece, body copy. (This bullet used to call for warm off-white outlines over a bright fill; `m2.png`/`m4.png` show the accent-framed version, and a bright slab behind a pale outline is not what a backlit LCD looks like, so the mockups won.)

### Typography
Pixel display font (Silkscreen) for HUD/names; monospace (IBM Plex Mono) for taglines/panel body. English only.

## 3. Piece identity system

Each product is one tetromino in a **canonical orientation** (never rotated by the engine), designed as a whole. Four layers, back to front:

### 3.1 Skin
The entire piece is the product's texture — no plain fills, no "icon cell + blank cells". Skins are art assets (see §10) laid across the whole piece under the CSS bevels. **(v2.1) The current skin batch has cell seams baked into the art** (the artist gridded each cell); until the final seamless redraw, CSS suppresses its own seams over skinned pieces so the grid isn't drawn twice. The eventual contract stays: the web draws the grid, the art is seamless.

| Product | Shape (canonical) | Skin concept | Accent (light) |
|---|---|---|---|
| Meikyu | **T** — 3-wide bar up | Dungeon stone bricks; glowing arched door + torch in the lower-center cell; faint maze scratches in the mortar | `#e8a33d` |
| RayTally | **L** — vertical arm upper-left, 3-wide horizontal arm at bottom | **Firefly jar on a night meadow**. Brand concept: fireflies = opportunities that glow ("每天收录正在发亮的机会"). Vertical arm is a glass jar holding 2–3 glowing fireflies (collected ideas); horizontal arm is a dark meadow with grass blades and more fireflies still hovering free. NOT a chart, NOT a lamp — the story is *collecting glowing things, daily* | `#d9f24e` |
| AHR999 Dataset | **S** — horizontal | Solidified amber/honey with a candlestick-wick pattern; one cell embeds a `₿` seal — "a fossilized market wave" | `#f59e0b` |
| X2Markdown | **O** — 2×2 | A page mid-fold: upper-left cell messy webpage fragments, lower-right cell clean `M↓` glyph — conversion painted on the skin | `#20b8c8` |
| Health Analyst | **I** — 4-wide horizontal | An ECG paper strip: heartbeat line runs through all four cells | `#3fae5a` |

Shape assignments are **semantic** (L = jar on the meadow, S = wave, I = strip, O = page, T = door) — a new product must pick a shape whose geometry means something for it.

### 3.2 Name (v2.1: the sticker band is retired)

Pieces carry **no persistent name text**. The skin is the identity; the name lives in the info panel (hover/focus/tap types `NAME · TYPE · STATUS — flavor`) and in the accessible layer (each piece's `<a>` keeps the name + flavor as sr-only text, so SEO and no-JS lose nothing). Rationale: the band obscured the art it sat on (the ECG trace casualty), and a wall of pictograms that answers on touch is more game-native than a wall of labels. `bandName` is gone from the schema.

### 3.3 Face (v2.1: per-piece face presets — supersedes the single-eye rule)

v2's "one identical eye for everyone" made the pieces feel stamped from one mold. Each piece now carries a **minimal face preset derived from its motion personality**, so the face and the way it falls tell the same character:

| Piece | Face | Idle quirk |
|---|---|---|
| T (Meikyu) | One wide, half-lidded eye — the dungeon keeper | Slow sideways glance every ~10 s |
| L (RayTally) | Two small round eyes, close-set — the collector | Occasionally glances down at its own jar |
| S (AHR999) | Two asymmetric eyes: one open, one squinting — watching the chart | Rare fast double-blink |
| O (X2Markdown) | Two big round eyes + a tiny "o" mouth — the mascot, the most face of the five | Mouth pops "o" on landing; flattens to "–" when asleep |
| I (Health Analyst) | One calm eye | Blink locked to its metronome bob — a visible heartbeat |

Restraint rules (the line between "alive" and "toy" moves, but still exists):
- At most **two eyes and one small mouth mark**; no limbs, no eyebrows, no cheeks.
- All marks are code-drawn pixels (no image assets), anchored per-cell in `products.json` (`face` preset name + anchor cells), clear of key skin features.
- Mouth/lash marks may use one color from a fixed 3-color micro-palette (echoing the reference's colored mouths) so variety still reads as a system.

Shared behaviors (all presets): pupils track the pointer in pixel steps; seeded blink phases; sleep after ~30 s idle (eyes close, O's mouth flattens); squeeze shut on hard-drop impact; **hover = a two-frame happy squint** (the eye curves into a ∪); `prefers-reduced-motion` renders the face static and open.

**(v2.1.3) Face craft — the googly-sticker anatomy.** The first face pass read as crude marks; the reference toys read as *stickers* because every eye has the same four-part anatomy. All five presets now share it, scaled from one `--eye-size` token (~0.30 cell):

- **Sclera**: white rounded-pixel oval with a 1px near-black outline ring — the outline is what lifts the eye off busy art (the meadow, the fragments).
- **Pupil**: oversized (~45% of the sclera), near-black, with a **1–2px white catchlight** pinned to its upper-left. The catchlight does not move with tracking (it belongs to the light, not the eye).
- **Lids**: thick 2–3px strokes with rounded pixel ends. Half-lid = straight lid over the top ~40% of the sclera; squint = lid closed to a curved 2px seam; sleep/blink = downward bow. One stroke weight across all presets.
- **Mouth (mascot only)**: a small capsule/ring with its own 1px dark outline and a 1px under-light — a rubbery sticker, same as the reference's colored mouths.

Same anatomy in both themes (dark mode may tint sclera slightly warm and glow the lids, but the outline ring stays). Implementation note from the build: the *lit* lid is the shut-eye/squint stroke, which is drawn on the artwork; the half-lid sits on the sclera and stays dark in both themes, or a pale lid over a pale white is two washes on top of each other. The shut stroke carries a 1px light backing in the light theme for the same reason the sclera has a ring — the collector's closed eyes were invisible on its own night meadow. Five faces, one anatomy, five expressions — the variety must come from lids/count/placement, never from differing construction quality.

### 3.4 Motion personality
All pieces share one parameterized animation system (same keyframes, per-piece CSS variables), but each gets a distinct parameter set derived from its shape mechanics:

| Piece | Personality parameters |
|---|---|
| T (Meikyu) | Does a quick 90°→0° tease-rotation just before landing (T-spin wink) |
| L (RayTally) | Lands, then the vertical arm "props up" with a 1-step overshoot |
| S (AHR999) | Sways ±2px horizontally while falling (the wave) |
| O (X2Markdown) | Falls straight and dumb, biggest squash on landing (the mascot) |
| I (Health Analyst) | Falls perfectly straight, steady metronome bob afterwards |

## 4. Scene model

### 4.1 Two pools
- **Floating pool** (high priority): suspended mid-air, staggered heights, the protagonists.
- **Landed pool** (low priority + link tiles): resting in the bottom stack. **(v2.1) The stack is a low bed, not a clump**: it spans ~85% of the field width, runs mostly 1–2 rows high with an occasional 3-row bump, link tiles perch on top of the bed like collectibles, filler count is modest, and its 1–2 hollow gaps + 1–2 dashed slots sit where a real game would plausibly leave them (under overhangs, not floating mid-bed).
- Overflow: floating pool caps at ~5 (or when lanes get tight); lowest priority spills into the stack. More products ⇒ prouder stack.
- Narrow (<~700px): **all products float**, stack holds only link tiles + filler.

### 4.15 Link policy (v2.1.2)
Every off-site link — products, link tiles, the `?` tile — opens in a new tab: `target="_blank"` + `rel="noopener noreferrer"`. **No `title` attributes anywhere on the page**: a native browser tooltip is a foreign object in a machine that has its own info panel, and it fires on a delay nobody asked for. Anchors are described by `aria-label` plus the sr-only name+flavor text, so crawlers and assistive tech lose nothing. `check:links` asserts the `aria-label`, as it used to assert the title.

### 4.2 Link tiles
Plain 1×1 gray tiles in the stack, visually quieter: GitHub (`github.com/RuochenLyu`), kshift.me, X (`x.com/kshift`). Configured in JSON (`type: "link"`); `aria-label` required, and the hover name-plate (a pixel card above the tile) says the destination. **(v2.1.2)** kshift's `⇧` keycap tested as unreadable — nobody knew what it meant — so it carries a pixel capital `K` until the real icon lands with the next asset batch. The `?` tile (§6.5) is one of these, with a different glyph and nothing else.

### 4.3 HUD
- Pixel logo `AIX4U`.
- Counter: `COLLECTED 05/??` (seven-segment; count from config; `??` hints more pieces will drop — collection framing).
- `NEXT` crate slot: translucent question block. See §6.4 for its easter egg.
- Sun/moon theme toggle (accessible).

### 4.4 Info panel (replaces all labels/popovers)
A **fixed slot** in the bottom bezel, sharing it with the key legend (§2 v2.1) — a game item-description panel, styled as part of the scene (pixel border, scanlines; Scott Pilgrim rule: the panel is scene, not chrome):

- Idle state: one-line site intro — `AIX4U — indie products by Ruochen.`
- On piece hover/focus (desktop) or first tap (touch): panel types out (typewriter, ~24 chars/s, skippable):
  `MEIKYU · WEB · DAILY — Deduce the daily dungeon in six tries. ▸ PLAY`
  Template: `NAME · TYPE · STATUS — flavor line. ▸ CTA`.
- A pixel selection cursor (corner brackets) frames the hovered/selected piece — **outside** the piece's bounding box with a ~0.15-cell gap; the brackets must never overlap the artwork (v2.1).
- Desktop click on piece = navigate (as before). Touch: first tap selects, `▸ PLAY` (or second tap on the same piece) navigates.
- Keyboard: pieces are focusable in priority order; panel follows focus; Enter navigates.
- The panel is `aria-live="polite"`; piece `<a>`s carry name + tagline as sr-only text, so no-JS/SEO keeps full content.


**(v2.1.2) Panel layout revision** — from device review:
- **Fixed two-row height, zero reflow**: row 1 renders instantly on select — product name (pixel font) + `TYPE · STATUS` as small chips; row 2 is the flavor line. Only row 2 types, at ~80 chars/s (24 was tested and reads as lag, not charm). Any interaction mid-type completes it instantly.
- **`▸ PLAY` is retired.** The CTA affordance is a key legend in the bezel's language: desktop shows `⏎ OPEN` at the panel's right when a piece is selected (Enter works); touch shows `TAP AGAIN TO OPEN`. A lone button inside a status bar read as web chrome.
- Idle state stays one line, vertically centered in the same fixed height.

## 5. Randomness
One integer seed drives everything (composition, blink phases, stagger jitter, ghost path) via a deterministic PRNG. New visit → random seed; `R`/tap → new seed; `?seed=<n>` reproduces a scene (written back via `history.replaceState`).

## 6. Animation

Physical first, pixel second. All transform/opacity; `prefers-reduced-motion` skips entry/reshuffle, freezes bob/ghost/eye.

1. **Entry (~1.2s)**: gravity-curve fall, seeded stagger 80–120ms, landed pieces first; landing = 2-frame squash (scaleY ≈ 0.94, origin bottom) + shadow snap + **3–4 pixel sparks** (tiny stars/plus glyphs, one-shot); dashed motion trails fade ~200ms after landing. Personality parameters (§3.4) modulate each piece's run.
2. **Idle**: bob ±2px, per-piece period/phase ("breathing, not elevators"); ghost piece falls slowly forever in the background — **(v2.1) each cycle draws a random shape from the seven standard tetrominoes at a random x** (seeded), styled as a sparse dotted outline, quieter than today; eyes blink/track/sleep (§3.3).
3. **Reshuffle (~2s, v2.1 — real physics)**: each floating piece hard-drops to its **true resting position** computed against the skyline (stack + previously dropped pieces + floor); pieces over open floor fall all the way down. Impacts land staggered (per-piece distance ⇒ per-piece timing), each with its own 2px shake and eye-squeeze. Then the **line clear**: a white scan sweeps the settled rows bottom-up (one row per ~2 frames), each swept row's cells dissolve into a few pixel motes; when the field is clear — new seed, entry replays. The old "everything stops at one height, whole layer blinks" reading is explicitly rejected.
4. **Hover/press**: two-step 2px lift + shadow/glow deepen; active sinks 2px (key-press feel).
5. **NEXT easter egg (v2.1.2)**: the mystery `?` is a **1×1 gray tile**, styled and placed exactly like the GitHub/X link tiles in the bed. (The v2.1.1 "real tetromino" reading was tried and reverted on device: a 3×2 dashed piece spent six cells of prime scene space on a footnote link.) It links to `https://github.com/RuochenLyu/aix4u/issues/new`. The third-reshuffle arrival stays: the tile drops from the NEXT slot once per session with the full falling treatment. In the HUD, the NEXT slot shows **a bare `?` glyph — no inner framed box** (a box inside the slot's box read as clutter).

## 7. Layout & responsiveness
- Cell `clamp(44px, 4.5vw, 72px)`; playfield max-width ~1140px, centered, full height; huge screens get ambience (grid + ghost), never stretching.
- No label-collision engine anymore (labels are gone). Floating pieces occupy seeded lanes with staggered heights; sky spans the upper ~2/3 above the real stack height.
- Narrow **(v2.1.3: one screen, no scroll)**: all-float (§4.1), and the whole machine — HUD, field, bezel — fits `100svh`; the page never scrolls. Cell size is the smaller of the width-bound and the height-bound (floor ~34px); pieces stagger in two tight columns with ~1-row gaps; the bed compresses to 1–2 rows (no three-row bump). Vertical breathing room shrinks before anything scrolls — a handheld console has exactly one screen. The narrow grid is **8 columns**, down from 9: once the field is width-bound, a column is nothing but cell size, and 8 buys a ~45px cell on a 375px phone where 9 left a band of dead sky under the HUD. The field is bottom-anchored in the stage, so whatever height is left over becomes sky rather than a gap under the floor. `svh`, not `dvh`: `dvh` grows when iOS retracts the address bar, which composes the layout for a state the visitor is not in yet. `check:scene` asserts the row count against the same budget from the other side (shortest phone, smallest cell).

## 8. Content (authoritative copy)

| Product | URL | Type · Status | Flavor line (info panel) |
|---|---|---|---|
| Meikyu | https://meikyu.app | WEB · DAILY | Deduce the daily dungeon in six tries |
| RayTally | https://raytally.com | WEB · DAILY | Glowing product ideas, collected daily |
| AHR999 Dataset | https://ahr999.aix4u.com | DATA · DAILY | The Bitcoin AHR999 index, as open data |
| X2Markdown | chromewebstore.google.com/detail/x2markdown/acljfllclafamkhdjjkldogcadfbigmo | CHROME · FREE | Right-click any page into clean Markdown |
| Health Analyst | https://github.com/RuochenLyu/apple-health-analyst | CLI · OSS | Apple Health reports, private and agent-ready |

Voice rules: verb-first where possible, ≤ 7 words, no "AI-powered" filler, states *what you get*.

Longer descriptions (meta/JSON-LD): unchanged from v1 —
- **Meikyu** — "Five residents are hiding in today's dungeon. You have six tries to place them." (official copy, verbatim)
- **RayTally** — A daily feed that collects the opportunities lighting up right now — watching trends and new launches, harvesting product ideas you can actually build. (Brand: fireflies = glowing opportunities; zh copy "每天收录正在发亮的机会".)
- **AHR999 Dataset** — Open dataset + dashboard for the AHR999 Bitcoin accumulation index; JSON + CSV, updated daily by CI.
- **X2Markdown** — Chrome extension converting the visible page (or selection) into clean Markdown via right-click; dedicated x.com extraction; local-only processing.
- **Health Analyst** — Two-stage CLI + agent skill: parses Apple Health exports locally into structured insights, renders narrative HTML reports with SVG charts.

Site meta: title `aix4u — products by Ruochen`, description "Indie products by Ruochen — daily puzzles, idea feeds, open data and developer tools. aix4u = AI for you." OG subtitle: `indie products by Ruochen` (the "dropping like tetrominoes" phrasing is retired — the visual says it, the copy doesn't need to).

## 9. SEO & meta
Astro SSG; pieces are real `<a>`s at build time carrying name + flavor line as sr-only text (§3.2 v2.1: nothing on the piece is readable, so the accessible layer carries all of it). Deterministic no-JS frame. `<title>`/description/canonical/OG/Twitter, JSON-LD ItemList, sitemap, robots. No analytics, no third-party runtime requests; fonts self-hosted.

## 10. Tech & repo standards
Astro latest, TypeScript strict, zero UI framework; one vanilla TS engine module; CSS custom properties for theming. `products.json` schema-validated at build (piece shape, orientation, skin path, eye cell, personality preset all config). `scripts/check-scene.ts` asserts layout invariants across seeds × viewports in `npm run build`. MIT, README with "add a product = one JSON entry (+ one skin asset)" walkthrough. Cloudflare Pages deploy (deferred until the site is right).

## 11. Asset pipeline
Produced via image-gen (see `docs/assets-brief.md`), landing in `public/skins/` and `public/icons/`:
- **Per-piece skins**: one transparent PNG per product per theme (light/dark), drawn at the piece's exact cell proportions (e.g. T = 3×2), laid under the CSS silhouette seam and bevel. Multiple candidates; final picks wired in `products.json`.
- Link-tile glyphs, favicon, og-image, NEXT crate.
- The eye, seams, bevels, the extruded side face and sparks are **code, not assets** (they animate).
- Until skins land: placeholder = accent fill + a small pixel icon badge (no letters-in-cells, no name text).
