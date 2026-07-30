/**
 * Client entry: theme persistence, the seed/scene lifecycle, and the three
 * behaviours v2 added — the info panel, the eyes, and the NEXT easter egg.
 *
 * The DOM already contains every piece (rendered at build time from
 * DEFAULT_SEED). Nothing is created or destroyed here except the anonymous
 * stack filler — the engine only moves things, so links stay links.
 */

import { content } from '../lib/content';
import { SHAPES, GHOST_SHAPES } from '../lib/tetromino';
import {
  buildScene,
  breakpointFor,
  createRandom,
  randomSeed,
  rollGhost,
  settleShape,
  type GhostPlacement,
  type PiecePlacement,
  type Scene,
} from '../lib/scene';

const root = document.documentElement;
const shell = document.getElementById('shell');
const playfield = document.getElementById('playfield');
const fillerLayer = document.getElementById('filler-layer');
const ghost = document.getElementById('ghost');
const themeToggle = document.getElementById('theme-toggle');
const reshuffleButton = document.getElementById('reshuffle');

const THEME_KEY = 'aix4u-theme';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* --- theme ---------------------------------------------------------------- */

/** The two chassis backgrounds, mirrored in Base.astro's first-paint script. */
const THEME_COLORS = { light: '#c9d2dd', dark: '#141519' } as const;
const themeMeta = document.querySelector('meta[name="theme-color"]');

