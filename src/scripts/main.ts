/**
 * Client entry: theme persistence, the seed/scene lifecycle, and the behaviours
 * v2 added — the info panel, the eyes, the NEXT easter egg — plus the v2.2
 * round: attract mode, the sound system, the glance and the Konami downpour
 * (DESIGN §13). `?seed=` stays a silent URL capability — §13.2's visible chip
 * was cut, so nothing in the HUD reads it back.
 *
 * The DOM already contains every piece (rendered at build time from
 * DEFAULT_SEED). Nothing is created or destroyed here except the anonymous
 * stack filler and the one-shot Konami rain layer — the engine only moves
 * things, so links stay links.
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
import * as soundKit from './sound';

const root = document.documentElement;
const shell = document.getElementById('shell');
const playfield = document.getElementById('playfield');
const fillerLayer = document.getElementById('filler-layer');
const ghost = document.getElementById('ghost');
const themeToggle = document.getElementById('theme-toggle');
const reshuffleButton = document.getElementById('reshuffle');

const THEME_KEY = 'aix4u-theme';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * `event.target` is an `EventTarget`, and a keyboard event's target is only
 * *usually* an element — it is `document` itself when nothing is focused, and
 * `window` for a few synthetic paths. Casting it to `HTMLElement` and calling
 * `.closest()` therefore throws exactly where it matters least and hurts most:
 * inside the global keydown handler, which is what routes R, Enter and the
 * Konami code. Narrow once, here, instead of trusting a cast three times.
 */
function asElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

/* --- sound (DESIGN §13.4) -------------------------------------------------- */

/**
 * Sound is default **on** (v2.2, overriding §13.4's "default muted"); the
 * speaker toggle persists the choice and `createSoundSystem` arms the first
 * user gesture to wake the AudioContext, since the autoplay policy keeps it
 * parked until then. Everything below just calls the scene-named methods at the
 * frames the scenes already own.
 */
const sound = soundKit.createSoundSystem();
const soundToggle = document.getElementById('sound-toggle');

function syncSpeaker(on: boolean): void {
  soundToggle?.setAttribute('aria-pressed', String(on));
  soundToggle?.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
}

syncSpeaker(sound.enabled);
soundToggle?.addEventListener('click', () => {
  const on = sound.toggle();
  syncSpeaker(on);
  // The key press is the only sound a *mute* can make — the last thing you hear
  // on the way out, and the first thing on the way back in.
  if (on) sound.key();
});
// Another tab flipped the switch: the icon follows the ears (§13.4 v2.2.2).
sound.onEnabledChange(syncSpeaker);

/**
 * Clicking a chassis button leaves it focused, and the *next* arrow key then
 * flips the browser into keyboard modality — which lights `:focus-visible` on a
 * button the visitor stopped thinking about several seconds ago (v2.2.2, from a
 * device test: press the speaker, then an arrow, and a yellow ring appears
 * around the speaker). On this page the arrows are the Konami code and the
 * scene's own language, not chrome navigation, so a HUD button has no business
 * claiming them.
 *
 * Dropping focus on `click` removes exactly that path and nothing else: a real
 * `Tab` to the button still focuses it and still draws the ring, because Tab
 * never goes through here. Accessibility is not traded away — only the residue
 * of a pointer press is.
 *
 * The reshuffle hint is in here too: it is the same class of control (a machine
 * key that happens to live under the panel) and R is one of the keys that would
 * light it up.
 */
for (const button of document.querySelectorAll<HTMLElement>('.hud button, #reshuffle')) {
  button.addEventListener('click', () => button.blur());
}

