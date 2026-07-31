/**
 * The sound system (DESIGN §13.4): every sound on the page is synthesized here —
 * oscillators, filtered noise, envelopes — zero audio files. Each scene has its
 * own voice and no sound is reused across scenes; the timbre functions below are
 * one small graph each, exported individually so they can be rendered through an
 * OfflineAudioContext and inspected.
 *
 * The chain is: voice → master gain → one DynamicsCompressor → destination. The
 * compressor is the safety net for the cascades (five landing taps inside a
 * second), and the voice cap (8) is the safety net for the compressor.
 *
 * v2.2 revision, from a device test: sound is **default on**, not default muted,
 * and the master sits at 0.8 rather than 0.5 — at 0.5 the page was inaudible at
 * a normal system volume, which made a default-on machine indistinguishable
 * from a broken one. Autoplay policy still forbids audio before a gesture, so
 * `armResume` below arms every plausible first gesture (pointer, key, touch)
 * and wakes the context silently on whichever one arrives first.
 */

type Ctx = BaseAudioContext;

/**
 * A timbre: builds its whole graph against `out` starting at `when`, returns the
 * time it falls silent. Taking the context as a parameter is what lets the same
 * function play live and render offline for verification.
 */
export type Timbre = (ctx: Ctx, out: AudioNode, when: number) => number;

/* --- shared building blocks ----------------------------------------------- */

/** One second of white noise per context, minted once — sources are cheap, buffers are not. */
const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

interface ToneSpec {
  type: OscillatorType;
  /** Start frequency in Hz — and the whole story, unless `glide` bends it. */
  freq: number;
  /** Where the pitch ends up (exponential ramp across the decay). */
  glide?: number;
  /** Peak linear gain of this voice, pre-master. */
  peak: number;
  /** Seconds to the peak. Percussive voices keep the default near-zero. */
  attack?: number;
  /** Seconds from peak to silence, exponential — how struck things ring out. */
  decay: number;
}

/** One enveloped oscillator — the percussive backbone of every pitched voice. */
function tone(ctx: Ctx, out: AudioNode, when: number, spec: ToneSpec): number {
  const attack = spec.attack ?? 0.003;
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, when);
  if (spec.glide !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.glide), when + attack + spec.decay);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(spec.peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + spec.decay);
  osc.connect(gain).connect(out);
  const end = when + attack + spec.decay + 0.02;
  osc.start(when);
  osc.stop(end);
  return end;
}

interface HissSpec {
  /** The filter is what makes noise a material: highpass = contact, lowpass = mass, bandpass = air. */
  filter: BiquadFilterType;
  freq: number;
  /** Where the band ends up (exponential ramp across the decay). */
  glide?: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
}

/** One enveloped burst of filtered noise — the unpitched half of every impact. */
function hiss(ctx: Ctx, out: AudioNode, when: number, spec: HissSpec): number {
  const attack = spec.attack ?? 0.001;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter;
  filter.frequency.setValueAtTime(spec.freq, when);
  if (spec.glide !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, spec.glide), when + attack + spec.decay);
  }
  if (spec.q !== undefined) filter.Q.value = spec.q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(spec.peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + spec.decay);
  src.connect(filter).connect(gain).connect(out);
  const end = when + attack + spec.decay + 0.02;
  src.start(when);
  src.stop(end);
  return end;
}

/* --- the landing scale ----------------------------------------------------- */

/**
 * C-major pentatonic, low to high: G3 A3 C4 D4 E4. §13.4 pins the mapping from
 * both ends — "priority order = ascending" scale and "I with the lowest" tap —
 * which only agree if pitch *descends* as the priority number climbs: the most
 * prominent product owns the top of the scale, the last one (I, priority 5) the
 * bottom. An entry cascade then walks the scale in whatever order the pieces
 * land, which is the tiny melody the design asks for.
 */
export const LANDING_SCALE = [196.0, 220.0, 261.63, 293.66, 329.63] as const;

/** The note for the product ranked `rank` (0 = priority 1 = top of the scale). */
export function landingNote(rank: number): number {
  const index = Math.max(0, LANDING_SCALE.length - 1 - (rank % LANDING_SCALE.length));
  return LANDING_SCALE[index]!;
}

/* --- timbres, one per scene (DESIGN §13.4's table) ------------------------- */

/**
 * Entry landing, the standard voice: a soft wooden tap. The triangle carries the
 * piece's own pentatonic note (triangle = mostly fundamental with soft odd
 * harmonics — the "wood"), and a whisper of high-passed noise is the moment of
 * surface contact. 140ms decay: a block set down on a board, not a bell.
 */
