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
| Pluck | **J** — vertical arm upper-right, 3-wide horizontal arm at bottom | **The subject plucked from its photo**. Brand: a coral cat lifted out of a dune snapshot (pluck.aix4u.com's own icon). Horizontal arm is the photo — warm dunes, sun (moon at night) — with a pale cat-shaped hole in its right cell; the upper-right cell is that cat, coral, floating on a transparency checkerboard (the universal "background removed" symbol). The geometry *is* the extraction: subject up, photo left behind | `#ee4b45` |
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
| J (Pluck) | Two half-lidded eyes on the lifted cat — serenely unbothered by its own extraction | Slow contented blink |
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
| J (Pluck) | Lands, then the whole piece gets tugged upward — a firmer overshoot than L's (being plucked is its story) |
| S (AHR999) | Sways ±2px horizontally while falling (the wave) |
| O (X2Markdown) | Falls straight and dumb, biggest squash on landing (the mascot) |
| I (Health Analyst) | Falls perfectly straight, steady metronome bob afterwards |

## 4. Scene model

### 4.1 Two pools
- **Floating pool** (high priority): suspended mid-air, staggered heights, the protagonists.
- **Landed pool** (low priority + link tiles): resting in the bottom stack. **(v2.1) The stack is a low bed, not a clump**: it spans ~85% of the field width, runs mostly 1–2 rows high with an occasional 3-row bump, link tiles perch on top of the bed like collectibles, filler count is modest, and its 1–2 hollow gaps + 1–2 dashed slots sit where a real game would plausibly leave them (under overhangs, not floating mid-bed).
- Overflow: floating pool caps at ~5 (or when lanes get tight); lowest priority spills into the stack. More products ⇒ prouder stack.
- Narrow (<~700px): **all products float**, stack holds only link tiles + filler.
- **(v2.2.1) Collision is by bounding box, not by silhouette.** Every product is skinned, and a skin is one PNG laid across the whole box, so an S's notch and an L's corner are *reserved airspace* — anything that slides in there ends up painted over. The static layout always knew this; the reshuffle's hard drop did not, and went on settling per-column (a v2.1.4 change made for unskinned pieces), quietly sliding bed cells and perched tiles into those notches on every R press. A device screenshot caught it; replaying the drop across six breakpoints and 300 seeds measured it at 624 of 7200 landings. `restingRow`/`settleShape` now take a `solid` flag — box collision by default, per-column for pieces with no skin to protect (the Konami storm) — and `check:scene` replays the hard drop and asserts the *post-reshuffle* frame is legal too, which is the assertion whose absence let this live.

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

- Idle state: one-line site intro — `AIX4U — indie products by kshift.`
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
5. **NEXT easter egg (v2.1.2)**: the mystery `?` is a **1×1 gray tile**, styled and placed exactly like the GitHub/X link tiles in the bed. (The v2.1.1 "real tetromino" reading was tried and reverted on device: a 3×2 dashed piece spent six cells of prime scene space on a footnote link.) It links to `https://github.com/RuochenLyu/aix4u/issues/new`. The third-reshuffle arrival stays: the tile drops from the NEXT slot once per session with the full falling treatment. **(v2.2.2) An arrival is of something that was not there**: the first implementation kept the tile in the bed from frame one and had the third reshuffle merely replay a drop in place — which on device read as "an anonymous tile is just *there*". The tile still ships in the static HTML (no-JS and crawlers keep the link), but the running machine hides it until the arrival; within a session the arrival sticks across reloads. The same review caught its `?` vanishing after any reshuffle — the line-clear's `--swept` clip was reset for every piece except the egg. In the HUD, the NEXT slot shows **a bare `?` glyph — no inner framed box** (a box inside the slot's box read as clutter).