function syncToggle(theme: string): void {
  // The browser chrome wears the machine's colour (DESIGN §12.6 v2.1.4).
  themeMeta?.setAttribute('content', THEME_COLORS[theme === 'dark' ? 'dark' : 'light']);
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

if (playfield && fillerLayer && ghost && shell) {
  const field = playfield;
  const pieceElements = new Map<string, HTMLElement>();
  for (const el of field.querySelectorAll<HTMLElement>('[data-piece]')) {
    pieceElements.set(el.dataset['piece']!, el);
  }
  const eyes = [...field.querySelectorAll<HTMLElement>('.eye')];
  const cursor = document.getElementById('cursor');
  const egg = document.getElementById('egg');

  let placements = new Map<string, PiecePlacement>();
  let shuffling = false;

  /* --- interaction gating (DESIGN §12.1 v2.1.4) --------------------------- */

  /**
   * A piece in flight is scenery: no hover, no cursor, no tab stop. The gate
   * closes on every piece the frame a reshuffle or entry starts, and each
   * piece opens its own — on the `animationend` of its entry fall, which *is*
   * its landing frame. No global timer: the pieces land 80ms apart, and a
   * timer tuned to the last one would leave the first four dead on the floor.
   */
  function setInert(el: HTMLElement, inert: boolean): void {
    el.classList.toggle('is-inert', inert);
    if (inert) el.setAttribute('tabindex', '-1');
    else el.removeAttribute('tabindex');
  }

  const gated: HTMLElement[] = [...pieceElements.values(), ...(egg ? [egg] : [])];

  for (const el of gated) {
    const release = (event: AnimationEvent): void => {
      // `piece-fall` is the entry drop; the reshuffle's `hard-drop` ends into
      // the sweep, where the piece stays scenery until the next entry.
      if (event.animationName !== 'piece-fall') return;
      setInert(el, false);
    };
    el.addEventListener('animationend', release);
    // A cancelled fall (breakpoint change mid-entry) must not strand the piece.
    el.addEventListener('animationcancel', release);
  }

  function gateAll(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.piece')) active.blur();
    for (const el of gated) setInert(el, true);
  }

  function releaseAll(): void {
    for (const el of gated) setInert(el, false);
  }

  /* --- the session ------------------------------------------------------- */

  const SHUFFLE_KEY = 'aix4u-shuffles';
  const EGG_KEY = 'aix4u-egg';

  function session(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function rememberSession(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* private mode: the session simply does not outlive the page */
    }
  }

  let scene = currentScene(readSeedFromUrl() ?? randomSeed());

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
    placements = new Map(next.pieces.map((piece) => [piece.id, piece]));
    const { breakpoint: bp } = next;
    field.dataset['seed'] = String(next.seed);
    // The grid geometry lives on the shell: it sizes the HUD and the bottom bezel
    // as well as the field (one chassis width, DESIGN §2 v2.1).
    shell!.style.setProperty('--cols', String(bp.cols));
    shell!.style.setProperty('--rows', String(bp.rows));
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
      if (el.dataset['beat'] !== 'metronome') {
        el.style.setProperty('--bob-period', `${placement.bobPeriod || 6}s`);
      }
      el.style.setProperty('--bob-delay', `${placement.bobDelay}s`);
      el.style.setProperty('--blink-period', `${placement.blinkPeriod}s`);
      el.style.setProperty('--blink-delay', `${placement.blinkDelay}s`);
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

    ghostRng = createRandom((next.seed ^ 0x9e3779b9) >>> 0);
    drawGhost(next.ghost);

    // The mystery tile is part of the world from the first frame: it finds a new
    // perch on the bed in every scene rather than waiting to be earned.
    if (egg) {
      egg.style.setProperty('--gx', String(next.egg.x));
      egg.style.setProperty('--gy', String(next.egg.y));
    }

    moveCursor();
  }

  /* --- the background ghost ---------------------------------------------- */

  /**
   * The ghost is one piece falling forever, and forever with the same silhouette
   * in the same lane read as a broken loop rather than as a game (DESIGN §6.2
   * v2.1). So every cycle draws again from the bag of seven, at a new x — off a
   * seeded generator, so `?seed=` still reproduces the whole sequence, not just
   * the first pass.
   */
  let ghostRng = createRandom(0);

  function drawGhost(roll: GhostPlacement): void {
    ghost!.style.setProperty('--gx', String(roll.x));
    ghost!.style.setProperty('--gw', String(GHOST_SHAPES[roll.shape]!.width));
    field.style.setProperty('--ghost-duration', `${roll.duration}s`);
    ghost!.replaceChildren(
      ...GHOST_SHAPES[roll.shape]!.cells.map(([cx, cy]) => {
        const span = document.createElement('span');
        span.className = 'cell';
        span.style.setProperty('--cx', String(cx));
        span.style.setProperty('--cy', String(cy));
        return span;
      }),
    );
  }

  ghost.addEventListener('animationiteration', () => {
    drawGhost(rollGhost(ghostRng, scene.breakpoint.cols));
  });

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

  /* --- eyes -------------------------------------------------------------- */

  /**
   * The pupil steps towards the pointer in whole pixel units, five positions per
   * axis. It follows the *direction*, not the distance, so a piece in the corner
   * still looks straight at you (DESIGN §3.3).
   */
  const PUPIL_STEPS = 2;
  const IDLE_SLEEP_MS = 30_000;
  let pointerX = -1;
  let pointerY = -1;
  let eyeFrame = 0;
  let sleepTimer = 0;

  function updateEyes(): void {
    eyeFrame = 0;
    if (pointerX < 0) return;
    for (const eye of eyes) {
      const rect = eye.getBoundingClientRect();
      if (rect.width === 0) continue;
      const dx = pointerX - (rect.left + rect.width / 2);
      const dy = pointerY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      eye.style.setProperty('--pupil-x', String(Math.round((dx / len) * PUPIL_STEPS)));
      eye.style.setProperty('--pupil-y', String(Math.round((dy / len) * PUPIL_STEPS)));
    }
  }

  function scheduleEyes(): void {
    if (eyeFrame || reducedMotion.matches) return;
    eyeFrame = window.requestAnimationFrame(updateEyes);
  }

  function wake(): void {
    field.classList.remove('is-asleep');
    window.clearTimeout(sleepTimer);
    if (reducedMotion.matches) return;
    sleepTimer = window.setTimeout(() => field.classList.add('is-asleep'), IDLE_SLEEP_MS);
  }

  /**
   * One piece's eye screws shut when *it* lands (DESIGN §3.3). Per piece, not per
   * field: the pieces no longer land on the same frame, so a field-wide squeeze
   * would shut five eyes for the first impact and none for the rest.
   */
  function squeeze(el: HTMLElement): void {
    if (reducedMotion.matches) return;
    el.classList.add('is-squeezing');
    window.setTimeout(() => el.classList.remove('is-squeezing'), 300);
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      wake();
      scheduleEyes();
    },
    { passive: true },
  );
  window.addEventListener('keydown', wake, { passive: true });
  window.addEventListener('scroll', scheduleEyes, { passive: true });

  /* --- info panel -------------------------------------------------------- */

  const panel = document.getElementById('panel');
  const panelText = document.getElementById('panel-text');
  const panelName = document.getElementById('panel-name');
  const panelKind = document.getElementById('panel-kind');
  const panelStatus = document.getElementById('panel-status');
  const panelOpen = document.getElementById('panel-open');
  const IDLE_LINE = content.panel.idle;
  /**
   * ~80 characters a second (DESIGN §4.4 v2.1.2). The v2 panel typed at 24, which
   * was tested on the device and read as the page lagging rather than as a
   * machine printing — and it typed the name and the tags too, so the thing you
   * most wanted to read arrived last.
   */
  const TYPE_MS = 1000 / 80;

  let selected: string | null = null;
  /** The piece a touch visitor has selected but not yet opened. */
  let armed: string | null = null;
  let typeTimer = 0;
  let typeBody = '';

  function renderTyped(count: number): void {
    if (panelText) panelText.textContent = typeBody.slice(0, Math.min(count, typeBody.length));
  }

  function finishTyping(): void {
    window.clearInterval(typeTimer);
    typeTimer = 0;
    renderTyped(typeBody.length);
    panel?.classList.remove('is-typing');
  }

  /** Only the flavour row types. Everything that identifies the piece is already up. */
  function typeOut(body: string): void {
    window.clearInterval(typeTimer);
    typeBody = body;

    if (reducedMotion.matches) {
      finishTyping();
      return;
    }
    let index = 0;
    renderTyped(0);
    panel?.classList.add('is-typing');
    typeTimer = window.setInterval(() => {
      index += 1;
      renderTyped(index);
      if (index >= typeBody.length) finishTyping();
    }, TYPE_MS);
  }

  function moveCursor(): void {
    if (!cursor) return;
    const placement = selected ? placements.get(selected) : undefined;
    if (!placement) {
      cursor.hidden = true;
      return;
    }
    const shape = SHAPES[placement.shape];
    cursor.style.setProperty('--gx', String(placement.x));
    cursor.style.setProperty('--gy', String(placement.y));
    cursor.style.setProperty('--pw', String(shape.width));
    cursor.style.setProperty('--ph', String(shape.height));
    cursor.hidden = false;
  }

  function selectPiece(id: string): void {
    const el = pieceElements.get(id);
    const flavor = el?.dataset['flavor'];
    if (!flavor) return;
    // Mid-flight pieces are scenery (DESIGN §12.1): pointer-events already
    // blocks the pointer path, and this blocks the programmatic ones.
    if (el!.classList.contains('is-inert')) return;
    // Interacting again while it is still typing skips to the end, which is what
    // an item panel in a game does when you mash the button (DESIGN §4.4).
    if (selected === id) {
      if (typeTimer) finishTyping();
      return;
    }
    selected = id;
    if (panel) panel.dataset['state'] = 'piece';
    // Row one lands whole, on the frame you select: the name and the two tags are
    // the answer to "what is this", and an answer that types itself is a delay.
    if (panelName) panelName.textContent = (el!.dataset['name'] ?? '').toUpperCase();
    if (panelKind) panelKind.textContent = el!.dataset['kind'] ?? '';
    if (panelStatus) panelStatus.textContent = el!.dataset['status'] ?? '';
    if (panelOpen) panelOpen.hidden = false;
    typeOut(flavor);
    moveCursor();
  }

  function clearSelection(): void {
    selected = null;
    armed = null;
    if (panel) panel.dataset['state'] = 'idle';
    window.clearInterval(typeTimer);
    typeTimer = 0;
    panel?.classList.remove('is-typing');
    if (panelOpen) panelOpen.hidden = true;
    typeBody = IDLE_LINE;
    renderTyped(IDLE_LINE.length);
    moveCursor();
  }

  /**
   * `⏎ OPEN` has to work from a hover, not only from a focus (DESIGN §4.4
   * v2.1.2). A focused anchor already opens itself on Enter; this is the pointer
   * case, where the panel is describing a piece the keyboard has never touched.
   */
  function openSelected(): void {
    if (!selected) return;
    const el = pieceElements.get(selected);
    const href = el?.getAttribute('href');
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  const coarse = window.matchMedia('(pointer: coarse)');

  for (const [id, el] of pieceElements) {
    if (!el.dataset['flavor']) continue; // link tiles carry their own name-plate

    el.addEventListener('pointerenter', () => {
      if (coarse.matches) return;
      selectPiece(id);
    });
    el.addEventListener('pointerleave', () => {
      if (coarse.matches) return;
      if (document.activeElement === el) return;
      clearSelection();
    });
    el.addEventListener('focus', () => selectPiece(id));
    el.addEventListener('blur', () => {
      if (coarse.matches) return;
      clearSelection();
    });

    // Touch is two-stage: the first tap selects and shows the line, the second
    // opens it — which is what `TAP AGAIN TO OPEN` in the panel is telling you.
    // Otherwise a phone visitor never gets to read the description of the thing
    // they are about to leave the page for.
    el.addEventListener('click', (event) => {
      if (!coarse.matches) return;
      if (armed === id) return;
      event.preventDefault();
      armed = id;
      selectPiece(id);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.piece, .panel')) return;
    if (selected) clearSelection();
  });

  clearSelection();

  /* --- entry & reshuffle ------------------------------------------------- */

  /** Entry timings, kept in step with the CSS (fall 560ms, +260 impact). */
  const FALL_MS = 560;
  const STAGGER_MS = 80;
  const SETTLE_MS = 420;
  let entryTimer = 0;

  function playEntry(): void {
    // Reduced motion has no falls, so nothing would ever fire the per-piece
    // release — the gate stays open there instead.
    if (reducedMotion.matches) releaseAll();
    else gateAll();
    field.classList.remove('is-entering', 'is-idle');
    void field.offsetWidth; // restart the CSS animations
    field.classList.add('is-entering', 'is-idle');

    // The entry animations are filled `both`, and a filled animation keeps
    // overriding the property forever — which would freeze the hover lift and
    // the shadow deepen. So the class comes off once the last piece has landed;
    // every animation's final frame equals the resting style, so nothing moves.
    const lastOrder = scene.pieces.reduce((max, piece) => Math.max(max, piece.order), 0);
    window.clearTimeout(entryTimer);
    entryTimer = window.setTimeout(() => {
      field.classList.remove('is-entering');
      // By now every landing frame has passed; anything still gated missed its
      // `animationend` (a hidden tab throttling the fall) and gets it here.
      releaseAll();
    }, lastOrder * STAGGER_MS + FALL_MS + SETTLE_MS);
  }

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  /* --- the NEXT mystery block ------------------------------------------- */

  let eggDropped = Boolean(session(EGG_KEY));

  /**
   * The mystery tile is in the scene the whole time. What the third reshuffle of
   * a session earns is the *arrival* — it re-drops out of the NEXT slot with the
   * full falling treatment, trail and squash and all (DESIGN §6.5 v2.1.2). Once
   * per session: a gag that repeats is not a gag.
   */
  function maybeDropEgg(): void {
    if (!egg || eggDropped) return;
    const count = Number.parseInt(session(SHUFFLE_KEY) ?? '0', 10) + 1;
    rememberSession(SHUFFLE_KEY, String(count));
    if (count < 3) return;

    eggDropped = true;
    rememberSession(EGG_KEY, '1');
    if (reducedMotion.matches) return;
    egg.classList.remove('is-dropping');
    void egg.offsetWidth; // restart the fall if one is somehow still on
    egg.classList.add('is-dropping');
  }

  /* --- reshuffle: a hard drop, then a line clear ------------------------- */

  /** A settled piece and the row its bottom ends up on. */
  interface Landing {
    el: HTMLElement;
    /** Row index of the piece's top cell after the drop. */
    row: number;
    height: number;
    /** ms until this piece hits — a function of how far it actually falls. */
    at: number;
  }

  const SCAN_ROW_MS = 40; // ~2 frames a row (DESIGN §6.3)
  /** Beats around the sweep, tuned so the whole reshuffle lands near 2s. */
  const IMPACT_SETTLE_MS = 420;
  const MOTES_MS = 360;
  const EMPTY_MS = 150;
  const DROP_MAX_MS = 620;
  const DROP_MIN_MS = 170;

  /**
   * Where every floating piece truly comes to rest, and how long it takes to get
   * there (DESIGN §6.3 v2.1).
   *
   * The skyline starts as the stack's own profile and grows as pieces settle into
   * it, so a piece over a gap falls all the way to the floor, a piece over the bed
   * stops on the bed, and a piece over another piece stops on *that* — computed in
   * bottom-up order, because the lower piece has to have landed before the one
   * above it can know where the floor is. Fall time goes with the square root of
   * the distance, which is what gravity does and what makes the impacts arrive
   * ragged instead of in chorus.
   *
   * Collision is per-column (v2.1.4): `settleShape` measures every column of
   * the piece against every column of the skyline, so a T slots its stem into
   * a notch and an S bites into an uneven bed instead of perching its bounding
   * box on the highest shoulder.
   */
  function planDrops(cell: number): Landing[] {
    const bp = scene.breakpoint;
    const tops = [...scene.stackTops];
    const falling = scene.pieces
      .filter((piece) => piece.pool === 'floating')
      .sort((a, b) => b.y - a.y);

    const plans: { placement: PiecePlacement; el: HTMLElement; row: number; cells: number }[] = [];
    let deepest = 0;
    for (const placement of falling) {
      const el = pieceElements.get(placement.id);
      if (!el) continue;
      const row = settleShape(SHAPES[placement.shape], placement.x, tops, bp.rows);
      const cells = Math.max(0, row - placement.y);
      deepest = Math.max(deepest, cells);
      plans.push({ placement, el, row, cells });
    }

    return plans.map(({ placement, el, row, cells }) => {
      const at =
        deepest === 0 ? DROP_MIN_MS : Math.round(Math.max(DROP_MIN_MS, DROP_MAX_MS * Math.sqrt(cells / deepest)));
      el.style.setProperty('--hard-drop', `${cells * cell}px`);
      el.style.setProperty('--hard-drop-dur', `${at}ms`);
      return { el, row, height: SHAPES[placement.shape].height, at };
    });
  }

  /**
   * Group everything the sweep can dissolve by the row it occupies: the settled
   * pieces' cells, the stack filler, and the mystery block if it has dropped.
   * Cells carry their own row offset within the piece, so a two-row piece is in
   * two buckets and comes apart one row at a time.
   */
  function rowContents(landings: readonly Landing[]): Map<number, HTMLElement[]> {
    const rows = new Map<number, HTMLElement[]>();
    const push = (row: number, el: HTMLElement): void => {
      const list = rows.get(row);
      if (list) list.push(el);
      else rows.set(row, [el]);
    };

    for (const { el, row } of landings) {
      for (const cell of el.querySelectorAll<HTMLElement>('.cell')) {
        push(row + Number(cell.dataset['cy'] ?? 0), cell);
      }
    }
    for (const placement of scene.pieces) {
      if (placement.pool !== 'landed') continue;
      const el = pieceElements.get(placement.id);
      if (!el) continue;
      for (const cell of el.querySelectorAll<HTMLElement>('.cell')) {
        push(placement.y + Number(cell.dataset['cy'] ?? 0), cell);
      }
    }
    // The filler layer is rebuilt from the scene on every apply, so its children
    // are in the scene's own filler order.
    scene.filler.forEach((cell, index) => {
      const el = fillerLayer!.children[index] as HTMLElement | undefined;
      if (el) push(cell.y, el);
    });
    if (egg) {
      const top = Number(egg.style.getPropertyValue('--gy') || 0);
      for (const cell of egg.querySelectorAll<HTMLElement>('.cell')) {
        push(top + Number(cell.dataset['cy'] ?? 0), cell);
      }
    }

    return rows;
  }

  /**
   * Hard drop → line clear → new seed → entry again (DESIGN §6.3 v2.1, ~2s).
   *
   * The v2 version dropped every piece to one fixed height, blinked the whole
   * bottom of the field, and faded everything out. All three readings were wrong:
   * pieces stopped in mid-air at a line the stack no longer reached, the blink
   * said "something happened here" rather than "these rows cleared", and a
   * cross-fade is not how a game removes a row.
   */
  async function reshuffle(): Promise<void> {
    if (shuffling) return;
    const seed = randomSeed();
    writeSeedToUrl(seed);
    clearSelection();

    if (reducedMotion.matches) {
      applyScene(currentScene(seed));
      maybeDropEgg();
      return;
    }

    shuffling = true;
    // Every piece goes inert for the whole ride — hard drop, sweep, re-entry —
    // and comes back one by one on the next entry's landing frames (§12.1).
    gateAll();
    const cell = field.clientHeight / scene.breakpoint.rows;
    const landings = planDrops(cell);

    window.clearTimeout(entryTimer);
    field.classList.remove('is-entering', 'is-idle');
    field.classList.add('is-clearing');

    // Every piece is released now and arrives on its own frame; each one's eye
    // shuts as it lands, and the machine takes the hit on the first impact.
    const impacts = [...landings].sort((a, b) => a.at - b.at);
    for (const landing of impacts) {
      window.setTimeout(() => squeeze(landing.el), landing.at);
    }
    const first = impacts[0]?.at ?? DROP_MIN_MS;
    const last = impacts[impacts.length - 1]?.at ?? DROP_MIN_MS;
    window.setTimeout(() => {
      field.classList.add('is-shaking');
      window.setTimeout(() => field.classList.remove('is-shaking'), 190);
    }, first);

    // Let the last piece settle and squash before the light comes through.
    await wait(last + IMPACT_SETTLE_MS);

    // The sweep: bottom row up, a row every couple of frames. Each row's cells
    // crumble into motes, and each piece's skin is clipped away as its rows go.
    const rows = rowContents(landings);
    // Every row from the floor to the top of the settled pile, not only the ones
    // holding blocks: the light crosses the field, and skipping the gaps would
    // make it jump.
    const occupied = [...rows.keys()];
    const swept: number[] = [];
    for (let row = Math.max(...occupied); row >= Math.min(...occupied); row--) swept.push(row);
    const bottoms = new Map<HTMLElement, number>();
    for (const { el, row, height } of landings) bottoms.set(el, row + height - 1);
    for (const placement of scene.pieces) {
      if (placement.pool !== 'landed') continue;
      const el = pieceElements.get(placement.id);
      if (el) bottoms.set(el, placement.y + SHAPES[placement.shape].height - 1);
    }
    // The mystery tile is a `.piece` like any other now, so it needs its bottom
    // row on record too — without it the sweep would take its cell and leave the
    // `?` behind, which is the exact orphan this pass exists to kill.
    if (egg) bottoms.set(egg, Number(egg.style.getPropertyValue('--gy') || 0));

    field.classList.add('is-scanning');
    for (const row of swept) {
      field.style.setProperty('--scan-row', String(row));
      for (const el of rows.get(row) ?? []) {
        el.classList.add('is-motes');
        const piece = el.closest<HTMLElement>('.piece');
        const bottom = piece ? bottoms.get(piece) : undefined;
        if (piece && bottom !== undefined) piece.style.setProperty('--swept', String(bottom - row + 1));
      }
      await wait(SCAN_ROW_MS);
    }
    field.classList.remove('is-scanning');

    // The motes are still flying when the last row is swept; let them land, then
    // hold the empty field for a beat — a board that clears and instantly refills
    // never reads as having been cleared.
    await wait(MOTES_MS);

    field.classList.add('is-cleared');
    for (const el of field.querySelectorAll('.is-motes')) el.classList.remove('is-motes');
    for (const el of pieceElements.values()) el.style.removeProperty('--swept');
    field.classList.remove('is-clearing');
    applyScene(currentScene(seed));
    await wait(EMPTY_MS);

    field.classList.remove('is-cleared');
    alignAmbience();
    playEntry();
    shuffling = false;
    maybeDropEgg();
  }

  /* --- skins: the decode gate (DESIGN §12.4 v2.1.4) ----------------------- */

  /**
   * No loading screen — the entry *is* the loading screen's job. The first
   * entry waits on every current-theme skin decoding, capped at 600ms: on a
   * fast network the pieces fall fully dressed, and on a slow one they fall on
   * time as accent placeholders and each one puts its skin on the moment its
   * PNG arrives (`decode()` resolving re-adds `piece--skinned`, so the swap is
   * atomic — never a half-painted texture). A PNG that outright fails stays a
   * placeholder: `piece--skinned` without an image is an empty frame.
   */
  const SKIN_GATE_MS = 600;

  function themeName(): 'light' | 'dark' {
    return root.dataset['theme'] === 'dark' ? 'dark' : 'light';
  }

  function prefetchSkins(theme: 'light' | 'dark'): void {
    for (const product of content.products) {
      const url = product.skin[theme];
      if (url) new Image().src = url;
    }
  }

  async function gateEntryOnSkins(): Promise<void> {
    const theme = themeName();
    const pending: { el: HTMLElement; done: boolean; promise: Promise<void> }[] = [];
    for (const product of content.products) {
      const url = product.skin[theme];
      const el = pieceElements.get(product.id);
      if (!url || !el) continue;
      const img = new Image();
      img.src = url;
      // decode() is the flicker-proof signal, but a hidden tab (opened in the
      // background, the common cmd-click) defers decode work indefinitely and
      // can reject it spuriously — so it races the plain load event, and a
      // fetched bitmap counts as success either way. Only a fetch that truly
      // failed keeps the accent placeholder.
      const loaded = new Promise<boolean>((resolve) => {
        const settle = (): void => resolve(img.naturalWidth > 0);
        if (img.complete) settle();
        else {
          img.addEventListener('load', settle, { once: true });
          img.addEventListener('error', settle, { once: true });
        }
      });
      const decoded = img.decode().then(
        () => true,
        () => img.naturalWidth > 0,
      );
      const entry = { el, done: false, promise: Promise.resolve() };
      entry.promise = Promise.race([decoded, loaded]).then((ok) => {
        entry.done = true;
        el.classList.toggle('piece--skinned', ok);
      });
      pending.push(entry);
    }
    if (pending.length === 0) return;
    await Promise.race([Promise.all(pending.map((entry) => entry.promise)), wait(SKIN_GATE_MS)]);
    // Whatever is still in flight falls as its accent placeholder, on time.
    for (const entry of pending) {
      if (!entry.done) entry.el.classList.remove('piece--skinned');
    }
  }

  // The other theme's skins are fetched when the machine is idle, so the first
  // toggle does not flash five naked pieces (§12.4).
  function prefetchIdle(): void {
    const other = themeName() === 'dark' ? 'light' : 'dark';
    // Safari still has no requestIdleCallback; a late timeout is idle enough.
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => prefetchSkins(other));
    else window.setTimeout(() => prefetchSkins(other), 1500);
  }

  themeToggle?.addEventListener('click', prefetchIdle);

  /* --- boot --------------------------------------------------------------- */

  applyScene(scene);
  alignAmbience();
  wake();
  void (async () => {
    await gateEntryOnSkins();
    field.classList.add('is-ready');
    playEntry();
    prefetchIdle();
  })();

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;

    if (event.key === 'Enter') {
      // A focused piece opens itself; this is the hover case the legend promises.
      if (!selected || target?.closest('.piece, .panel__hint')) return;
      event.preventDefault();
      openSelected();
      return;
    }
    if (event.key !== 'r' && event.key !== 'R') return;
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
      moveCursor();
    }, 180);
  });
}