export function tapWood(ctx: Ctx, out: AudioNode, when: number, freq: number): number {
  const end = tone(ctx, out, when, { type: 'triangle', freq, peak: 0.5, decay: 0.14 });
  hiss(ctx, out, when, { filter: 'highpass', freq: 2400, peak: 0.07, decay: 0.02 });
  return end;
}

/**
 * O's landing ("a slightly rubbery boing"): a sine — rubber has no edge — that
 * dips a quarter below the note and springs back while it rings, over a longer
 * decay. The dip is deliberately small: a full octave would be a cartoon spring,
 * and the mascot is a sticker, not a clown.
 */
export function tapBoing(ctx: Ctx, out: AudioNode, when: number, freq: number): number {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 0.75, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.55, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + 0.26);
  return when + 0.26;
}

/**
 * I's landing: the lowest note and the driest delivery — fundamental only, half
 * the decay, no contact noise at all. A metronome's tick, which is the piece's
 * whole personality.
 */
export function tapDry(ctx: Ctx, out: AudioNode, when: number, freq: number): number {
  return tone(ctx, out, when, { type: 'triangle', freq, peak: 0.5, decay: 0.07 });
}

/**
 * Hard-drop impact (reshuffle): heavier and lower than any entry tap — a felt
 * hammer. A sine falling through the floor of the landing scale (110→55Hz, an
 * octave of sag = weight) under a low-passed noise burst that is the mass of
 * the thing arriving.
 */
export function thudFelt(ctx: Ctx, out: AudioNode, when: number): number {
  const end = tone(ctx, out, when, { type: 'sine', freq: 110, glide: 55, peak: 0.7, decay: 0.18 });
  hiss(ctx, out, when, { filter: 'lowpass', freq: 240, peak: 0.35, decay: 0.09 });
  return end;
}

/**
 * The line-clear sweep, as **one continuous rising swish** across the whole
 * clear — not one burst per row.
 *
 * Per-row was the design's first instinct and the device test rejected it: ten
 * rows at 40ms apart is ten transients in under half a second, which reads as a
 * machine-gun rattle rather than as light travelling up the stack. The visual it
 * accompanies is one gesture, so the sound is one gesture: a single band-passed
 * noise burst whose centre glides 500Hz → 2.8kHz over the sweep's real duration,
 * with one soft attack and one decay.
 *
 * The level compensation stays, and is the reason the glide is audible as pitch
 * rather than as a crescendo: a band-pass passes energy in proportion to its
 * bandwidth, so a fixed source level would ramp ~15dB across this sweep (and
 * clip at the top, which it did). Because the gain now has to track a *moving*
 * centre rather than a fixed one, it rides an inverse ramp on the gain node
 * instead of a constant.
 */
const SWISH_LO = 400;
const SWISH_HI = 1200;
/**
 * The brick wall, and the actual fix. A band-pass is a *slope*, not a ceiling:
 * at Q 1.2 the old band centred on 2.8kHz still passed usable energy past 5kHz,
 * and lowering Q to widen the "air" made it worse rather than better (measured:
 * Q 0.6 with a 1.2kHz ceiling still read 35% harsh, because a wide band leaks
 * upward as readily as down). Two cascaded lowpasses after the band — 12dB per
 * octave each, 24dB total — are what turn a ceiling into a ceiling.
 */
const SWISH_LP = 1500;

