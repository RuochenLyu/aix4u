# aix4u.com — Design Document

The homepage of aix4u.com is a product portfolio built as a **frozen frame of an ongoing Tetris game** ("Mid-game" concept). Every product is a real tetromino piece. Shipping a new product means a new piece drops into the world.

This document is the single source of truth for design decisions. Implementation must follow it; changes to the design go through this file first.

## 1. Concept & non-goals

- The page reads, at first glance, as **a Tetris game in progress**: an airy playfield, a few pieces resting on an uneven stack at the bottom, other pieces suspended mid-fall.
- Breathing room is a feature. Most of the playfield is empty grid. Never pack pieces into a tight wall (that reads as a cartridge shelf, which we explicitly rejected).
- Motion conveys "the game is still being played": pieces fall in on load, idle-float afterwards, and a ghost piece drifts forever in the background.
- **Non-goals**: no warm-paper/cream backgrounds (rejected as template aesthetics), no playable Tetris, no CMS — the config file is the CMS.

## 2. Visual language

Pixel/retro handheld-console aesthetic. Cute but gender-neutral.

### Light mode ("TV gray")
- Background: pale gray-blue TV gray (reference `#c9d2dd` ± tuning), overlaid with a **very faint pixel grid** matching the cell size.
- Pieces: saturated brand colors, thick near-black outlines (`~#22242a`), visible inner seams between the 4 cells, hard pixel drop-shadows (offset steps, no blur).
- Optional: extremely subtle CRT scanline overlay (must stay below "instagram filter" visibility).

### Dark mode ("backlit console")
- Not an inversion — the metaphor is a handheld console with the backlight on at night.
- Background: deep charcoal (`~#141519`), faint darker grid.
- Pieces: brighter/glowing variants of their accent colors, warm off-white outlines (`~#f3ecdb`), a soft glow (box-shadow) around each piece.
- Theme resolution: `prefers-color-scheme` default → manual toggle persisted in `localStorage` → inline `<head>` script applies the class before first paint (no FOUC).

### Typography
- HUD / product names / labels: a pixel display font (Silkscreen or similar, subset).
- Taglines / body: a monospace font (IBM Plex Mono or system mono fallback).
- English only. No i18n infrastructure.

## 3. Scene model

### 3.1 Pieces

Each product is one tetromino defined in `src/data/products.json`:

| Product | Shape | Accent (light) | Priority |
|---|---|---|---|
| Meikyu | T | `#e8a33d` | 1 |
| RayTally | L | `#d9f24e` | 2 |
| AHR999 Dataset | S | `#f59e0b` | 3 |
| X2Markdown | O | `#20b8c8` | 4 |
| Health Analyst | I | `#3fae5a` | 5 |

- A piece = 4 chunky square cells. One designated cell holds the product's pixel icon (asset placeholder for now — plain colored cell with the product's initial letter until real pixel art lands).
- The whole piece is a single `<a href>` to the product URL (real link in static HTML — SEO/a11y non-negotiable).
- Next to each piece floats a **label card**: pale card, thin border, product name (pixel font) + one-line tagline (mono font), connected to the piece by a 1px stepped "pixel leader line". Text never goes inside the piece.

### 3.2 Two pools

The layout engine assigns every piece to one of two pools:

- **Floating pool** (high priority): suspended mid-air, each in its own vertical *lane*; staggered heights; these are the visual protagonists.
- **Landed pool** (low priority + link tiles): resting on an uneven stack at the bottom. The stack must contain 1–2 hollow gaps (real Tetris stacks have holes). Landed product pieces get a compact label (name only, tagline on hover).

Overflow rule: if the floating pool would exceed ~5 pieces (or lanes get too narrow on the current viewport), lowest-priority pieces spill into the stack. More products ⇒ a taller, prouder stack — never a cramped sky.

### 3.3 Link tiles & widgets

Plain 1×1 gray tiles living in the landed stack, visually quieter than product pieces (thinner outline, muted fill):

- GitHub → `https://github.com/RuochenLyu`
- kshift.me → `https://kshift.me`
- X → `https://x.com/kshift`

Also configured in the JSON (`type: "link"`), so adding/removing is config-only.

### 3.4 HUD

Slim top bar, game-HUD style:

