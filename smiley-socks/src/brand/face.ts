/*
 * The face engine.
 *
 * A Smiley Socks face is a bag of numbers, not a drawing. Templates are
 * presets of those numbers and the editor's drag handles write to the same
 * numbers, which is the whole reason "start from Heavy and pull it around
 * until it's yours" needs no second code path.
 *
 * Everything here is pure: params in, primitives out. Face.tsx does nothing
 * but turn primitives into JSX, so the geometry is testable without a DOM.
 *
 * Face space is a 200x200 box, centre (100,100). The sock scales it by
 * viewBox — there is no second, smaller artwork for the small print.
 */

export const FACE_BOX = 200;
export const FACE_CX = 100;
export const FACE_CY = 100;

/** Mono-line weight, matched to Grinline so type and faces print as one system. */
export const STROKE = 10;

export type EyeShape = 'bar' | 'tick' | 'round' | 'arc' | 'cross' | 'line' | 'spiral' | 'heart' | 'lash';
export type Mark = 'tear' | 'sweat' | 'blush' | 'static' | 'zzz' | 'sparkle' | 'wink' | 'tongue' | 'shades';

/** How the line is drawn. Chalk is the house look; clean is a flat vector. */
export type Finish = 'clean' | 'chalk';

export interface FaceParams {
  /** Outline half-width and half-height. */
  width: number;
  height: number;
  /** Mario-64 pull: >0 stretches the crown and pinches the chin. */
  squish: number;
  /** Whole-face rotation, degrees. */
  tilt: number;
  /**
   * The open loop — the gap in the outline at the top right, in degrees.
   * At 360 there is no outline left at all, which is how these faces get
   * drawn by hand in the first place: two eyes and a mouth, floating.
   */
  gap: number;

  eyes: {
    shape: EyeShape;
    /** Distance from centre line. */
    x: number;
    /** Absolute y. */
    y: number;
    size: number;
    /** 0 = wide open, 1 = shut. */
    squint: number;
    /** Degrees, mirrored between the two eyes. */
    tilt: number;
  };
  brows: {
    on: boolean;
    y: number;
    /** Positive drops the inner ends — the angry direction. */
    angle: number;
    length: number;
  };
  mouth: {
    y: number;
    width: number;
    /** -1 full frown … +1 full smile. */
    curve: number;
    /** 0 = a line, 1 = wide open. */
    open: number;
    /** Squiggle, for the moods that aren't a clean curve. */
    wave: number;
    /** The upswept tail the mouth ends on — the pen lifting off the page. */
    flick: number;
  };
  marks: Mark[];
}

/**
 * The one source of truth for what a parameter is allowed to be.
 *
 * The editor reads these to clamp drags, the tests read them to check the
 * extremes, and clampFace() reads them to sanitise anything restored from
 * localStorage. A face can be ugly on purpose; it can never be broken.
 */
export const FACE_LIMITS = {
  width: [52, 88],
  height: [52, 88],
  squish: [-18, 18],
  tilt: [-14, 14],
  gap: [0, 360],
  eyeX: [14, 48],
  eyeY: [52, 104],
  eyeSize: [5, 26],
  eyeSquint: [0, 1],
  eyeTilt: [-40, 40],
  browY: [26, 74],
  browAngle: [-40, 40],
  browLength: [12, 38],
  mouthY: [104, 168],
  mouthWidth: [24, 104],
  mouthCurve: [-1, 1],
  mouthOpen: [0, 1],
  mouthWave: [0, 1],
  mouthFlick: [0, 1],
} as const;

export type LimitKey = keyof typeof FACE_LIMITS;

export function clamp(value: number, [lo, hi]: readonly [number, number]): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

export function clampTo(key: LimitKey, value: number): number {
  return clamp(value, FACE_LIMITS[key] as unknown as readonly [number, number]);
}