/**
 * The line-clear sweep, as **one continuous rising swish** across the whole
 * clear — not one burst per row.
 *
 * Per-row was the design's first instinct and the device test rejected it: ten
 * rows at 40ms apart is ten transients in under half a second, which reads as a
 * machine-gun rattle rather than as light travelling up the stack. The visual it
 * accompanies is one gesture, so the sound is one gesture: a single band-passed
 * noise burst whose centre glides over the sweep's real duration, with one soft
 * attack and one decay.
 *
 * v2.2.2, from a device test that called this "刺耳": the 500Hz→2.8kHz version
 * put the top of its glide directly in the 2–5kHz band where human hearing peaks
 * (ISO 226), and the ear reads a noise band parked there as a hiss aimed at it.
 * Measured through an OfflineAudioContext, DFT at 320ms into a 400ms sweep, as
 * a fraction of total energy in 2–5kHz:
 *
 *     500→2800, Q1.6, no lowpass (old)   57.5% harsh, 14.5% >5kHz, peak −7.1dBFS
 *     450→1400, Q0.7 (widen the band)    36.2% harsh, 15.0% >5kHz, peak −6.5
 *     450→1200, Q0.6 (widen further)     35.1% harsh, 12.0% >5kHz, peak −6.1
 *     450→1400 + 2×LP1800, Q0.9           6.1% harsh,  0.0% >5kHz, peak −9.0
 *     400→1200 + 2×LP1500, Q1.2 (this)    0.7% harsh,  0.0% >5kHz, peak −9.7
 *
 * The last row is the recipe: the glide still rises (light travelling up the
 * stack is the whole point — the visual sweeps upward, so the pitch does too),
 * but it now tops out at 1.2kHz where a noise band reads as *breath* rather than
 * as sibilance, and the pair of lowpasses guarantees nothing above 1.5kHz gets
 * out regardless of where the band's skirt lands. Q stays at 1.2: with a real
 * ceiling in place, a *tighter* band is what makes the movement legible as pitch.
 *
 * The level lands at −9.7dBFS against the landing tap's −6.8, i.e. ~3dB under
 * the kit's reference voice, which is where §13.4 wants scenery to sit next to
 * an impact. The old version was −7.1: louder *and* brighter than the thing it
 * was meant to accompany.
 *
 * The level compensation stays, and is the reason the glide is audible as pitch
 * rather than as a crescendo: a band-pass passes energy in proportion to its
 * bandwidth, so a fixed source level would ramp across the sweep. Because the
 * gain has to track a *moving* centre, it rides an inverse ramp on the gain node
 * instead of a constant.
 */
const SWISH_GAIN = 400;

export function sweepSwish(ctx: Ctx, out: AudioNode, when: number, durationS: number): number {
  const dur = Math.max(0.12, durationS);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(SWISH_LO, when);
  filter.frequency.exponentialRampToValueAtTime(SWISH_HI, when + dur);

  // The ceiling, twice — see SWISH_LP. One of these is a slope; two are a wall.
  const lp1 = ctx.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.frequency.value = SWISH_LP;
  lp1.Q.value = 0.7;
  const lp2 = ctx.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = SWISH_LP;
  lp2.Q.value = 0.7;

  const gain = ctx.createGain();
  const attack = 0.03;
  const release = 0.12;
  // The inverse of the band's own gain curve, so the swish holds one loudness
  // while its pitch climbs — only the pitch is allowed to move.
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(SWISH_GAIN / SWISH_LO, when + attack);
  gain.gain.exponentialRampToValueAtTime(SWISH_GAIN / SWISH_HI, when + dur);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);

  src.connect(filter).connect(lp1).connect(lp2).connect(gain).connect(out);
  const end = when + dur + release + 0.02;
  src.start(when);
  src.stop(end);
  return end;
}

/**
 * The sweep's full stop: three tiny sine pings stepping up a G-major arpeggio —
 * the pixel sparks, for the ear.
 *
 * Dropped an octave in v2.2.2 (G6 B6 D7 → G5 B5 D6) to follow the swish down.
 * The old triad sat at 1568/1976/2349Hz, i.e. entirely inside the 2–5kHz band
 * the swish was just rebuilt to stay out of — measured 40.1% of its energy
 * there, which made the sparkle the new brightest thing in the kit and left the
 * sweep sounding like it ended in a different instrument. At G5 the figure
 * measures 0.0% harsh at an unchanged −12.4dBFS peak: same gesture, same level,
 * same relationship to the swish it closes, minus the sting. Sine and 55ms
 * spacing are untouched — the rhythm was never the problem.
 */
export function sweepSparkle(ctx: Ctx, out: AudioNode, when: number): number {
  let end = when;
  [784, 987.77, 1174.66].forEach((freq, i) => {
    end = tone(ctx, out, when + i * 0.055, { type: 'sine', freq, peak: 0.24, decay: 0.09 });
  });
  return end;
}

/**
 * Reshuffle trigger (R / tap): a mechanical lever — two transients, the catch
 * and the throw. A high narrow click, then a lower, meatier one 45ms behind it;
 * the gap is what makes it a mechanism rather than a tick. Levelled to sit just
 * under the landing taps: the lever announces the ride, it is not the ride.
 */
export function leverClick(ctx: Ctx, out: AudioNode, when: number): number {
  hiss(ctx, out, when, { filter: 'highpass', freq: 3200, peak: 0.22, decay: 0.018 });
  return hiss(ctx, out, when + 0.045, { filter: 'bandpass', freq: 900, q: 2, peak: 0.28, decay: 0.04 });
}

