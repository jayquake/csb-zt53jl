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

export type EyeShape = 'bar' | 'tick' | 'round' | 'arc' | 'cross' | 'line' | 'spiral' | 'heart';
export type Mark = 'tear' | 'sweat' | 'blush' | 'static' | 'zzz' | 'sparkle' | 'wink' | 'tongue';

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

/**
 * The outline: a superellipse, not a circle, drawn from the far side of the
 * open loop round to the near side so the gap is simply the part we never draw.
 */
/** Past this the remaining sliver reads as a smudge, so we draw nothing. */
export const NO_OUTLINE_AT = 340;

export function outlinePath(p: FaceParams): string {
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
    pts.push([
      FACE_CX + p.width * Math.sign(ct) * Math.abs(ct) ** (2 / n),
      FACE_CY + ry * Math.sign(st) * Math.abs(st) ** (2 / n),
    ]);
  }
  return smooth(pts, p.gap <= 0.5);
}

function eyePrims(p: FaceParams, side: -1 | 1): Prim[] {
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
      prims.push({ kind: 'dot', cx, cy, rx: s * 0.62, ry: s * 0.62 * open + 0.6, key });
      break;
    }
    case 'bar': {
      const h = s * 1.5 * open;
      prims.push({
        kind: 'stroke',
        d: `M${r(cx)},${r(cy - h / 2)} L${r(cx)},${r(cy + h / 2)}`,
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
      prims.push({
        kind: 'stroke',
        d: `M${r(cx - side * lean)},${r(cy - h / 2)} L${r(cx + side * lean)},${r(cy + h / 2)}`,
        w: STROKE * 0.95,
        key,
      });
      break;
    }
    case 'arc': {
      // The happy squint: ∩ over the eye line.
      const w = s * 1.35;
      const lift = s * (0.75 + 0.5 * open);
      prims.push({
        kind: 'stroke',
        d: `M${r(cx - w)},${r(cy + lift * 0.35)} Q${r(cx)},${r(cy - lift)} ${r(cx + w)},${r(cy + lift * 0.35)}`,
        key,
      });
      break;
    }
    case 'line': {
      const w = s * 1.4;
      prims.push({ kind: 'stroke', d: `M${r(cx - w)},${r(cy)} L${r(cx + w)},${r(cy)}`, key });
      break;
    }
    case 'cross': {
      const w = s * 1.05;
      prims.push({ kind: 'stroke', d: `M${r(cx - w)},${r(cy - w)} L${r(cx + w)},${r(cy + w)}`, key: `${key}a` });
      prims.push({ kind: 'stroke', d: `M${r(cx + w)},${r(cy - w)} L${r(cx - w)},${r(cy + w)}`, key: `${key}b` });
      break;
    }
    case 'heart': {
      // Two lobes and a point. Filled rather than stroked, because a heart
      // outlined in a 10-unit mono line at cuff-hit size closes up into a blob.
      const w = s * 0.98;
      const h = s * (0.72 + 0.42 * open);
      prims.push({
        kind: 'fill',
        d:
          `M${r(cx)},${r(cy + h * 0.72)} ` +
          `C${r(cx - w * 1.18)},${r(cy - h * 0.1)} ${r(cx - w * 0.62)},${r(cy - h * 1.05)} ${r(cx)},${r(cy - h * 0.3)} ` +
          `C${r(cx + w * 0.62)},${r(cy - h * 1.05)} ${r(cx + w * 1.18)},${r(cy - h * 0.1)} ${r(cx)},${r(cy + h * 0.72)} Z`,
        key,
      });
      break;
    }
    case 'spiral': {
      // Two and a bit turns — the "I am not really here" eye.
      const turns = 2.25;
      const pts: Pt[] = [];
      const steps = 26;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * turns * 2 * Math.PI;
        const rad = (s * 1.1 * i) / steps;
        pts.push([cx + rad * Math.cos(t), cy + rad * Math.sin(t)]);
      }
      prims.push({ kind: 'stroke', d: smooth(pts), w: STROKE * 0.7, key });
      break;
    }
  }
  return prims;
}

/** A shut eye: the lid as one arc. Used for the wink. */
function winkPrim(p: FaceParams, side: -1 | 1): Prim {
  const cx = FACE_CX + side * p.eyes.x;
  const cy = p.eyes.y;
  const w = p.eyes.size * 1.25;
  return {
    kind: 'stroke',
    d: `M${r(cx - w)},${r(cy + 2)} Q${r(cx)},${r(cy - p.eyes.size * 1.15)} ${r(cx + w)},${r(cy + 2)}`,
    key: side < 0 ? 'eyeL' : 'eyeR',
  };
}

function browPrim(p: FaceParams, side: -1 | 1): Prim {
  const cx = FACE_CX + side * p.eyes.x;
  const half = p.brows.length / 2;
  // Positive angle drops the inner end. Mirror it so both brows read the same.
  const rise = Math.tan(p.brows.angle * RAD) * half;
  const inner: Pt = [cx + side * -half, p.brows.y + rise];
  const outer: Pt = [cx + side * half, p.brows.y - rise];
  return {
    kind: 'stroke',
    d: `M${r(inner[0])},${r(inner[1])} L${r(outer[0])},${r(outer[1])}`,
    key: side < 0 ? 'browL' : 'browR',
  };
}

