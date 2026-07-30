/**
 * Client entry: theme persistence plus the seed/scene lifecycle.
 *
 * The DOM already contains every piece (rendered at build time from
 * DEFAULT_SEED). Nothing is created or destroyed here except the anonymous
 * stack filler — the engine only moves things, so links stay links.
 */

import { content } from '../lib/content';
import { SHAPES } from '../lib/tetromino';
import { buildScene, breakpointFor, crossDirection, randomSeed, type Scene } from '../lib/scene';

const root = document.documentElement;
const playfield = document.getElementById('playfield');
const fillerLayer = document.getElementById('filler-layer');
const ghost = document.getElementById('ghost');
const themeToggle = document.getElementById('theme-toggle');
const reshuffleButton = document.getElementById('reshuffle');

const THEME_KEY = 'aix4u-theme';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* --- theme ---------------------------------------------------------------- */

function syncToggle(theme: string): void {
  if (!themeToggle) return;
  const dark = theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

syncToggle(root.dataset['theme'] ?? 'light');

themeToggle?.addEventListener('click', () => {
  const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
  root.dataset['theme'] = next;
  syncToggle(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private mode: the choice simply does not persist */
  }
});

/* --- scene ---------------------------------------------------------------- */

if (playfield && fillerLayer && ghost) {
  const pieceElements = new Map<string, HTMLElement>();
  const labelElements = new Map<string, HTMLElement>();
  for (const el of playfield.querySelectorAll<HTMLElement>('[data-piece]')) {
    pieceElements.set(el.dataset['piece']!, el);
  }
  for (const el of playfield.querySelectorAll<HTMLElement>('[data-label]')) {
    labelElements.set(el.dataset['label']!, el);
  }

  const field = playfield;
  let scene = currentScene(readSeedFromUrl() ?? randomSeed());
  let shuffling = false;

  function currentScene(seed: number): Scene {
    return buildScene(seed, window.innerWidth, content.items);
  }

  function readSeedFromUrl(): number | null {
    const raw = new URL(window.location.href).searchParams.get('seed');
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function writeSeedToUrl(seed: number): void {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    history.replaceState(null, '', url);
  }

  function applyScene(next: Scene): void {
    scene = next;
    const { breakpoint: bp } = next;
    field.dataset['seed'] = String(next.seed);
    field.style.setProperty('--cols', String(bp.cols));
    field.style.setProperty('--rows', String(bp.rows));
    field.style.setProperty('--stack-rows', String(bp.stackRows));
    field.style.setProperty('--ghost-duration', `${next.ghost.duration}s`);
    field.style.setProperty('--ghost-delay', `${next.ghost.delay}s`);

    for (const placement of next.pieces) {
      const el = pieceElements.get(placement.id);
      if (!el) continue;
      const shape = SHAPES[placement.shape];
      el.dataset['pool'] = placement.pool;
      el.classList.toggle('piece--floating', placement.pool === 'floating');
      el.classList.toggle('piece--landed', placement.pool === 'landed');
      el.style.setProperty('--gx', String(placement.x));
      el.style.setProperty('--gy', String(placement.y));
      el.style.setProperty('--pw', String(shape.width));
      el.style.setProperty('--ph', String(shape.height));
      el.style.setProperty('--order', String(placement.order));
      el.style.setProperty('--fall-delay', `${placement.order * 80}ms`);
      el.style.setProperty('--bob-period', `${placement.bobPeriod || 6}s`);
      el.style.setProperty('--bob-delay', `${placement.bobDelay}s`);

      const label = labelElements.get(placement.id);
      if (!label || !placement.label) continue;
      label.dataset['side'] = placement.label.side;
      label.dataset['cross'] = crossDirection(placement.label.cross);
      label.dataset['connected'] = String(placement.label.connected);
      label.classList.toggle('label--compact', placement.label.compact);
      label.style.setProperty('--gx', String(placement.label.x));
      label.style.setProperty('--gy', String(placement.label.y));
      label.style.setProperty('--lw', String(placement.label.w));
      label.style.setProperty('--lh', String(placement.label.h));
      label.style.setProperty('--leader', String(placement.label.leader));
      label.style.setProperty('--cross', String(placement.label.crossAbs));
      label.style.setProperty('--fall-delay', `${placement.order * 80}ms`);
    }

    fillerLayer!.replaceChildren(
      ...next.filler.map((cell) => {
        const span = document.createElement('span');
        span.className = cell.empty ? 'filler filler--empty' : 'filler';
        span.dataset['tone'] = String(cell.tone);
        span.style.setProperty('--gx', String(cell.x));
        span.style.setProperty('--gy', String(cell.y));
        return span;
      }),
    );

    const ghostShape = SHAPES[next.ghost.shape];
    ghost!.style.setProperty('--gx', String(next.ghost.x));
    ghost!.replaceChildren(
      ...ghostShape.cells.map(([cx, cy]) => {
        const span = document.createElement('span');
        span.className = 'cell';
        span.style.setProperty('--cx', String(cx));
        span.style.setProperty('--cy', String(cy));
        return span;
      }),
    );
  }

  /**
   * Hand the background lattice the playfield's real cell size and origin, so
   * one continuous grid runs across the whole page. Drawing the grid inside the
   * field instead made the field read as a rectangle of denser hatching — an
   * outline nobody asked for.
   */
  function alignAmbience(): void {
    const rect = field.getBoundingClientRect();
    if (rect.width === 0) return;
    const cell = rect.width / scene.breakpoint.cols;
    const period = cell * 4; // the coarse lines; the fine ones divide into it
    root.style.setProperty('--ambient-cell', `${cell}px`);
    root.style.setProperty('--ambient-x', `${rect.left % period}px`);
    root.style.setProperty('--ambient-y', `${(rect.top + window.scrollY) % period}px`);
  }

  /** Entry timings, kept in step with the CSS (fall 560ms, +260 impact, +370 card). */
  const FALL_MS = 560;
  const STAGGER_MS = 80;
  const SETTLE_MS = 420;
  let entryTimer = 0;

  function playEntry(): void {
    field.classList.remove('is-entering', 'is-idle');
    void field.offsetWidth; // restart the CSS animations
    field.classList.add('is-entering', 'is-idle');

    // The entry animations are filled `both`, and a filled animation keeps
    // overriding the property forever — which would freeze the hover lift and
    // the shadow deepen. So the class comes off once the last card has landed;
    // every animation's final frame equals the resting style, so nothing moves.
    const lastOrder = scene.pieces.reduce((max, piece) => Math.max(max, piece.order), 0);
    window.clearTimeout(entryTimer);
    entryTimer = window.setTimeout(
      () => field.classList.remove('is-entering'),
      lastOrder * STAGGER_MS + FALL_MS + SETTLE_MS,
    );
  }

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  /** Hard drop → line-clear flash → new seed → the entry animation again. */
  async function reshuffle(): Promise<void> {
    if (shuffling) return;
    const seed = randomSeed();
    writeSeedToUrl(seed);

    if (reducedMotion.matches) {
      applyScene(currentScene(seed));
      return;
    }

    shuffling = true;
    const cell = field.clientHeight / scene.breakpoint.rows;
    const floor = scene.breakpoint.rows - scene.breakpoint.stackRows;
    let lastOrder = 0;
    for (const placement of scene.pieces) {
      if (placement.pool !== 'floating') continue;
      const el = pieceElements.get(placement.id);
      if (!el) continue;
      const shape = SHAPES[placement.shape];
      const drop = Math.max(0, (floor - placement.y - shape.height) * cell);
      el.style.setProperty('--hard-drop', `${drop}px`);
      lastOrder = Math.max(lastOrder, placement.order);
    }

    window.clearTimeout(entryTimer);
    field.classList.remove('is-entering', 'is-idle');
    field.classList.add('is-clearing');

    // The first piece hits the stack 260ms in; the field takes the hit with it.
    await wait(240);
    field.classList.add('is-shaking');
    await wait(200);
    field.classList.remove('is-shaking');
    await wait(Math.max(0, lastOrder * 40 - 180));

    field.classList.add('is-flashing');
    await wait(400);

    field.classList.add('is-cleared');
    field.classList.remove('is-clearing', 'is-flashing');
    applyScene(currentScene(seed));
    await wait(60);

    field.classList.remove('is-cleared');
    alignAmbience();
    playEntry();
    shuffling = false;
  }

  applyScene(scene);
  field.classList.add('is-ready');
  alignAmbience();
  playEntry();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'r' && event.key !== 'R') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    void reshuffle();
  });

  reshuffleButton?.addEventListener('click', () => void reshuffle());

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (shuffling) return;
      if (breakpointFor(window.innerWidth).name !== scene.breakpoint.name) {
        applyScene(currentScene(scene.seed));
      }
      // The cell size tracks the viewport even inside one breakpoint, so the
      // lattice has to be re-measured on every resize, not just on a reflow.
      alignAmbience();
    }, 180);
  });
}