/**
 * Select (hover/focus a piece): a short high blip, ~−10dB against the landing
 * taps (0.5 × 0.32 ≈ 0.16). §13.4 originally specified −18dB; on a real device
 * at a normal system volume that was below the noise floor of the room, and a
 * feedback sound nobody hears is not restraint, it is a missing feature. Still
 * the quietest voice in the kit, and still one clean sine — sweeping the
 * pointer across the wall should read as presence, not as percussion.
 */
export function selectBlip(ctx: Ctx, out: AudioNode, when: number): number {
  return tone(ctx, out, when, { type: 'sine', freq: 1760, peak: 0.16, decay: 0.035 });
}

/**
 * Open (click/Enter on a product): a bright two-note confirm — C6 up to G6, the
 * rising fifth every console uses for "yes". Square, because the moment of
 * commitment gets the brightest wave on the shelf.
 */
export function confirmChirp(ctx: Ctx, out: AudioNode, when: number): number {
  tone(ctx, out, when, { type: 'square', freq: 1046.5, peak: 0.26, decay: 0.07 });
  return tone(ctx, out, when + 0.075, { type: 'square', freq: 1568, peak: 0.26, decay: 0.11 });
}

/**
 * Theme toggle: a switch flick — the click of the toggle itself, then a soft
 * sine pop gliding a fourth: up into the light (dark→light), down into the dark.
 * The pop is filtered soft on purpose; a theme change is scenery, not an event.
 */
export function switchFlick(ctx: Ctx, out: AudioNode, when: number, up: boolean): number {
  hiss(ctx, out, when, { filter: 'highpass', freq: 2500, peak: 0.3, decay: 0.014 });
  const [from, to] = up ? [392, 523.25] : [523.25, 392];
  return tone(ctx, out, when + 0.02, { type: 'sine', freq: from, glide: to, peak: 0.24, decay: 0.1 });
}

/**
 * Egg drop (3rd reshuffle): a small mysterious three-note riddle — C5 D5 F♯5.
 * The ♯4 is the tritone against the C, the interval every cartoon reaches for
 * when something says "hm?", which is exactly what a falling `?` should say.
 */
export function eggJingle(ctx: Ctx, out: AudioNode, when: number): number {
  let end = when;
  [523.25, 587.33, 739.99].forEach((freq, i) => {
    end = tone(ctx, out, when + i * 0.11, { type: 'triangle', freq, peak: 0.3, decay: 0.16 });
  });
  return end;
}

/**
 * Konami rain, the bed: a low rumble under the whole downpour — low-passed noise
 * for the weather plus a 50Hz sine for the pressure of it, swelling in over
 * ~0.4s and draining away with the storm. This voice alone gets a real attack:
 * weather arrives, it does not strike.
 */
export function konamiRumble(ctx: Ctx, out: AudioNode, when: number, durationS: number): number {
  const dur = Math.max(1, durationS);
  const shape = (gain: GainNode, peak: number): void => {
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.4);
    gain.gain.setValueAtTime(peak, when + dur - 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  };

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 130;
  const noiseGain = ctx.createGain();
  shape(noiseGain, 0.22);
  src.connect(filter).connect(noiseGain).connect(out);
  src.start(when);
  src.stop(when + dur + 0.05);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 50;
  const oscGain = ctx.createGain();
  shape(oscGain, 0.12);
  osc.connect(oscGain).connect(out);
  osc.start(when);
  osc.stop(when + dur + 0.05);

  return when + dur + 0.05;
}

/**
 * Konami rain, one hailstone: a short tap at a random pitch, deliberately off
 * the pentatonic grid — the weather does not play the product melody, and a
 * dozen of these landing at random pitches is what "a hail of taps" sounds like.
 */
export function hailTap(ctx: Ctx, out: AudioNode, when: number): number {
  const freq = 240 + Math.random() * 620;
  return tone(ctx, out, when, { type: 'triangle', freq, peak: 0.24, decay: 0.06 });
}

/**
 * Chassis key press (v2.2): the sound a button on the *machine* makes, as
 * opposed to anything happening on the screen. One dry mid transient plus a
 * blunt low thock — a membrane key bottoming out. It plays under the theme
 * flick and the speaker toggle, which is why it carries no pitch of its own:
 * it is the finger, and the voice after it is the consequence.
 */