/** Sanitise a whole face — used on every edit and on anything read back from storage. */
export function clampFace(p: FaceParams): FaceParams {
  return {
    ...p,
    width: clampTo('width', p.width),
    height: clampTo('height', p.height),
    squish: clampTo('squish', p.squish),
    tilt: clampTo('tilt', p.tilt),
    gap: clampTo('gap', p.gap),
    eyes: {
      ...p.eyes,
      x: clampTo('eyeX', p.eyes.x),
      y: clampTo('eyeY', p.eyes.y),
      size: clampTo('eyeSize', p.eyes.size),
      squint: clampTo('eyeSquint', p.eyes.squint),
      tilt: clampTo('eyeTilt', p.eyes.tilt),
    },
    brows: {
      ...p.brows,
      y: clampTo('browY', p.brows.y),
      angle: clampTo('browAngle', p.brows.angle),
      length: clampTo('browLength', p.brows.length),
    },
    mouth: {
      ...p.mouth,
      y: clampTo('mouthY', p.mouth.y),
      width: clampTo('mouthWidth', p.mouth.width),
      curve: clampTo('mouthCurve', p.mouth.curve),
      open: clampTo('mouthOpen', p.mouth.open),
      wave: clampTo('mouthWave', p.mouth.wave),
      flick: clampTo('mouthFlick', p.mouth.flick),
    },
    marks: [...new Set(p.marks)],
  };
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

export type Prim =
  | { kind: 'stroke'; d: string; w?: number; opacity?: number; key: string }
  | { kind: 'fill'; d: string; opacity?: number; key: string }
  | { kind: 'dot'; cx: number; cy: number; rx: number; ry: number; opacity?: number; key: string };

type Pt = [number, number];

/**
 * Catmull-Rom through the points, emitted as cubics.
 *
 * Sampling a curve into a polyline and stroking it looks faceted at print
 * size, which is exactly the size this art is used at. Smoothing costs a few
 * lines here and buys a clean outline everywhere.
 */
function smooth(points: Pt[], closed = false): string {
  if (points.length < 2) return '';
  const pt = (i: number): Pt => {
    if (closed) return points[(i + points.length) % points.length];
    return points[Math.min(points.length - 1, Math.max(0, i))];
  };
  let d = `M${r(points[0][0])},${r(points[0][1])}`;
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = pt(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r(c1[0])},${r(c1[1])} ${r(c2[0])},${r(c2[1])} ${r(p2[0])},${r(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

const RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// The hand-drawn wobble
// ---------------------------------------------------------------------------

/*
 * Chalk finish gets a small, stable jitter baked into the geometry itself —
 * not applied as a screen filter — so the same "drawn by hand, not plotted"
 * quality shows up everywhere a face is used: the flat SVG proof, the 3D
 * texture, the photo mockup, and the exported print file. Every renderer
 * downstream just draws whatever `d` string it is given; a filter that only
 * the browser's SVG engine understands can never reach a PNG or a PDF.
 *
 * Trig-based rather than a bitwise hash on purpose. This engine and its
 * Python port both round every coordinate to two decimal places before it
 * reaches a path string, and Math.sin/math.sin agree to far more precision
 * than that survives — so the same face and the same named point wobble to
 * the same numbers on both sides, with no 32-bit-integer overflow behaviour
 * to reproduce exactly across languages.
 */

interface Wob {
  seed: number;
  on: boolean;
}

const NO_WOB: Wob = { seed: 0, on: false };

/** A small, stable seed for a short string — good enough for a jitter, not for anything cryptographic. */
function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 131 + text.charCodeAt(i)) % 1000003;
  return h;
}

/** A stable pseudo-random unit value in [0,1) for a (seed, salt) pair. */
function noise01(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233 + 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/** A small, stable 2D offset for one named point on one face. Zero when off. */
function wob(W: Wob, key: string, amount: number): Pt {
  if (!W.on || amount <= 0) return [0, 0];
  const salt = seedOf(key);
  return [(noise01(W.seed, salt * 2 + 1) * 2 - 1) * amount, (noise01(W.seed, salt * 2 + 2) * 2 - 1) * amount];
}

/** A multiplier close to 1, for radii and widths that should not all match exactly. */
function radiusJitter(W: Wob, key: string, amount: number): number {
  if (!W.on || amount <= 0) return 1;
  return 1 + (noise01(W.seed, seedOf(key)) - 0.5) * 2 * amount;
}

/**
 * A gentle bow along a parameter t in [0,1], stable per face and per curve.
 * One slow wave carries the shape; a quieter, faster ripple rides on top of
 * it. `rippleWeight` trims that second harmonic back for short strokes (a
 * flat, narrow mouth), where the same ripple that reads as texture on a long
 * curve reads as a jagged zigzag on a short one.
 */
function bow(W: Wob, key: string, t: number, amount: number, rippleWeight = 0.4): number {
  if (!W.on || amount <= 0) return 0;
  const salt = seedOf(key);
  const f1 = 1 + Math.floor(noise01(W.seed, salt * 2 + 3) * 2); // 1 or 2 slow waves
  const f2 = 3 + Math.floor(noise01(W.seed, salt * 2 + 4) * 2); // a faster ripple riding on top
  const p1 = noise01(W.seed, salt * 2 + 5) * Math.PI * 2;
  const p2 = noise01(W.seed, salt * 2 + 6) * Math.PI * 2;
  return amount * (Math.sin(t * Math.PI * 2 * f1 + p1) + rippleWeight * Math.sin(t * Math.PI * 2 * f2 + p2));
}

/** How far the chalk finish is allowed to nudge a point, in face units. */
const WOBBLE_BOW = 2.6;
const WOBBLE_POINT = 1.5;
const WOBBLE_RADIUS = 0.16;

/**
 * The outline: a superellipse, not a circle, drawn from the far side of the
 * open loop round to the near side so the gap is simply the part we never draw.
 */
/** Past this the remaining sliver reads as a smudge, so we draw nothing. */
export const NO_OUTLINE_AT = 340;

export function outlinePath(p: FaceParams, W: Wob = NO_WOB): string {
  if (p.gap >= NO_OUTLINE_AT) return '';
  const n = 3.4; // squircle exponent
  const gapCentre = 315; // top right
  const half = p.gap / 2;
  const from = gapCentre + half;
  const to = gapCentre + 360 - half;
  const steps = 72;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const deg = from + ((to - from) * i) / steps;
    const t = deg * RAD;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // The pull: crown and chin move in opposite directions, so dragging the
    // top of the face stretches it like putty instead of just scaling it.
    const ry = p.height + (st < 0 ? p.squish : -p.squish);
    const x = FACE_CX + p.width * Math.sign(ct) * Math.abs(ct) ** (2 / n);
    const y = FACE_CY + ry * Math.sign(st) * Math.abs(st) ** (2 / n);
    // A hand tracing a squircle wanders in and out along its own radius, not
    // sideways across it — pushing along (ct, st) keeps the wobble from
    // folding the curve back on itself at the corners.
    const b = bow(W, 'outline', i / steps, WOBBLE_BOW);
    pts.push([x + b * ct, y + b * st]);
  }
  return smooth(pts, p.gap <= 0.5);
}

function eyePrims(p: FaceParams, side: -1 | 1, W: Wob = NO_WOB): Prim[] {
  const cx = FACE_CX + side * p.eyes.x;
  const cy = p.eyes.y;
  const s = p.eyes.size;
  const open = 1 - 0.88 * p.eyes.squint;
  const key = side < 0 ? 'eyeL' : 'eyeR';
  // Eye tilt is applied by the renderer's per-eye rotation group, not baked
  // into these coordinates — one transform beats rotating every primitive.
  const prims: Prim[] = [];

  switch (p.eyes.shape) {
    case 'round': {
      const [dx, dy] = wob(W, `${key}c`, WOBBLE_POINT * 0.6);
      const rj = radiusJitter(W, `${key}r`, WOBBLE_RADIUS);
      prims.push({
        kind: 'dot',
        cx: cx + dx,
        cy: cy + dy,
        rx: s * 0.62 * rj,
        ry: (s * 0.62 * open + 0.6) * rj,
        key,
      });
      break;
    }
    case 'bar': {
      const h = s * 1.5 * open;
      const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
      prims.push({
        kind: 'stroke',
        d: `M${r(cx + ax)},${r(cy - h / 2 + ay)} L${r(cx + bx)},${r(cy + h / 2 + by)}`,
        w: s * 0.95,
        key,
      });
      break;
    }
    case 'tick': {
      // The eye as a single flicked stroke — two of these and a curve is the
      // whole face in the sketch this style comes from.
      const h = s * 1.35 * open;
      const lean = s * 0.28;
      const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
      prims.push({
        kind: 'stroke',
        d: `M${r(cx - side * lean + ax)},${r(cy - h / 2 + ay)} L${r(cx + side * lean + bx)},${r(cy + h / 2 + by)}`,
        w: STROKE * 0.95,
        key,
      });
      break;
    }
    case 'arc': {
      // The happy squint: ∩ over the eye line.
      const w = s * 1.35;
      const lift = s * (0.75 + 0.5 * open);
      const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
      const [qx, qy] = wob(W, `${key}pq`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
      prims.push({
        kind: 'stroke',
        d:
          `M${r(cx - w + ax)},${r(cy + lift * 0.35 + ay)} ` +
          `Q${r(cx + qx)},${r(cy - lift + qy)} ${r(cx + w + bx)},${r(cy + lift * 0.35 + by)}`,
        key,
      });
      break;
    }
    case 'lash': {
      // The laughing/flirty eye: the same closed-eye arc as `arc`, with two
      // short flicks fanned off the outer corner — the detail that turns a
      // plain closed eye into an eyelash doodle.
      const w = s * 1.3;
      const lift = s * (0.62 + 0.42 * open);
      const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
      const [qx, qy] = wob(W, `${key}pq`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
      const cornerX = cx + side * w;
      const cornerY = cy + lift * 0.3;
      prims.push({
        kind: 'stroke',
        d:
          `M${r(cx - w + ax)},${r(cy + lift * 0.3 + ay)} ` +
          `Q${r(cx + qx)},${r(cy - lift + qy)} ${r(cx + w + bx)},${r(cy + lift * 0.3 + by)}`,
        key,
      });
      const lashes: [number, number, number][] = [
        [0.98, -0.22, 0.62],
        [0.45, -0.9, 0.6],
      ];
      lashes.forEach(([ux, uy, scale], i) => {
        const len = s * scale;
        const [lx, ly] = wob(W, `${key}L${i}`, WOBBLE_POINT * 0.6);
        prims.push({
          kind: 'stroke',
          d:
            `M${r(cornerX + lx)},${r(cornerY + ly)} ` +
            `L${r(cornerX + side * ux * len + lx)},${r(cornerY + uy * len + ly)}`,
          w: STROKE * 0.55,
          key: `${key}L${i}`,
        });
      });
      break;
    }
    case 'line': {
      const w = s * 1.4;
      const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
      prims.push({
        kind: 'stroke',
        d: `M${r(cx - w + ax)},${r(cy + ay)} L${r(cx + w + bx)},${r(cy + by)}`,
        key,
      });
      break;
    }
    case 'cross': {
      const w = s * 1.05;
      const [ax, ay] = wob(W, `${key}ap0`, WOBBLE_POINT);
      const [bx, by] = wob(W, `${key}ap1`, WOBBLE_POINT);
      const [cx2, cy2] = wob(W, `${key}bp0`, WOBBLE_POINT);
      const [dx2, dy2] = wob(W, `${key}bp1`, WOBBLE_POINT);
      prims.push({
        kind: 'stroke',
        d: `M${r(cx - w + ax)},${r(cy - w + ay)} L${r(cx + w + bx)},${r(cy + w + by)}`,
        key: `${key}a`,
      });
      prims.push({
        kind: 'stroke',
        d: `M${r(cx + w + cx2)},${r(cy - w + cy2)} L${r(cx - w + dx2)},${r(cy + w + dy2)}`,
        key: `${key}b`,
      });
      break;
    }
    case 'heart': {
      // Two lobes and a point. Filled rather than stroked, because a heart
      // outlined in a 10-unit mono line at cuff-hit size closes up into a blob.
      const [dx, dy] = wob(W, `${key}c`, WOBBLE_POINT * 0.8);
      const wj = radiusJitter(W, `${key}w`, WOBBLE_RADIUS);
      const hj = radiusJitter(W, `${key}h`, WOBBLE_RADIUS);
      const cx2 = cx + dx;
      const cy2 = cy + dy;
      const w = s * 0.98 * wj;
      const h = s * (0.72 + 0.42 * open) * hj;
      prims.push({
        kind: 'fill',
        d:
          `M${r(cx2)},${r(cy2 + h * 0.72)} ` +
          `C${r(cx2 - w * 1.18)},${r(cy2 - h * 0.1)} ${r(cx2 - w * 0.62)},${r(cy2 - h * 1.05)} ${r(cx2)},${r(cy2 - h * 0.3)} ` +
          `C${r(cx2 + w * 0.62)},${r(cy2 - h * 1.05)} ${r(cx2 + w * 1.18)},${r(cy2 - h * 0.1)} ${r(cx2)},${r(cy2 + h * 0.72)} Z`,
        key,
      });
      break;
    }
    case 'spiral': {
      // Two and a bit turns — the "I am not really here" eye.
      const turns = 2.25;
      const [dx, dy] = wob(W, `${key}c`, WOBBLE_POINT * 0.5);
      const pts: Pt[] = [];
      const steps = 26;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * turns * 2 * Math.PI;
        const rad = (s * 1.1 * i) / steps;
        pts.push([cx + dx + rad * Math.cos(t), cy + dy + rad * Math.sin(t)]);
      }
      prims.push({ kind: 'stroke', d: smooth(pts), w: STROKE * 0.7, key });
      break;
    }
  }
  return prims;
}

/** A shut eye: the lid as one arc. Used for the wink. */
function winkPrim(p: FaceParams, side: -1 | 1, W: Wob = NO_WOB): Prim {
  const cx = FACE_CX + side * p.eyes.x;
  const cy = p.eyes.y;
  const w = p.eyes.size * 1.25;
  const key = side < 0 ? 'eyeL' : 'eyeR';
  const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT);
  const [qx, qy] = wob(W, `${key}pq`, WOBBLE_POINT);
  const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT);
  return {
    kind: 'stroke',
    d:
      `M${r(cx - w + ax)},${r(cy + 2 + ay)} ` +
      `Q${r(cx + qx)},${r(cy - p.eyes.size * 1.15 + qy)} ${r(cx + w + bx)},${r(cy + 2 + by)}`,
    key,
  };
}

function browPrim(p: FaceParams, side: -1 | 1, W: Wob = NO_WOB): Prim {
  const cx = FACE_CX + side * p.eyes.x;
  const half = p.brows.length / 2;
  const key = side < 0 ? 'browL' : 'browR';
  // Positive angle drops the inner end. Mirror it so both brows read the same.
  const rise = Math.tan(p.brows.angle * RAD) * half;
  const inner: Pt = [cx + side * -half, p.brows.y + rise];
  const outer: Pt = [cx + side * half, p.brows.y - rise];
  const [ix, iy] = wob(W, `${key}p0`, WOBBLE_POINT);
  const [ox, oy] = wob(W, `${key}p1`, WOBBLE_POINT);
  return {
    kind: 'stroke',
    d: `M${r(inner[0] + ix)},${r(inner[1] + iy)} L${r(outer[0] + ox)},${r(outer[1] + oy)}`,
    key,
  };
}

/** The mouth line, sampled so wave and curve can coexist on one path. */
function mouthPoints(p: FaceParams, lipOffset: number, W: Wob, key: string): Pt[] {
  const half = p.mouth.width / 2;
  const steps = 18;
  // bow()'s two harmonics complete their cycles over t=0..1 regardless of how
  // physically wide the stroke is, so the same amplitude that reads as a
  // gentle bend on the outline's long loop reads as a jagged zigzag on a
  // short, flat mouth. Scaling by width against a mid-range reference (most
  // mouths run 46-74 units) keeps the wobble a fraction of the mouth rather
  // than a fixed absolute nudge.
  const mouthWobble = WOBBLE_BOW * Math.min(1.15, Math.max(0.32, p.mouth.width / 78));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = FACE_CX - half + p.mouth.width * t;
    // Parabola through the ends: 0 at both, 1 in the middle.
    const curveShape = 4 * t * (1 - t);
    const wave = Math.sin(t * Math.PI * 3) * 7 * p.mouth.wave * (0.35 + curveShape);
    const hand = bow(W, key, t, mouthWobble, 0.2);
    pts.push([x, p.mouth.y + curveShape * p.mouth.curve * 30 + wave + lipOffset * curveShape + hand]);
  }
  return pts;
}

