/*
 * Making the faces move.
 *
 * The whole reason this is cheap: a face is already a bag of numbers, so
 * animating one is interpolating numbers. No sprite sheets, no keyframed SVG,
 * no second set of artwork — the same FaceParams the editor writes to are what
 * gets tweened, blinked and wobbled here.
 *
 * Three ideas, in the order they matter:
 *
 *   morph — cross-fade one mood into the next by lerping every parameter.
 *   blink — the thing that makes a face look alive rather than printed.
 *   boil  — redraw the line slightly differently every few frames, the way a
 *           hand-drawn animation is never twice the same. This is what makes
 *           it read as ink on paper instead of vector art.
 *
 * Everything here is pure and deterministic: given the same elapsed time you
 * get the same face, which is what lets the tests assert on motion and lets
 * the renderer stay a dumb function of state.
 */

import { clampFace, type FaceParams, type Mark } from './face';

export function lerp(a: number, b: number, t: number): number {
  // The ends are returned exactly rather than computed. `a + (b - a) * 1` is
  // not always `b` in floating point, and a morph that finishes a hair away
  // from its target leaves the held frame subtly different from the template
  // it is supposed to be resting on.
  if (t <= 0) return a;
  if (t >= 1) return b;
  return a + (b - a) * t;
}

/** Slow in, slow out. Linear morphs between expressions look mechanical. */
export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

/**
 * Blend two faces.
 *
 * Numbers tween; things that cannot be half-way — eye shape, brows on or off,
 * which marks are showing — switch at the midpoint, while the surrounding
 * numbers are still moving and the swap is hardest to catch.
 */
export function lerpFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  const k = Math.min(1, Math.max(0, t));
  const past = k >= 0.5;
  return clampFace({
    width: lerp(a.width, b.width, k),
    height: lerp(a.height, b.height, k),
    squish: lerp(a.squish, b.squish, k),
    tilt: lerp(a.tilt, b.tilt, k),
    gap: lerp(a.gap, b.gap, k),
    eyes: {
      shape: past ? b.eyes.shape : a.eyes.shape,
      x: lerp(a.eyes.x, b.eyes.x, k),
      y: lerp(a.eyes.y, b.eyes.y, k),
      size: lerp(a.eyes.size, b.eyes.size, k),
      squint: lerp(a.eyes.squint, b.eyes.squint, k),
      tilt: lerp(a.eyes.tilt, b.eyes.tilt, k),
    },
    brows: {
      on: past ? b.brows.on : a.brows.on,
      // Brows keep tweening even while switched off, so turning them back on
      // mid-morph never snaps them in from a stale angle.
      y: lerp(a.brows.y, b.brows.y, k),
      angle: lerp(a.brows.angle, b.brows.angle, k),
      length: lerp(a.brows.length, b.brows.length, k),
    },
    mouth: {
      y: lerp(a.mouth.y, b.mouth.y, k),
      width: lerp(a.mouth.width, b.mouth.width, k),
      curve: lerp(a.mouth.curve, b.mouth.curve, k),
      open: lerp(a.mouth.open, b.mouth.open, k),
      wave: lerp(a.mouth.wave, b.mouth.wave, k),
      flick: lerp(a.mouth.flick, b.mouth.flick, k),
    },
    marks: (past ? b.marks : a.marks) as Mark[],
  });
}

// --- The reel --------------------------------------------------------------

export interface ReelOptions {
  /** How long each face is held. */
  dwellMs?: number;
  /** How long the change from one face to the next takes. */
  morphMs?: number;
}

export interface ReelFrame {
  face: FaceParams;
  /** Which face is showing (the one being morphed away from). */
  index: number;
  /** 0 while holding, 0→1 through the morph. */
  progress: number;
}

/**
 * Where a reel of faces is at a given moment: holding on one, or part-way
 * into the next.
 */
export function reelFrame(faces: FaceParams[], elapsedMs: number, opts: ReelOptions = {}): ReelFrame {
  const { dwellMs = 1900, morphMs = 620 } = opts;
  if (faces.length === 0) throw new Error('a reel needs at least one face');
  if (faces.length === 1) return { face: faces[0], index: 0, progress: 0 };

  const step = dwellMs + morphMs;
  const elapsed = Math.max(0, elapsedMs);
  const index = Math.floor(elapsed / step) % faces.length;
  const within = elapsed % step;

  if (within < dwellMs) return { face: faces[index], index, progress: 0 };

  const progress = (within - dwellMs) / morphMs;
  const next = faces[(index + 1) % faces.length];
  return { face: lerpFace(faces[index], next, easeInOut(progress)), index, progress };
}