## 7. Layout & responsiveness
- Cell `clamp(44px, 4.5vw, 72px)`; playfield max-width ~1140px, centered, full height; huge screens get ambience (grid + ghost), never stretching.
- No label-collision engine anymore (labels are gone). Floating pieces occupy seeded lanes with staggered heights; sky spans the upper ~2/3 above the real stack height.
- Narrow **(v2.1.3: one screen, no scroll)**: all-float (§4.1), and the whole machine — HUD, field, bezel — fits `100svh`; the page never scrolls. Cell size is the smaller of the width-bound and the height-bound (floor ~34px); pieces stagger in two tight columns with ~1-row gaps; the bed compresses to 1–2 rows (no three-row bump). Vertical breathing room shrinks before anything scrolls — a handheld console has exactly one screen. The narrow grid is **8 columns**, down from 9: once the field is width-bound, a column is nothing but cell size, and 8 buys a ~45px cell on a 375px phone where 9 left a band of dead sky under the HUD. The field is bottom-anchored in the stage, so whatever height is left over becomes sky rather than a gap under the floor. `svh`, not `dvh`: `dvh` grows when iOS retracts the address bar, which composes the layout for a state the visitor is not in yet. `check:scene` asserts the row count against the same budget from the other side (shortest phone, smallest cell).

## 8. Content (authoritative copy)

| Product | URL | Type · Status | Flavor line (info panel) |
|---|---|---|---|
| Meikyu | https://meikyu.app | WEB · DAILY | Deduce the daily dungeon in six tries |
| RayTally | https://raytally.com | WEB · DAILY | Glowing product ideas, collected daily |
| Pluck | https://pluck.aix4u.com | MACOS · FREE | Pluck the subject, drop the background |
| AHR999 Dataset | https://ahr999.aix4u.com | DATA · DAILY | The Bitcoin AHR999 index, as open data |
| X2Markdown | chromewebstore.google.com/detail/x2markdown/acljfllclafamkhdjjkldogcadfbigmo | CHROME · FREE | Right-click any page into clean Markdown |
| Health Analyst | https://github.com/RuochenLyu/apple-health-analyst | CLI · OSS | Apple Health reports, private and agent-ready |

Voice rules: verb-first where possible, ≤ 7 words, no "AI-powered" filler, states *what you get*.

Longer descriptions (meta/JSON-LD): unchanged from v1 —
- **Meikyu** — "Five residents are hiding in today's dungeon. You have six tries to place them." (official copy, verbatim)
- **RayTally** — A daily feed that collects the opportunities lighting up right now — watching trends and new launches, harvesting product ideas you can actually build. (Brand: fireflies = glowing opportunities; zh copy "每天收录正在发亮的机会".)
- **Pluck** — Native Mac app that lifts subjects out of photos entirely on-device — three cutout engines from instant to hair-fine, plus a scriptable CLI for agents and batch work. Free, open source, no cloud. (Official tagline: "Drop a photo. Take the subject.")
- **AHR999 Dataset** — Open dataset + dashboard for the AHR999 Bitcoin accumulation index; JSON + CSV, updated daily by CI.
- **X2Markdown** — Chrome extension converting the visible page (or selection) into clean Markdown via right-click; dedicated x.com extraction; local-only processing.
- **Health Analyst** — Two-stage CLI + agent skill: parses Apple Health exports locally into structured insights, renders narrative HTML reports with SVG charts.