export function mouthPrims(p: FaceParams, W: Wob = NO_WOB): Prim[] {
  if (p.mouth.open > 0.02) {
    // Open mouth: the line becomes the upper lip and a mirrored lower lip
    // closes the shape, so "open" reads as a hole rather than a thicker line.
    // The two lips get their own wobble key so they don't bow in lockstep —
    // a hand redraws the top and bottom of an open mouth as two strokes, not
    // one shape nudged sideways.
    const upper = mouthPoints(p, 0, W, 'mouth');
    const lower = mouthPoints(p, 14 + p.mouth.open * 46, W, 'mouthLower').reverse();
    const d = `${smooth(upper)} ${smooth(lower).replace(/^M/, 'L')} Z`;
    return [{ kind: 'fill', d, key: 'mouth' }];
  }
  const pts = mouthPoints(p, 0, W, 'mouth');
  let d = smooth(pts);
  if (p.mouth.flick > 0.01) {
    // Carry the stroke past the corner and upwards, the way a pen leaves the
    // paper. It is the single most recognisable thing about a hand-drawn
    // smile, and it costs one line segment.
    const [ex, ey] = pts[pts.length - 1];
    d += ` L${r(ex + p.mouth.flick * 11)},${r(ey - p.mouth.flick * 17)}`;
  }
  return [{ kind: 'stroke', d, key: 'mouth' }];
}