export function keyPress(ctx: Ctx, out: AudioNode, when: number): number {
  hiss(ctx, out, when, { filter: 'bandpass', freq: 1800, q: 1.4, peak: 0.3, decay: 0.014 });
  return tone(ctx, out, when + 0.006, { type: 'triangle', freq: 180, glide: 120, peak: 0.24, decay: 0.045 });
}

/* --- the manager ----------------------------------------------------------- */

const SOUND_KEY = 'aix4u-sound';
/**
 * DESIGN §13.4 asked for ~0.5 and the device test rejected it: audible only
 * with the system volume pushed high. 0.8 is the revised master — clearly
 * present at a normal volume, and still under unity with a compressor after it.
 */
const MASTER_GAIN = 0.8;
const MAX_VOICES = 8;

export interface SoundSystem {
  readonly enabled: boolean;
  /** Flip the switch; returns the new state. */
  toggle(): boolean;
  /** Entry landing for the product ranked `rank`; `motion` picks the variant. */
  landing(rank: number, motion: string | undefined): void;
  hardDrop(): void;
  /** The whole clear as one rising swish; `durationMs` is the sweep's real length. */
  sweep(durationMs: number): void;
  sweepEnd(): void;
  lever(): void;
  select(): void;
  open(): void;
  /** The machine's own buttons: the press, before whatever it causes. */
  key(): void;
  /** `up` = switching to the light theme (pitch rises into the light). */
  theme(up: boolean): void;
  egg(): void;
  rain(durationMs: number): void;
  hail(): void;
  /**
   * Called whenever `enabled` changes for a reason that was *not* this page's
   * own `toggle()` — i.e. another tab flipping the switch. The HUD speaker
   * subscribes so its `aria-pressed` never disagrees with what you can hear.
   */
  onEnabledChange(listener: (on: boolean) => void): void;
}

/**
 * The kit is a singleton (v2.2.2). Two systems on one page would each hold their
 * own `enabled` flag and their own AudioContext, so the speaker would only mute
 * the one it was wired to and two attract loops at different phases would double
 * every voice. Nothing in the current page does that — `index.astro` imports
 * this module exactly once and the built bundle carries one copy — but the bug
 * this guards against is silent and intermittent, and the guard is four lines.
 */
let instance: SoundSystem | null = null;

export function createSoundSystem(): SoundSystem {
  if (instance) return instance;
  instance = buildSoundSystem();
  return instance;
}