Site meta: title `aix4u — products by kshift`, description "Indie products by Ruochen — daily puzzles, idea feeds, open data and developer tools. aix4u = AI for you." OG subtitle: `indie products by kshift` (the "dropping like tetrominoes" phrasing is retired — the visual says it, the copy doesn't need to).

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

## 12. v2.1.4 polish checklist (from device review)

1. **Interaction gating**: pieces are inert (`pointer-events: none`, no hover/selection cursor, excluded from tab order) from the moment a reshuffle/entry starts until they have landed; interactivity switches on per-piece at its own landing frame, not globally.
2. **Branding**: the public name is **kshift** (network ID), never the legal name — panel idle line `AIX4U — indie products by kshift.`, site meta/OG/JSON-LD author all follow. kshift.me and x.com/kshift make this a consistent entity.
3. **HUD**: logo optically centered on the bar's vertical axis; the moon toggle icon must read as a crescent moon at a glance (current one reads as a "C") — redraw as a proper pixel crescent with one or two tiny stars.
4. **Asset loading**: no loading screen. Skins are `<link rel="preload" as="image">`-ed for the current theme, and the entry animation is gated on `Promise.race(decode-all, 600ms timeout)` — pieces never fall half-textured, but a slow network degrades to accent placeholders falling on time, upgraded in place when the PNG arrives.
5. **SEO architecture (multi-subdomain)**: each subdomain owns its sitemap (`aix4u.com/sitemap-index.xml` lists only apex URLs; ahr999.aix4u.com serves its own). robots.txt carries the apex `Sitemap:` line. GSC/Bing get one **domain property** (DNS-verified) covering all subdomains. Entity linking: JSON-LD `WebSite` + `Person` (kshift, `sameAs`: kshift.me / x.com/kshift / github.com/RuochenLyu) wrapped around the existing ItemList — the page's referral job is done by real product `<a>`s, structured data and descriptive anchors, not tricks.
6. **Focus & iOS polish**: default UA focus `outline` removed everywhere and replaced by our own `:focus-visible` treatment (pieces: the selection cursor; chrome keys: bevel-hot state + 1px accent ring). `touch-action: manipulation` on interactive elements, `viewport-fit=cover` + `env(safe-area-inset-*)` padding on HUD/bezel (notch/home-bar), `theme-color` meta synced to the active theme, font smoothing left default (pixel fonts).

## 13. v2.2 — attract, share, sound (approved feature round)

### 13.1 Attract mode
**(v2.2.1)** After ~8s with no interaction, the machine demos itself: the selection cursor hops piece to piece (priority order), the panel types each line, ~3.5s per piece. After a full loop it rests ~8s and, still untouched, loops again — indefinitely (user overruled the one-loop rule on device). Any interaction cancels instantly and re-arms the 8s idle timer. Skipped under `prefers-reduced-motion`; pauses when the tab is hidden. The attract/selection cursor uses the high-visibility key-amber, never near-black.

Two implementation notes, both learned from a version that never appeared on a real visit: the idle clock starts when the **entry cascade finishes**, not at parse time (otherwise the demo opens on a scene that is still arriving, whose pieces are all `is-inert`), and `pointermove` does **not** count as an interaction — a still pointer emits stray moves, and a tab opened in the background gets one on its first painted frame. Only deliberate acts cancel it: pointerdown, keydown, wheel, touchstart, focusin — plus landing the pointer on a piece, which is deliberate even though the moves that carried it there are not.

### 13.2 Seed badge — cancelled
Cut by user decision: a visible seed chip means nothing to a visitor. `?seed=` stays as a silent URL capability (reproducibility/debugging); no UI surfaces it, and no code reads it back into the HUD. Removing the chip re-balanced the bar: the counter is centred again, and the speaker and theme keys are one right-aligned group (`.hud__keys`) so neither can ride past the chassis' rounded corner. The narrow bezel's width budget was re-measured at the same time — the content was 12px wider than its box, which is what pushed the theme key outside the moulding — and the chassis now clips as a backstop.

### 13.3 Referral params
Every product URL gets `?ref=aix4u` appended at render time (config flag per item to opt out, e.g. Chrome Web Store links where params are unwelcome). Zero scripts — measurement happens on the products' own analytics.

### 13.4 Sound system (Web Audio, synthesized, zero assets)
**(v2.2.1) Default unmuted** (localStorage opt-out via the HUD speaker); the AudioContext resumes silently on the first user gesture, which is the autoplay-policy reality of "on by default". Master gain ~0.8 — audible at normal system volume, never harsh. Hover/select blips sit around −10dB relative (−18 was inaudible on device); chrome keys (theme/speaker) click softly too. Every sound is synthesized (oscillator + noise + envelope) — no audio files. **Each scene has its own voice; no sound is reused across scenes:**

| Event | Sound sketch |
|---|---|
| Piece landing (entry) | Soft wooden tap; **each product owns one note of a pentatonic scale** (priority order = ascending), so an entry cascade plays a tiny melody; O lands with a slightly rubbery boing (its squash), I with the lowest, driest tap |
| Hard drop impact (reshuffle) | Heavier felt thud + 2px shake already in place; lower pitch than entry taps |
| Line-clear sweep | **(v2.2.1) One continuous** rising filtered-noise swish across the whole clear, ending in a short sparkle. Per-row bursts were ten transients in half a second — a rattle, not a sweep; the visual is one gesture, so the sound is one gesture |
| Reshuffle trigger (R/tap) | Mechanical lever click (two-transient snap) |
| Select (hover/focus a piece) | Short high blip, the quietest voice in the kit (~−10dB relative, revised up from −18dB — below the noise floor of a real room); no sound on plain pointer-over of chrome |
| Open (click/Enter on a product) | Bright two-note confirm chirp, then navigation |
| Theme toggle | Switch flick (short click + soft filtered pop, pitch up to dark→light, down to light→dark) |
| Egg drop (3rd reshuffle) | Small mysterious three-note jingle as the `?` falls |
| Konami rain | Low rumble bed + a hail of pitched-random taps as the pieces land |
| Chassis key press (v2.2.1) | Dry mid transient + a blunt low thock — a membrane key bottoming out. Plays *under* the theme flick and the speaker toggle: the press is the finger, the voice after it is the consequence |

Master gain 0.8, hard cap on simultaneous voices (8), everything through one compressor.

Two levelling facts, both established by rendering each timbre through an `OfflineAudioContext` and measuring it, rather than by ear:

- **The compressor, not the master gain, was why the page tested inaudible.** Every voice here is a percussive transient with a ~3ms attack, which is exactly what a compressor's attack eats: at the node's defaults a landing tap arrived 10dB below its own input, and a "gentler" −8dB/4:1 setting made it *worse* (−12dB), because a fast detector clamps the only part of a tap the ear hears. It is now a slow ceiling limiter — −3dB, 20:1, no knee, 50ms attack — transparent to single hits (−8.6dBFS against −8.4 bypassed) and leaning only on a genuine pile-up. Eight taps inside 80ms peak at −5.5dBFS with zero clipped samples, which is the safety net the cap was hired for.
- **A band-pass's output level tracks its bandwidth**, so the line-clear swish at a fixed source level ramped ~15dB across its own pitch sweep and clipped at the top. Its gain now rides the inverse ramp (`SWISH_GAIN / centre`, 500Hz → 2.8kHz), so only the pitch moves. A *continuous* burst also sustains its level in a way a 50ms one does not, which was worth a further ~9dB of trim.

The whole kit now measures inside a −6 to −18dBFS band against the landing taps' −9, with zero clipped samples anywhere — including a full reshuffle (lever + five thuds + sweep + sparkle) and a 26-piece storm.

Autoplay policy, not just iOS: default-on means the context is created before any gesture and therefore starts `suspended`, so every plausible first gesture (pointerdown, pointerover, keydown, touchstart, click) silently resumes it. The first thing a visitor *does* is already accompanied, and nothing is faked before then.

### 13.5 The glance (click reaction)
The instant a product piece is activated (pointer down / Enter), **every other piece's pupils snap to look at it** for ~400ms (pixel-stepped, like all tracking), then release. Also fires on the egg. Not on mere hover.

### 13.6 Konami easter egg
`↑↑↓↓←→←→BA` (keyboard only, desktop): a one-time "downpour".

**(v2.2.1) Escalated.** The first pass rained a dozen dotted ghost outlines and read as the ambient background rather than as a secret, which is a fair complaint about a thing this rare. It is now **26 solid keycaps in the products' own accent colours** — the gag being that the machine has started raining product — falling faster and closer together, throwing a spray of pixel sparks at every impact, under a field that trembles for the whole storm; then one white line-clear flash and a second spark-rain as the pile dissolves floor-row first. ~4.5s end to end. Pure spectacle, once per session (`sessionStorage`, like the mystery tile — a reload is not a new visit), never interferes with links: the layer is `pointer-events: none` and sits under the product pieces. The code is matched against a rolling window rather than a running index, so a stray key mid-sequence does not force a restart. The storm piles for real — each piece settles on the skyline the ones before it left behind, and *these* pieces settle per-column (`solid: false`), because a bare tetromino with no skin across its box genuinely should interlock tooth against tooth. Skipped under reduced-motion.