- Pixel logo `AIX4U` (links to `/`, i.e. itself — it's the home).
- `PRODUCTS 05` counter (derived from config length, seven-segment / pixel digits).
- `NEXT` slot: a small frame holding a translucent question-mark block. Configurable via JSON (`next: { teaser: "..." }`) to tease an upcoming product; empty teaser renders the mystery block.
- Sun/moon theme toggle (accessible button, `aria-pressed`).

Footer hint: `press R to reshuffle` (desktop) / `tap to reshuffle` (coarse pointers, the hint itself is the tap target).

## 4. Randomness

One integer **seed** drives the entire composition (lane order, floating heights, stack arrangement, ghost piece path). PRNG is a small deterministic hash (mulberry32 or the GLSL-style `sin` hash) — same seed, same scene, always.

- New visit → random seed.
- `R` / tap → new seed, replayed through the reshuffle animation.
- `?seed=<n>` URL param reproduces a scene exactly (debugging + shareable easter egg). The current seed is written to the URL via `history.replaceState` after each shuffle.

## 5. Animation

All motion is **quantized, not smooth** — the Tetris feel is stepped.

1. **Entry (~1.2 s total)**: pieces fall from above the viewport to their targets using stepped easing (`steps(n)` or rAF snapping to grid rows), stagger 80–120 ms, landed pieces first. Landing = 1px settle-bounce. Label cards fade in 150 ms after their piece stops, leader line "grows" in pixel steps.
2. **Idle**: floating pieces bob ±2–3 px, each with a different period/phase (pure CSS). A **ghost piece** (very low-contrast outline) falls slowly through the background forever: reaches the stack, vanishes, respawns at the top elsewhere.
3. **Reshuffle (~1.5 s)**: floating pieces hard-drop onto the stack → full-stack **line-clear flash** (two-frame blink) → everything gone → new seed → entry replays. Vanishing has an in-game reason (line clear), never an unexplained fade.
4. **`prefers-reduced-motion`**: skip entry and reshuffle animations (jump to final state), ghost piece static, no bobbing.

Implementation constraints: DOM pieces animated via `transform`/`opacity` only; no canvas for content (canvas allowed for the background grid/ghost if simpler, since it's decorative).

## 6. Layout & responsiveness

- Cell size: `clamp(44px, 4.5vw, 72px)` (tune visually). Playfield: fixed max width (~1140 px), centered, full viewport height.
- On huge/ultrawide screens the playfield does **not** stretch; side areas show the faint grid + ghost piece ambience ("arcade screen" principle).
- Narrow (<~700 px): **all products float** — the landed pool holds only link tiles + filler. Vertical space is abundant on phones; pieces stagger vertically across alternating left/right positions, each label card placed directly above/below its own piece. Rationale: with a crowded stack, landed-product labels ended up distant from their pieces and read as labeling the wrong piece — mislabeling is worse than a taller page.
- Mobile: stack condenses, HUD condenses (`AIX4U · 05 · NEXT`), reshuffle via tapping the hint.
- Label collision: engine alternates label side (left/right) and nudges vertically; labels never overlap pieces or each other.
- Label association is a hard constraint too: a card must be either **touching-adjacent** to its piece or **leader-connected**. A distant card with no leader is forbidden — it reads as labeling whichever piece it happens to sit near. Degrade ladder: full card → name-only card → adjacent name-only; never leaderless-distant.

## 7. Content (authoritative copy)

| Product | URL | Tagline (label card) |
|---|---|---|
| Meikyu | https://meikyu.app | A daily dungeon deduction puzzle |
| RayTally | https://raytally.com | Daily product ideas mined from search-trend shifts |
| AHR999 Dataset | https://ahr999.aix4u.com | Open, daily-updated Bitcoin AHR999 index data |
| X2Markdown | https://chromewebstore.google.com/detail/x2markdown/acljfllclafamkhdjjkldogcadfbigmo | Any webpage → clean Markdown, one right-click |
| Health Analyst | https://github.com/RuochenLyu/apple-health-analyst | Privacy-first Apple Health reports, built for AI agents |

Longer descriptions (used in meta/JSON-LD, and available for a future detail view):

- **Meikyu** — "Five residents are hiding in today's dungeon. You have six tries to place them." (official copy, quote verbatim)
- **RayTally** — A daily brainstorm feed that mines verifiable search-trend shifts for product ideas.
- **AHR999 Dataset** — Open dataset + dashboard for the AHR999 Bitcoin accumulation index; JSON + CSV, updated daily by CI.
- **X2Markdown** — Chrome extension that converts the visible page (or selection) into clean Markdown via right-click; dedicated extraction for x.com posts and articles; local-only processing.
- **Health Analyst** — Two-stage CLI + agent skill: parses Apple Health exports locally into structured insights, then renders narrative HTML reports with SVG charts.

Site meta: title `aix4u — products by Ruochen`, description along the lines of "An indie developer's products, dropping like tetrominoes. AI for you."

## 8. SEO & meta

- Astro SSG: everything above the fold is real HTML at build time; the engine only *positions* elements client-side. With JS disabled the page must still show all products as a readable list (a `<noscript>`-friendly static arrangement: pieces render at deterministic default positions via CSS).
- Per-page: `<title>`, meta description, canonical, OG + Twitter card (og-image placeholder for now), `JSON-LD ItemList` of the products, `sitemap.xml`, `robots.txt`.

## 9. Tech & repo standards

- **Astro** (latest), TypeScript, zero UI framework — one vanilla TS module for the engine (~200–300 lines), CSS custom properties for theming.
- `src/data/products.json` validated at build time (zod or hand-rolled assert) — a bad entry fails the build, not production.
- Repo: MIT `LICENSE`, `README.md` (concept, screenshot placeholder, **"add a product = edit one JSON entry" walkthrough**, dev commands, deploy notes for Cloudflare Pages), `.gitignore`, `.editorconfig`.
- CI-free by design: Cloudflare Pages builds on push (`npm run build`, output `dist/`).
- No analytics, no cookies, no external requests except self-hosted/subset fonts.

## 10. Asset pipeline (deferred)

Pixel icons per product, og-image, favicon are produced separately (image-gen) and land in `public/icons/`. Until then: placeholder cells with the product initial. Favicon placeholder: a single tetromino pixel glyph generated as inline SVG.