function markPrims(p: FaceParams, W: Wob = NO_WOB): Prim[] {
  const out: Prim[] = [];
  const eyeL = FACE_CX - p.eyes.x;
  const eyeR = FACE_CX + p.eyes.x;

  // Marks hang off the rim of the face — but with no outline there is no rim,
  // and a sweat drop parked where the edge used to be just floats in space.
  // When the face is bare they tuck in against the features instead.
  const bare = p.gap >= NO_OUTLINE_AT;
  const spanX = bare
    ? Math.min(p.width, Math.max(p.eyes.x + p.eyes.size, p.mouth.width / 2) + 12)
    : p.width;
  const spanY = bare
    ? Math.min(p.height, Math.max(p.mouth.y - FACE_CY, FACE_CY - p.eyes.y + p.eyes.size) + 10)
    : p.height;

  for (const mark of p.marks) {
    switch (mark) {
      case 'tear': {
        const [dx, dy] = wob(W, 'tear', WOBBLE_POINT * 0.7);
        const x = eyeL + dx;
        const y = p.eyes.y + p.eyes.size + 12 + dy;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y)} C${r(x + 9)},${r(y + 12)} ${r(x + 8)},${r(y + 26)} ${r(x)},${r(y + 26)} C${r(x - 8)},${r(y + 26)} ${r(x - 9)},${r(y + 12)} ${r(x)},${r(y)} Z`,
          key: 'tear',
        });
        break;
      }
      case 'sweat': {
        const [dx, dy] = wob(W, 'sweat', WOBBLE_POINT * 0.7);
        const x = FACE_CX + spanX * 0.72 + dx;
        const y = FACE_CY - spanY * 0.52 + dy;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y)} C${r(x + 8)},${r(y + 10)} ${r(x + 7)},${r(y + 22)} ${r(x)},${r(y + 22)} C${r(x - 7)},${r(y + 22)} ${r(x - 8)},${r(y + 10)} ${r(x)},${r(y)} Z`,
          key: 'sweat',
        });
        break;
      }
      case 'blush': {
        const y = p.eyes.y + p.eyes.size + 20;
        const [lx, ly] = wob(W, 'blushL', WOBBLE_POINT * 0.5);
        const [rx, ry] = wob(W, 'blushR', WOBBLE_POINT * 0.5);
        const lj = radiusJitter(W, 'blushLr', WOBBLE_RADIUS);
        const rj = radiusJitter(W, 'blushRr', WOBBLE_RADIUS);
        out.push({
          kind: 'dot',
          cx: eyeL - 6 + lx,
          cy: y + ly,
          rx: 13 * lj,
          ry: 7 * lj,
          opacity: 0.5,
          key: 'blushL',
        });
        out.push({
          kind: 'dot',
          cx: eyeR + 6 + rx,
          cy: y + ry,
          rx: 13 * rj,
          ry: 7 * rj,
          opacity: 0.5,
          key: 'blushR',
        });
        break;
      }
      case 'static': {
        // Interference across the face — the overwhelmed look.
        for (let i = 0; i < 3; i++) {
          const y = FACE_CY - 18 + i * 26;
          const w = spanX * (i === 1 ? 0.82 : 0.6);
          const key = `static${i}`;
          const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT * 0.6);
          const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT * 0.6);
          out.push({
            kind: 'stroke',
            d: `M${r(FACE_CX - w + ax)},${r(y + ay)} L${r(FACE_CX + w + bx)},${r(y + by)}`,
            w: STROKE * 0.55,
            opacity: 0.55,
            key,
          });
        }
        break;
      }
      case 'zzz': {
        const base = FACE_CX + spanX * 0.62;
        const top = FACE_CY - spanY * 0.72;
        for (let i = 0; i < 3; i++) {
          const s = 9 + i * 5;
          const x = base + i * 5;
          const y = top - i * 20;
          const key = `z${i}`;
          const [ax, ay] = wob(W, `${key}p0`, WOBBLE_POINT * 0.6);
          const [bx, by] = wob(W, `${key}p1`, WOBBLE_POINT * 0.6);
          const [cx, cy] = wob(W, `${key}p2`, WOBBLE_POINT * 0.6);
          const [dxp, dyp] = wob(W, `${key}p3`, WOBBLE_POINT * 0.6);
          out.push({
            kind: 'stroke',
            d:
              `M${r(x - s + ax)},${r(y - s + ay)} L${r(x + s + bx)},${r(y - s + by)} ` +
              `L${r(x - s + cx)},${r(y + s + cy)} L${r(x + s + dxp)},${r(y + s + dyp)}`,
            w: STROKE * 0.6,
            key,
          });
        }
        break;
      }
      case 'tongue': {
        // Hung from the middle of the mouth, which is where the mouth's own
        // bow peaks — so it follows a grin up and a grimace down instead of
        // floating at a fixed height.
        const midY = p.mouth.y + p.mouth.curve * 30;
        // Narrow and deep. Wider than this and it stops reading as a tongue
        // and starts reading as a chin — it has to clear the 10-unit mouth
        // stroke it hangs off by enough to be a separate shape.
        const w = Math.min(13, p.mouth.width * 0.2);
        const drop = w * 2.4;
        const [dx, dy] = wob(W, 'tongue', WOBBLE_POINT * 0.6);
        const wj = radiusJitter(W, 'tonguew', WOBBLE_RADIUS);
        const cx = FACE_CX + dx;
        const w2 = w * wj;
        out.push({
          kind: 'fill',
          d:
            `M${r(cx - w2)},${r(midY - 1 + dy)} ` +
            `C${r(cx - w2)},${r(midY + drop + dy)} ${r(cx + w2)},${r(midY + drop + dy)} ${r(cx + w2)},${r(midY - 1 + dy)} Z`,
          key: 'tongue',
        });
        break;
      }
      case 'sparkle': {
        const [dx, dy] = wob(W, 'sparkle', WOBBLE_POINT * 0.6);
        const x = FACE_CX + spanX * 0.74 + dx;
        const y = FACE_CY - spanY * 0.62 + dy;
        const s = 14;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y - s)} Q${r(x + 2)},${r(y - 2)} ${r(x + s)},${r(y)} Q${r(x + 2)},${r(y + 2)} ${r(x)},${r(y + s)} Q${r(x - 2)},${r(y + 2)} ${r(x - s)},${r(y)} Q${r(x - 2)},${r(y - 2)} ${r(x)},${r(y - s)} Z`,
          key: 'sparkle',
        });
        break;
      }
      case 'shades': {
        // A single bar over both eyes — filled, so it simply sits on top of
        // whatever eye shape is underneath rather than needing one. Lens
        // radius follows eye size, so bigger eyes get bigger lenses instead
        // of a mismatched fit. Each lens is a proper four-bezier rounded
        // square (the same circle-to-bezier constant the mockup tool's
        // ellipses use) — a two-bezier approximation pinches into a flattened
        // lozenge instead of reading as a lens.
        const kappa = 0.5522847498307936;
        const [dx, dy] = wob(W, 'shades', WOBBLE_POINT * 0.5);
        const rj = radiusJitter(W, 'shadesr', WOBBLE_RADIUS);
        const y = p.eyes.y + dy;
        const rx = p.eyes.size * 1.05 * rj;
        const ry = p.eyes.size * 1.15 * rj;
        const ox = rx * kappa;
        const oy = ry * kappa;
        const bridgeH = ry * 0.5;
        const lens = (lcx: number): string => {
          const cx2 = lcx + dx;
          return (
            `M${r(cx2 - rx)},${r(y)} ` +
            `C${r(cx2 - rx)},${r(y - oy)} ${r(cx2 - ox)},${r(y - ry)} ${r(cx2)},${r(y - ry)} ` +
            `C${r(cx2 + ox)},${r(y - ry)} ${r(cx2 + rx)},${r(y - oy)} ${r(cx2 + rx)},${r(y)} ` +
            `C${r(cx2 + rx)},${r(y + oy)} ${r(cx2 + ox)},${r(y + ry)} ${r(cx2)},${r(y + ry)} ` +
            `C${r(cx2 - ox)},${r(y + ry)} ${r(cx2 - rx)},${r(y + oy)} ${r(cx2 - rx)},${r(y)} Z`
          );
        };
        // The bridge overlaps a little into each lens rather than butting
        // against it exactly, so there is no hairline gap at the seam.
        const bridgeLeft = eyeL + rx * 0.55 + dx;
        const bridgeRight = eyeR - rx * 0.55 + dx;
        const bridge =
          bridgeRight > bridgeLeft
            ? `M${r(bridgeLeft)},${r(y - bridgeH / 2)} L${r(bridgeRight)},${r(y - bridgeH / 2)} ` +
              `L${r(bridgeRight)},${r(y + bridgeH / 2)} L${r(bridgeLeft)},${r(y + bridgeH / 2)} Z`
            : '';
        out.push({ kind: 'fill', d: `${lens(eyeL)} ${lens(eyeR)} ${bridge}`, key: 'shades' });
        break;
      }
    }
  }
  return out;
}

/** A rotation about a point, in the form both renderers can use. */
export interface Spin {
  deg: number;
  cx: number;
  cy: number;
}

export interface FaceGeometry {
  /** Rotation for the whole face, applied by the renderer. */
  tilt: number;
  /** Null when the loop is open all the way — a face with no outline. */
  outline: Prim | null;
  /** Eyes are kept apart from the rest so each can carry its own rotation. */
  eyesLeft: Prim[];
  eyesRight: Prim[];
  eyeRotation: { left: Spin; right: Spin };
  /** Brows, mouth and marks — nothing here needs a transform. */
  rest: Prim[];
}

export function buildFace(raw: FaceParams, finish: Finish = 'clean'): FaceGeometry {
  const p = clampFace(raw);
  // The wobble is keyed off the whole face, not off each primitive alone, so
  // the same face always wobbles the same way — a re-render, a second surface
  // (the 3D texture, a print file) or a second visit all draw the identical
  // "hand". The seed is cheap to recompute; faceSignature() already exists
  // for exactly this kind of stable identity.
  const W: Wob = finish === 'chalk' ? { seed: seedOf(faceSignature(p)), on: true } : NO_WOB;
  const outlineD = outlinePath(p, W);
  return {
    tilt: p.tilt,
    outline: outlineD ? { kind: 'stroke', d: outlineD, key: 'outline' } : null,
    // A wink is the one asymmetry the face allows: eyes are otherwise always
    // mirrored, because independent eyes read as a bug rather than a choice.
    eyesLeft: p.marks.includes('wink') ? [winkPrim(p, -1, W)] : eyePrims(p, -1, W),
    eyesRight: eyePrims(p, 1, W),
    eyeRotation: {
      left: { deg: -p.eyes.tilt, cx: FACE_CX - p.eyes.x, cy: p.eyes.y },
      right: { deg: p.eyes.tilt, cx: FACE_CX + p.eyes.x, cy: p.eyes.y },
    },
    rest: [
      ...(p.brows.on ? [browPrim(p, -1, W), browPrim(p, 1, W)] : []),
      ...mouthPrims(p, W),
      ...markPrims(p, W),
    ],
  };
}

/** Stable-ish identity for a face, used to key caches and name saved designs. */
export function faceSignature(p: FaceParams): string {
  const f = clampFace(p);
  return [
    f.width, f.height, f.squish, f.tilt, f.gap,
    f.eyes.shape, f.eyes.x, f.eyes.y, f.eyes.size, f.eyes.squint, f.eyes.tilt,
    f.brows.on ? 1 : 0, f.brows.y, f.brows.angle, f.brows.length,
    f.mouth.y, f.mouth.width, f.mouth.curve, f.mouth.open, f.mouth.wave, f.mouth.flick,
    [...f.marks].sort().join('.'),
  ]
    .map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))
    .join('|');
}