/** The mouth line, sampled so wave and curve can coexist on one path. */
function mouthPoints(p: FaceParams, lipOffset = 0): Pt[] {
  const half = p.mouth.width / 2;
  const steps = 18;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = FACE_CX - half + p.mouth.width * t;
    // Parabola through the ends: 0 at both, 1 in the middle.
    const bow = 4 * t * (1 - t);
    const wave = Math.sin(t * Math.PI * 3) * 7 * p.mouth.wave * (0.35 + bow);
    pts.push([x, p.mouth.y + bow * p.mouth.curve * 30 + wave + lipOffset * bow]);
  }
  return pts;
}

export function mouthPrims(p: FaceParams): Prim[] {
  if (p.mouth.open > 0.02) {
    // Open mouth: the line becomes the upper lip and a mirrored lower lip
    // closes the shape, so "open" reads as a hole rather than a thicker line.
    const upper = mouthPoints(p);
    const lower = mouthPoints(p, 14 + p.mouth.open * 46).reverse();
    const d = `${smooth(upper)} ${smooth(lower).replace(/^M/, 'L')} Z`;
    return [{ kind: 'fill', d, key: 'mouth' }];
  }
  const pts = mouthPoints(p);
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

function markPrims(p: FaceParams): Prim[] {
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
        const x = eyeL;
        const y = p.eyes.y + p.eyes.size + 12;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y)} C${r(x + 9)},${r(y + 12)} ${r(x + 8)},${r(y + 26)} ${r(x)},${r(y + 26)} C${r(x - 8)},${r(y + 26)} ${r(x - 9)},${r(y + 12)} ${r(x)},${r(y)} Z`,
          key: 'tear',
        });
        break;
      }
      case 'sweat': {
        const x = FACE_CX + spanX * 0.72;
        const y = FACE_CY - spanY * 0.52;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y)} C${r(x + 8)},${r(y + 10)} ${r(x + 7)},${r(y + 22)} ${r(x)},${r(y + 22)} C${r(x - 7)},${r(y + 22)} ${r(x - 8)},${r(y + 10)} ${r(x)},${r(y)} Z`,
          key: 'sweat',
        });
        break;
      }
      case 'blush': {
        const y = p.eyes.y + p.eyes.size + 20;
        out.push({ kind: 'dot', cx: eyeL - 6, cy: y, rx: 13, ry: 7, opacity: 0.5, key: 'blushL' });
        out.push({ kind: 'dot', cx: eyeR + 6, cy: y, rx: 13, ry: 7, opacity: 0.5, key: 'blushR' });
        break;
      }
      case 'static': {
        // Interference across the face — the overwhelmed look.
        for (let i = 0; i < 3; i++) {
          const y = FACE_CY - 18 + i * 26;
          const w = spanX * (i === 1 ? 0.82 : 0.6);
          out.push({
            kind: 'stroke',
            d: `M${r(FACE_CX - w)},${r(y)} L${r(FACE_CX + w)},${r(y)}`,
            w: STROKE * 0.55,
            opacity: 0.55,
            key: `static${i}`,
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
          out.push({
            kind: 'stroke',
            d: `M${r(x - s)},${r(y - s)} L${r(x + s)},${r(y - s)} L${r(x - s)},${r(y + s)} L${r(x + s)},${r(y + s)}`,
            w: STROKE * 0.6,
            key: `z${i}`,
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
        out.push({
          kind: 'fill',
          d:
            `M${r(FACE_CX - w)},${r(midY - 1)} ` +
            `C${r(FACE_CX - w)},${r(midY + drop)} ${r(FACE_CX + w)},${r(midY + drop)} ${r(FACE_CX + w)},${r(midY - 1)} Z`,
          key: 'tongue',
        });
        break;
      }
      case 'sparkle': {
        const x = FACE_CX + spanX * 0.74;
        const y = FACE_CY - spanY * 0.62;
        const s = 14;
        out.push({
          kind: 'fill',
          d: `M${r(x)},${r(y - s)} Q${r(x + 2)},${r(y - 2)} ${r(x + s)},${r(y)} Q${r(x + 2)},${r(y + 2)} ${r(x)},${r(y + s)} Q${r(x - 2)},${r(y + 2)} ${r(x - s)},${r(y)} Q${r(x - 2)},${r(y - 2)} ${r(x)},${r(y - s)} Z`,
          key: 'sparkle',
        });
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

export function buildFace(raw: FaceParams): FaceGeometry {
  const p = clampFace(raw);
  const outlineD = outlinePath(p);
  return {
    tilt: p.tilt,
    outline: outlineD ? { kind: 'stroke', d: outlineD, key: 'outline' } : null,
    // A wink is the one asymmetry the face allows: eyes are otherwise always
    // mirrored, because independent eyes read as a bug rather than a choice.
    eyesLeft: p.marks.includes('wink') ? [winkPrim(p, -1)] : eyePrims(p, -1),
    eyesRight: eyePrims(p, 1),
    eyeRotation: {
      left: { deg: -p.eyes.tilt, cx: FACE_CX - p.eyes.x, cy: p.eyes.y },
      right: { deg: p.eyes.tilt, cx: FACE_CX + p.eyes.x, cy: p.eyes.y },
    },
    rest: [
      ...(p.brows.on ? [browPrim(p, -1), browPrim(p, 1)] : []),
      ...mouthPrims(p),
      ...markPrims(p),
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