// --- Blinking --------------------------------------------------------------

const BLINK_EVERY = 3600;
const BLINK_CLOSE = 90;
const BLINK_OPEN = 130;

/** Deterministic 0..1 from an integer — a hash, not a random, so frames repeat. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How shut the eyes are right now, 0..1.
 *
 * Blinks land at a jittered offset inside each period rather than on a fixed
 * beat — a metronome blink is worse than no blink at all. Roughly one in four
 * is a double.
 */
export function blinkAmount(elapsedMs: number, seed = 0): number {
  const period = Math.floor(elapsedMs / BLINK_EVERY);
  const jitter = hash(period + seed * 17) * (BLINK_EVERY - BLINK_CLOSE - BLINK_OPEN - 400);
  const start = period * BLINK_EVERY + jitter;
  const double = hash(period + seed * 17 + 0.5) > 0.75;

  const envelope = (t: number): number => {
    if (t < 0) return 0;
    if (t < BLINK_CLOSE) return t / BLINK_CLOSE;
    if (t < BLINK_CLOSE + BLINK_OPEN) return 1 - (t - BLINK_CLOSE) / BLINK_OPEN;
    return 0;
  };

  const first = envelope(elapsedMs - start);
  const second = double ? envelope(elapsedMs - start - BLINK_CLOSE - BLINK_OPEN - 110) : 0;
  return Math.max(first, second);
}

/** Close the eyes by `amount`, never opening them wider than they already are. */
export function applyBlink(face: FaceParams, amount: number): FaceParams {
  if (amount <= 0.001) return face;
  return {
    ...face,
    eyes: { ...face.eyes, squint: Math.max(face.eyes.squint, Math.min(1, amount)) },
  };
}

// --- Boil ------------------------------------------------------------------

/** Frames per second the line is redrawn at. Hand-drawn animation lives here. */
export const BOIL_FPS = 8;

/**
 * Nudge the drawing by a hair, differently on each frame.
 *
 * Every value is derived from the frame number, so the wobble is the same
 * every time frame 12 comes round — it looks like a redrawn line rather than
 * random noise, and it never drifts anywhere.
 */
export function boilFace(face: FaceParams, frame: number, amount = 1): FaceParams {
  if (amount <= 0) return face;
  const n = (i: number) => (hash(frame * 7.13 + i * 31.7) * 2 - 1) * amount;
  return clampFace({
    ...face,
    width: face.width + n(1) * 1.6,
    height: face.height + n(2) * 1.6,
    tilt: face.tilt + n(3) * 1.1,
    eyes: {
      ...face.eyes,
      x: face.eyes.x + n(4) * 1.2,
      y: face.eyes.y + n(5) * 1.2,
      size: face.eyes.size + n(6) * 0.7,
      tilt: face.eyes.tilt + n(7) * 3,
    },
    brows: { ...face.brows, y: face.brows.y + n(8) * 1.2, angle: face.brows.angle + n(9) * 2.5 },
    mouth: {
      ...face.mouth,
      y: face.mouth.y + n(10) * 1.4,
      width: face.mouth.width + n(11) * 2.2,
      curve: face.mouth.curve + n(12) * 0.045,
    },
  });
}

export interface AnimationSpec {
  faces: FaceParams[];
  dwellMs?: number;
  morphMs?: number;
  blink?: boolean;
  /** 0 turns the wobble off; 1 is the house amount. */
  boil?: number;
  /** Offsets this face's clock, so a grid of them is not in lockstep. */
  phaseMs?: number;
  seed?: number;
}

/** The whole pipeline for one moment in time: reel → blink → boil. */
export function faceAt(spec: AnimationSpec, elapsedMs: number): ReelFrame {
  const { faces, dwellMs, morphMs, blink = true, boil = 0, phaseMs = 0, seed = 0 } = spec;
  const t = elapsedMs + phaseMs;
  const frame = reelFrame(faces, t, { dwellMs, morphMs });
  let face = frame.face;
  if (blink) face = applyBlink(face, blinkAmount(t, seed));
  if (boil > 0) face = boilFace(face, Math.floor(t / (1000 / BOIL_FPS)) + seed * 13, boil);
  return { ...frame, face };
}