function buildSoundSystem(): SoundSystem {
  let ctx: AudioContext | null = null;
  let bus: AudioNode | null = null;
  let voices = 0;
  /**
   * Default **on** (v2.2, overriding §13.4's "default muted"). A stored '0' is
   * the only thing that mutes the page: an unset key means a first-time visitor,
   * and a first-time visitor is who the sound design is for.
   */
  let enabled = true;
  try {
    enabled = localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    /* private mode: starts on, like everyone else */
  }

  /** The context is minted lazily, on the first sound (or the first gesture). */
  function ensure(): AudioNode | null {
    if (!enabled) return null;
    if (!ctx) {
      const AC =
        window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      const compressor = ctx.createDynamicsCompressor();
      /**
       * The compressor exists to keep a cascade from clipping, and nothing else.
       * Configured as a **slow ceiling limiter**, and both halves of that phrase
       * were bought with measurements.
       *
       * This node is why the page tested inaudible. Every voice in this kit is a
       * percussive transient with a ~3ms attack, and a compressor's attack eats
       * exactly that: rendered through an OfflineAudioContext, a single landing
       * tap left the default node 10dB below its own input, and a −8dB/4:1
       * setting made it *worse*, not better (−12dB) — a fast detector clamps the
       * only part of a tap the ear ever hears. Raising the master would just
       * have fed it more to eat.
       *
       * A 50ms attack is longer than most of these voices, so they pass through
       * untouched (a single tap measures −8.6dBFS against −8.4 bypassed); a hard
       * −3dB ceiling at 20:1 with no knee then only leans on what a *sustained*
       * pile-up does. Eight taps inside 80ms come out at −5.5dBFS with zero
       * clipped samples, which is the safety net the design asked for.
       */
      compressor.threshold.value = -3;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.05;
      compressor.release.value = 0.25;
      master.connect(compressor).connect(ctx.destination);
      bus = master;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return bus;
  }

  /**
   * Default-on collides with the autoplay policy: a context created before any
   * user gesture starts `suspended`, so the entry cascade a visitor arrives to
   * is silent no matter what the toggle says. The honest fix is not to fake it
   * but to be ready — every plausible first gesture wakes the context silently,
   * so the *first thing the visitor does* (moving onto a piece, pressing R,
   * clicking anywhere) is already accompanied. These listeners are passive,
   * non-capturing and one-shot: they never see an event before the page does
   * and they cost nothing after the first one.
   *
   * `pointerover` is in the list deliberately — on desktop it is usually the
   * earliest gesture-ish event, and Chrome and Safari both count a real pointer
   * interaction as activation. If a browser disagrees, the click that follows
   * does not.
   */
  function armResume(): void {
    const events = ['pointerdown', 'pointerover', 'keydown', 'touchstart', 'click'] as const;
    const wake = (): void => {
      for (const type of events) window.removeEventListener(type, wake);
      ensure();
    };
    for (const type of events) window.addEventListener(type, wake, { passive: true, once: false });
  }

  armResume();

  /**
   * The mute is per-*document*, and that is the bug this fixes (v2.2.2).
   *
   * `enabled` is read from localStorage exactly once, at construction, and after
   * that only `toggle()` ever moves it. So any document loaded while sound was on
   * keeps its own `enabled = true` forever, no matter what happens elsewhere: mute
   * the page in tab A and tab B — same origin, same storage, speaker icon still
   * showing "on" because it never re-read the key — goes right on running its
   * attract loop out loud. From the visitor's seat that is exactly the reported
   * symptom: "muted, and the demo is still making noise", plus the occasional
   * doubled voice when both tabs' 8s idle clocks drift into alignment. Verified
   * in the browser against a second same-origin realm: with `aix4u-sound` set to
   * '0', the realm that had been loaded beforehand still minted 5 oscillators
   * across one attract pass.
   *
   * `storage` fires in every *other* document of the origin when one of them
   * writes, which is precisely the missing edge. The switch is a property of the
   * visitor, not of the tab; a tab left open in the background is the single most
   * likely place for an unexplained sound to come from, and it is also the one
   * place the toggle could not reach.
   */
  const enabledListeners: ((on: boolean) => void)[] = [];

  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== SOUND_KEY) return;
    // A cleared key (`newValue === null`) means storage was wiped, which is the
    // default-on state, same as a first-time visitor.
    const next = event.newValue !== '0';
    if (next === enabled) return;
    enabled = next;
    if (enabled) ensure();
    // Silence *now*, not after the current voice finishes: a mute the visitor has
    // to wait out is not a mute. Suspending the context stops everything already
    // scheduled; `ensure()` resumes it on the way back.
    else if (ctx && ctx.state === 'running') void ctx.suspend();
    for (const listener of enabledListeners) listener(enabled);
  });

  /** Voice-capped dispatch: at 8 voices a new sound is dropped, never queued. */
  function play(build: Timbre): void {
    const out = ensure();
    if (!out || !ctx) return;
    // A context still parked by the autoplay policy would swallow the voice and
    // leave the cap counting phantoms; drop it and let the next one through.
    if (ctx.state !== 'running') return;
    if (voices >= MAX_VOICES) return;
    voices += 1;
    const end = build(ctx, out, ctx.currentTime);
    window.setTimeout(
      () => {
        voices -= 1;
      },
      Math.max(0, (end - ctx.currentTime) * 1000) + 30,
    );
  }

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      try {
        localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
      } catch {
        /* private mode: the choice simply does not persist */
      }
      if (enabled) ensure();
      return enabled;
    },
    landing(rank, motion) {
      const freq = landingNote(rank);
      if (motion === 'squash') play((c, o, t) => tapBoing(c, o, t, freq));
      else if (motion === 'metronome') play((c, o, t) => tapDry(c, o, t, freq));
      else play((c, o, t) => tapWood(c, o, t, freq));
    },
    hardDrop() {
      play(thudFelt);
    },
    sweep(durationMs) {
      play((c, o, t) => sweepSwish(c, o, t, durationMs / 1000));
    },
    sweepEnd() {
      play(sweepSparkle);
    },
    lever() {
      play(leverClick);
    },
    select() {
      play(selectBlip);
    },
    open() {
      play(confirmChirp);
    },
    key() {
      play(keyPress);
    },
    theme(up) {
      play((c, o, t) => switchFlick(c, o, t, up));
    },
    egg() {
      play(eggJingle);
    },
    rain(durationMs) {
      play((c, o, t) => konamiRumble(c, o, t, durationMs / 1000));
    },
    hail() {
      play(hailTap);
    },
    onEnabledChange(listener) {
      enabledListeners.push(listener);
    },
  };
}