// The timbres take any BaseAudioContext, so a dev console can render each one
// through an OfflineAudioContext and measure it (duration, peak) without a
// speaker in the loop.
if (import.meta.env.DEV) {
  (window as Window & { __soundKit?: unknown }).__soundKit = soundKit;
}

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
  // The chassis key first, then what it did: the press is the finger, the
  // flick is the theme (§13.4 + v2.2's "machine keys click too").
  sound.key();
  sound.theme(next === 'light');
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

  /**
   * Each product's rank in priority order = its note on the landing scale
   * (§13.4): rank 0 owns the top of the pentatonic, the last rank the bottom.
   * Link tiles and the egg have no rank and land silent — the egg has its own
   * jingle, and only products play the melody.
   */
  const noteRanks = new Map(content.products.map((product, index) => [product.id, index]));

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

    // The landing tap plays on the same frame the gate opens — the animationend
    // of the fall *is* the impact (§13.4: an entry cascade plays a tiny melody).
    const rank = noteRanks.get(el.dataset['piece'] ?? '');
    if (rank !== undefined) {
      el.addEventListener('animationend', (event: AnimationEvent) => {
        if (event.animationName !== 'piece-fall') return;
        sound.landing(rank, el.dataset['motion']);
      });
    }
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
    // A glance in progress owns the pupils (§13.5); the pointer gets them back
    // when the hold releases.
    if (performance.now() < glanceUntil) return;
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

  /* --- the glance (DESIGN §13.5) ------------------------------------------ */

  /**
   * The instant a product (or the egg) is activated — pointer down or Enter,
   * never mere hover — every *other* piece's pupils snap towards it, in the
   * same pixel steps all tracking uses, hold ~400ms, then release back to the
   * pointer. The hold works by timestamp rather than by class: `updateEyes`
   * simply declines to run while the glance owns the pupils.
   */
  const GLANCE_MS = 400;
  let glanceUntil = 0;

  function glanceAt(target: HTMLElement): void {
    if (reducedMotion.matches) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return;
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;
    for (const eye of eyes) {
      if (target.contains(eye)) continue; // nobody stares at themself
      const r = eye.getBoundingClientRect();
      if (r.width === 0) continue;
      const dx = tx - (r.left + r.width / 2);
      const dy = ty - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      eye.style.setProperty('--pupil-x', String(Math.round((dx / len) * PUPIL_STEPS)));
      eye.style.setProperty('--pupil-y', String(Math.round((dy / len) * PUPIL_STEPS)));
    }
    glanceUntil = performance.now() + GLANCE_MS;
    window.setTimeout(() => {
      if (performance.now() >= glanceUntil) scheduleEyes();
    }, GLANCE_MS + 20);
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

  /**
   * `quiet` is how attract mode borrows this path without borrowing its voice
   * (§13.4 v2.2.2). The blip is feedback for a *hand* — it confirms that the
   * thing under your pointer registered. During the demo there is no hand, so a
   * blip every 3.5s is the machine talking to nobody, and on a page left open it
   * is the single most annoying thing on it: a chirp from a tab you are not
   * looking at, forever, with no gesture to explain it. A shop-window display is
   * silent; the glass is what you hear nothing through. Sound belongs to the
   * visitor's hand, so the demo runs mute and every visitor-driven path — hover,
   * focus, tap — keeps the blip it always had.
   */
  function selectPiece(id: string, quiet = false): void {
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
    // A cursor move on the wall, the quietest voice in the kit (§13.4).
    if (!quiet) sound.select();
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
    if (el) activate(el);
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  /**
   * The moment of activation, wherever it comes from: the glance (§13.5) and
   * the confirm chirp (§13.4) are the same event seen by the eyes and the ears,
   * so they fire from one place rather than from every listener that can open a
   * piece. Idempotent within a frame — a pointerdown followed by the anchor's
   * own click is one activation, not two.
   */
  let lastActivated = 0;

  function activate(el: HTMLElement): void {
    const now = performance.now();
    if (now - lastActivated < 120) return;
    lastActivated = now;
    glanceAt(el);
    sound.open();
  }

  const coarse = window.matchMedia('(pointer: coarse)');

  // Activation on the *whole* field, captured: a product anchor, the egg, and
  // the keyboard's Enter on a focused piece all land here, including the paths
  // that leave the page immediately afterwards. Capture, so the glance starts
  // on the same frame the browser begins the navigation.
  for (const el of gated) {
    el.addEventListener('pointerdown', () => activate(el));
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') activate(el);
    });
  }

  for (const [id, el] of pieceElements) {
    if (!el.dataset['flavor']) continue; // link tiles carry their own name-plate

    el.addEventListener('pointerenter', () => {
      if (coarse.matches) return;
      // Landing on a piece is a deliberate act even though `pointermove` is not,
      // so it interrupts the demo before it takes the cursor for itself.
      interrupt();
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
    const target = asElement(event.target);
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
      // The idle clock for the demo starts here, not at parse time (§13.1).
      armAttract();
    }, lastOrder * STAGGER_MS + FALL_MS + SETTLE_MS);
  }

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  /* --- the NEXT mystery block ------------------------------------------- */

  let eggDropped = Boolean(session(EGG_KEY));

  // The tile ships in the static HTML so no-JS and crawlers keep the link, but
  // in the running machine it is not *there* until it has arrived (DESIGN §6.5:
  // the third reshuffle is an arrival, not a re-drop of something already in the
  // bed). Within a session the arrival sticks across reloads.
  if (egg) egg.classList.toggle('is-arrived', eggDropped);

  /**
   * The third reshuffle of a session earns the *arrival* — the tile drops out of
   * the NEXT slot with the full falling treatment, trail and squash and all
   * (DESIGN §6.5 v2.1.2), onto the perch the new scene picked for it. Once per
   * session: a gag that repeats is not a gag.
   */
  function maybeDropEgg(): void {
    if (!egg || eggDropped) return;
    const count = Number.parseInt(session(SHUFFLE_KEY) ?? '0', 10) + 1;
    rememberSession(SHUFFLE_KEY, String(count));
    if (count < 3) return;

    eggDropped = true;
    rememberSession(EGG_KEY, '1');
    // Arrival first, animation second: under reduced motion the tile still has
    // to appear — it just appears seated.
    egg.classList.add('is-arrived');
    if (reducedMotion.matches) return;
    // The riddle plays with the fall, not after it (§13.4).
    sound.egg();
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
   * Collision is by bounding box (v2.2.1): a product's skin is one PNG across
   * its whole box, so an S's notch is reserved airspace rather than a shelf.
   * The v2.1.4 per-column version slid bed cells and perched tiles into those
   * notches on every reshuffle — see `restingRow`, which still offers the
   * per-column mode for the pieces that have no skin to protect.
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
    // The lever, on the frame the handle is pulled — before any of the ride
    // that follows, and regardless of whether motion is welcome (§13.4).
    sound.lever();
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
      window.setTimeout(() => {
        squeeze(landing.el);
        // Each piece's own impact — the felt thud, lower than any entry tap.
        sound.hardDrop();
      }, landing.at);
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
    // One rising swish across the whole clear, started on the frame the light
    // starts moving and told how long it has to travel. Per-row bursts were ten
    // transients in half a second — a rattle, not a sweep (§13.4 v2.2.1).
    sound.sweep(swept.length * SCAN_ROW_MS);
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
    // The full stop at the top of the board (§13.4).
    sound.sweepEnd();

    // The motes are still flying when the last row is swept; let them land, then
    // hold the empty field for a beat — a board that clears and instantly refills
    // never reads as having been cleared.
    await wait(MOTES_MS);

    field.classList.add('is-cleared');
    for (const el of field.querySelectorAll('.is-motes')) el.classList.remove('is-motes');
    for (const el of pieceElements.values()) el.style.removeProperty('--swept');
    // The egg is a `.piece` the sweep clips like any other, but it is not in
    // `pieceElements` — leaving its `--swept` behind kept its `?` clipped away
    // for the rest of the session (the bare gray tile a device review caught).
    egg?.style.removeProperty('--swept');
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

  /* --- attract mode (DESIGN §13.1) ---------------------------------------- */

  /**
   * After ~8s of a visitor doing nothing, the machine demos itself: the cursor
   * hops piece to piece in priority order and the panel types each line, ~3.5s
   * apiece. At the end of a pass it goes quiet for another idle window and, if
   * still nobody has touched anything, runs again — indefinitely.
   *
   * That loop is a v2.2.1 reversal of §13.1's "one loop then stop". The original
   * reasoning ("a shop machine loops, a proud one shows its wares once") is a
   * nice line about a machine somebody is already watching; for a page left open
   * on a second monitor it just means the demo happened once, in the minute
   * nobody was looking. Looping with a full idle gap between passes keeps the
   * pause — the machine still stops and waits — it simply does not give up.
   *
   * Three things this had to get right, and the first two are why the original
   * pass never appeared on a real visit at all:
   *
   * 1. The idle clock cannot start at parse time. The entry cascade runs for
   *    well over a second, and the pieces are `is-inert` for all of it — a demo
   *    that opened at t+8s from parse would begin on a scene that was still
   *    arriving. It starts when the entry finishes, and again after every
   *    reshuffle's entry.
   * 2. `pointermove` is not an interaction. The pointer sitting still over a
   *    trackpad emits stray moves, and a page opened in a background tab gets a
   *    `pointermove` on the very first frame it is looked at. Only deliberate
   *    acts count: a press, a key, a wheel, a touch, a focus. That distinction
   *    is the whole difference between "never fires" and "fires on schedule".
   * 3. An interaction cancels the *current* pass instantly and re-arms the clock
   *    from zero, rather than retiring the feature for the session. A visitor who
   *    looks once and then leaves the tab open is exactly who the demo is for.
   */
  const ATTRACT_IDLE_MS = 8000;
  const ATTRACT_STEP_MS = 3500;
  let attractTimer = 0;
  let attractStep = 0;
  let attracting = false;

  /** The demo's running order: products by priority, the way the panel ranks them. */
  const attractOrder = content.products.map((product) => product.id);

  /** Leave the demo without touching the idle clock — the callers own that. */
  function stopAttract(): void {
    window.clearTimeout(attractTimer);
    attractTimer = 0;
    if (!attracting) return;
    attracting = false;
    field.classList.remove('is-attracting');
    clearSelection();
  }

  function attractTick(): void {
    if (attractStep >= attractOrder.length) {
      // End of a pass: drop the cursor and the panel, then wait out a full idle
      // window before going round again.
      stopAttract();
      armAttract();
      return;
    }
    const id = attractOrder[attractStep]!;
    attractStep += 1;
    // selectPiece drives the cursor and the panel — the demo uses the same path
    // a visitor's pointer does, so there is no second code path to keep in sync.
    // It passes `quiet`, though: the demo is a window display, not a voice.
    selectPiece(id, true);
    attractTimer = window.setTimeout(attractTick, ATTRACT_STEP_MS);
  }

  function startAttract(): void {
    if (attracting || shuffling) return;
    if (reducedMotion.matches) return; // §13.1: skipped, not merely shortened
    if (document.hidden) {
      // §13.1 pauses when the tab is hidden: re-arm rather than demo to nobody.
      armAttract();
      return;
    }
    attracting = true;
    attractStep = 0;
    field.classList.add('is-attracting');
    attractTick();
  }

  function armAttract(): void {
    window.clearTimeout(attractTimer);
    if (reducedMotion.matches) return;
    attractTimer = window.setTimeout(startAttract, ATTRACT_IDLE_MS);
  }

  /**
   * A real interaction: cancel whatever pass is running and start the idle clock
   * over. The visitor now owns the cursor; the machine waits its 8s again.
   */
  function interrupt(): void {
    stopAttract();
    armAttract();
  }

  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'] as const) {
    window.addEventListener(type, interrupt, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAttract();
    else armAttract();
  });

  /* --- the Konami downpour (DESIGN §13.6) --------------------------------- */

  /**
   * `↑↑↓↓←→←→BA`: a dozen ghost-styled tetrominoes rain through the field, pile
   * on the bed for a beat, then clear away floor-first. Once per session, pure
   * spectacle — the layer is `pointer-events: none` and sits under the product
   * pieces, so a link is a link right through the storm.
   *
   * The sequence is matched against a rolling window rather than an index, so a
   * stray key mid-code does not force the visitor to start over — `↑↑↑↓↓←→←→BA`
   * still lands, which is what anyone typing this from memory actually does.
   */
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  const konamiWindow: string[] = [];
  /**
   * Once per page *load*, in memory only. This was once-per-session via
   * sessionStorage, which outlives F5 in the same tab — on device that read
   * as "the egg broke", because the one visitor who knows the code is exactly
   * the visitor who will try it again after a reload.
   */
  let konamiSpent = false;

  /**
   * Storm dimensions (v2.2.1). The first pass rained twelve dotted outlines and
   * the device verdict was that it looked like the ambient background, not like
   * a secret: a rare egg has to be worth finding. So: twice the pieces, falling
   * faster and closer together, in solid product colours, with sparks at every
   * impact and a tremble under the whole thing. ~4.5s end to end.
   */
  const RAIN_PIECES = 26;
  const RAIN_STAGGER_MS = 110;
  const RAIN_FALL_MS = 420;
  const RAIN_HOLD_MS = 600;
  const RAIN_CLEAR_ROW_MS = 45;
  const RAIN_SPARK_MS = 320;

  /**
   * The storm's palette: the wall's own accent colours, in the theme's variant.
   * Reusing the products' accents rather than inventing a rainbow is what makes
   * the gag land — for a few seconds the machine is raining the things it sells.
   */
  function rainPalette(): string[] {
    const dark = themeName() === 'dark';
    return content.products.map((product) => (dark ? product.accentDark : product.accent));
  }

  async function konamiRain(): Promise<void> {
    if (konamiSpent || reducedMotion.matches) return;
    konamiSpent = true;

    const bp = scene.breakpoint;
    const palette = rainPalette();
    const layer = document.createElement('div');
    layer.className = 'rain-layer';
    layer.setAttribute('aria-hidden', 'true');
    // A seeded generator, so `?seed=` reproduces the storm along with the scene.
    const rng = createRandom((scene.seed ^ 0x5bf03635) >>> 0);
    const tops = [...scene.stackTops];

    const drops: { el: HTMLElement; row: number; x: number; at: number; fill: string }[] = [];
    for (let i = 0; i < RAIN_PIECES; i++) {
      const shape = GHOST_SHAPES[Math.floor(rng() * GHOST_SHAPES.length)]!;
      const x = Math.floor(rng() * Math.max(1, bp.cols - shape.width + 1));
      // `solid: false` — a storm piece is a bare tetromino with no skin across
      // its box, so it may interlock tooth against tooth, and the heap grows as
      // it fills. The product wall is the opposite case and gets the default.
      const row = settleShape(shape, x, tops, bp.rows, false);
      const fill = palette[Math.floor(rng() * palette.length)] ?? '#9dabbb';
      const el = document.createElement('div');
      el.className = 'rain-piece';
      el.style.setProperty('--gx', String(x));
      el.style.setProperty('--gy', String(row));
      el.style.setProperty('--pw', String(shape.width));
      el.style.setProperty('--ph', String(shape.height));
      el.style.setProperty('--rain-fill', fill);
      el.style.setProperty('--rain-dur', `${RAIN_FALL_MS}ms`);
      el.style.setProperty('--rain-delay', `${i * RAIN_STAGGER_MS}ms`);
      for (const [cx, cy] of shape.cells) {
        const cell = document.createElement('span');
        cell.className = 'cell';
        cell.style.setProperty('--cx', String(cx));
        cell.style.setProperty('--cy', String(cy));
        el.append(cell);
      }
      layer.append(el);
      drops.push({ el, row, x, at: i * RAIN_STAGGER_MS + RAIN_FALL_MS, fill });
    }

    field.append(layer);
    field.classList.add('is-storming');

    const stormMs = (RAIN_PIECES - 1) * RAIN_STAGGER_MS + RAIN_FALL_MS + RAIN_HOLD_MS;
    sound.rain(stormMs);

    // Each landing: a hail tap and a spray of pixel sparks at the impact point.
    for (const drop of drops) {
      window.setTimeout(() => {
        sound.hail();
        const spark = document.createElement('span');
        spark.className = 'rain-spark';
        spark.style.setProperty('--sx', String(drop.x + 0.5));
        spark.style.setProperty('--sy', String(drop.row));
        spark.style.setProperty('--rain-fill', drop.fill);
        layer.append(spark);
        window.setTimeout(() => spark.remove(), RAIN_SPARK_MS + 40);
      }, drop.at);
    }

    await wait(stormMs);

    // The finish: one white wash over the field while the pile clears floor-row
    // first, plus the sweep's own sparkle. This is what the storm was building to.
    const flash = document.createElement('span');
    flash.className = 'rain-flash';
    layer.append(flash);

    const deepest = drops.reduce((max, drop) => Math.max(max, drop.row), 0);
    for (const drop of drops) {
      drop.el.style.setProperty('--clear-delay', `${(deepest - drop.row) * RAIN_CLEAR_ROW_MS}ms`);
    }
    layer.classList.add('is-clearing');
    sound.sweep(deepest * RAIN_CLEAR_ROW_MS);
    sound.sweepEnd();

    // A last spray from every piece as its row goes, so the clear throws sparks
    // the way the landings did rather than merely fading.
    for (const drop of drops) {
      window.setTimeout(
        () => {
          const spark = document.createElement('span');
          spark.className = 'rain-spark';
          spark.style.setProperty('--sx', String(drop.x + 0.5));
          spark.style.setProperty('--sy', String(drop.row));
          spark.style.setProperty('--rain-fill', drop.fill);
          layer.append(spark);
          window.setTimeout(() => spark.remove(), RAIN_SPARK_MS + 40);
        },
        (deepest - drop.row) * RAIN_CLEAR_ROW_MS,
      );
    }

    await wait(deepest * RAIN_CLEAR_ROW_MS + 500);
    field.classList.remove('is-storming');
    layer.remove();
  }

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = asElement(event.target);
    if (target?.closest('input, textarea, [contenteditable]')) return;
    konamiWindow.push(event.key.toLowerCase());
    if (konamiWindow.length > KONAMI.length) konamiWindow.shift();
    if (konamiWindow.length === KONAMI.length && konamiWindow.every((key, i) => key === KONAMI[i])) {
      konamiWindow.length = 0;
      void konamiRain();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = asElement(event.target);
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

