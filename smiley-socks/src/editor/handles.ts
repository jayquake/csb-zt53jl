/*
 * The grab points.
 *
 * Each handle knows two things: where it sits on the current face, and what a
 * face looks like when you drag it to a given point. Both are pure functions
 * of the face, and every drag is absolute — the handle goes where your finger
 * is — which is what makes the same code serve arrow-key nudging (drag to
 * "where I am now, plus 2") and a reset (drag back to the template's value).
 *
 * "Keep pulling" is the through-line of the feel: when a parameter hits its
 * limit the extra travel spills into a second one, so the crown stretches
 * after the face stops growing and the mouth opens after the frown bottoms
 * out. Pulling harder always does *something*, and nothing ever leaves the
 * clamped range.
 */

import { clampTo, FACE_CX, FACE_CY, NO_OUTLINE_AT, type FaceParams } from '../brand/face';
import { cloneFace } from '../brand/templates';

export interface Point {
  x: number;
  y: number;
}

export interface Handle {
  id: string;
  /** Announced to screen readers and shown as the on-canvas hint. */
  label: string;
  hint: string;
  /** Where the grab dot sits right now. */
  at(f: FaceParams): Point;
  /** The face you get by dragging this handle to `p`. */
  drag(f: FaceParams, p: Point): FaceParams;
  /** Put this handle's parameters back to the template's. */
  reset(f: FaceParams, base: FaceParams): FaceParams;
  /** Only offered when this returns true (brows can be switched off). */
  when?(f: FaceParams): boolean;
}

function edit(f: FaceParams, patch: Partial<FaceParams>): FaceParams {
  return { ...cloneFace(f), ...patch };
}

/** Clamp `raw`, and hand back whatever travel did not fit. */
function spill(raw: number, key: Parameters<typeof clampTo>[0]): { value: number; over: number } {
  const value = clampTo(key, raw);
  return { value, over: raw - value };
}

const eyeCentre = (f: FaceParams, side: -1 | 1) => FACE_CX + side * f.eyes.x;

function eyeHandle(side: -1 | 1): Handle {
  const name = side < 0 ? 'Left eye' : 'Right eye';
  return {
    id: side < 0 ? 'eyeL' : 'eyeR',
    label: name,
    hint: 'Drag to move both eyes',
    at: (f) => ({ x: eyeCentre(f, side), y: f.eyes.y }),
    // Eyes move as a pair. Independent eyes look like a bug rather than a
    // choice, and the mirror is what keeps a hand-dragged face on-brand.
    drag: (f, p) =>
      edit(f, {
        eyes: {
          ...f.eyes,
          x: clampTo('eyeX', Math.abs(p.x - FACE_CX)),
          y: clampTo('eyeY', p.y),
        },
      }),
    reset: (f, base) => edit(f, { eyes: { ...f.eyes, x: base.eyes.x, y: base.eyes.y } }),
  };
}

const EYE_SIZE_OFFSET = 13;

/**
 * With the outline switched off there is nothing on screen for the crown,
 * chin and side handles to move, so they step aside rather than sitting there
 * doing nothing visible.
 */
const hasOutline = (f: FaceParams): boolean => f.gap < NO_OUTLINE_AT;

export const HANDLES: Handle[] = [
  {
    id: 'crown',
    label: 'Top of the head',
    hint: 'Pull up to grow, keep pulling to stretch',
    when: hasOutline,
    at: (f) => ({ x: FACE_CX, y: FACE_CY - f.height - f.squish }),
    drag: (f, p) => {
      const { value: height, over } = spill(FACE_CY - p.y, 'height');
      return edit(f, { height, squish: clampTo('squish', over) });
    },
    reset: (f, base) => edit(f, { height: base.height, squish: base.squish }),
  },
  {
    id: 'chin',
    label: 'Chin',
    hint: 'Pull down to grow, keep pulling to stretch',
    when: hasOutline,
    at: (f) => ({ x: FACE_CX, y: FACE_CY + f.height - f.squish }),
    drag: (f, p) => {
      const { value: height, over } = spill(p.y - FACE_CY, 'height');
      return edit(f, { height, squish: clampTo('squish', -over) });
    },
    reset: (f, base) => edit(f, { height: base.height, squish: base.squish }),
  },
  {
    id: 'side',
    label: 'Side of the face',
    hint: 'Drag out to widen, in to narrow',
    when: hasOutline,
    at: (f) => ({ x: FACE_CX + f.width, y: FACE_CY }),
    drag: (f, p) => edit(f, { width: clampTo('width', p.x - FACE_CX) }),
    reset: (f, base) => edit(f, { width: base.width }),
  },
  eyeHandle(-1),
  eyeHandle(1),
  {
    id: 'eyeSize',
    label: 'Eye size',
    hint: 'Out for bigger, down to close them',
    at: (f) => ({
      x: eyeCentre(f, 1) + f.eyes.size + EYE_SIZE_OFFSET,
      y: f.eyes.y + f.eyes.squint * 26,
    }),
    drag: (f, p) =>
      edit(f, {
        eyes: {
          ...f.eyes,
          size: clampTo('eyeSize', p.x - eyeCentre(f, 1) - EYE_SIZE_OFFSET),
          squint: clampTo('eyeSquint', (p.y - f.eyes.y) / 26),
        },
      }),
    reset: (f, base) => edit(f, { eyes: { ...f.eyes, size: base.eyes.size, squint: base.eyes.squint } }),
  },
  browHandle(-1),
  browHandle(1),
  {
    id: 'mouthL',
    label: 'Left mouth corner',
    hint: 'Drag to set width and height',
    at: (f) => ({ x: FACE_CX - f.mouth.width / 2, y: f.mouth.y }),
    drag: (f, p) => mouthCorner(f, p),
    reset: (f, base) => edit(f, { mouth: { ...f.mouth, width: base.mouth.width, y: base.mouth.y } }),
  },
  {
    id: 'mouthR',
    label: 'Right mouth corner',
    hint: 'Drag to set width and height',
    at: (f) => ({ x: FACE_CX + f.mouth.width / 2, y: f.mouth.y }),
    drag: (f, p) => mouthCorner(f, p),
    reset: (f, base) => edit(f, { mouth: { ...f.mouth, width: base.mouth.width, y: base.mouth.y } }),
  },
  {
    id: 'mouthC',
    label: 'Middle of the mouth',
    hint: 'Down to frown, keep pulling to open, sideways to wobble',
    at: (f) => ({
      x: FACE_CX,
      y: f.mouth.y + f.mouth.curve * 30 + f.mouth.open * 30,
    }),
    drag: (f, p) => {
      // Vertical travel is a curve first; anything past a full smile or frown
      // opens the mouth instead of being thrown away.
      const raw = (p.y - f.mouth.y) / 30;
      const curve = clampTo('mouthCurve', raw);
      const over = Math.abs(raw - curve);
      return edit(f, {
        mouth: {
          ...f.mouth,
          curve,
          open: clampTo('mouthOpen', over),
          // A little sideways slop shouldn't add a wobble, so the first few
          // units of horizontal travel are dead.
          wave: clampTo('mouthWave', (Math.abs(p.x - FACE_CX) - 8) / 40),
        },
      });
    },
    reset: (f, base) =>
      edit(f, {
        mouth: { ...f.mouth, curve: base.mouth.curve, open: base.mouth.open, wave: base.mouth.wave },
      }),
  },
];

function mouthCorner(f: FaceParams, p: Point): FaceParams {
  return edit(f, {
    mouth: {
      ...f.mouth,
      width: clampTo('mouthWidth', Math.abs(p.x - FACE_CX) * 2),
      y: clampTo('mouthY', p.y),
    },
  });
}

function browHandle(side: -1 | 1): Handle {
  return {
    id: side < 0 ? 'browL' : 'browR',
    label: side < 0 ? 'Left brow' : 'Right brow',
    hint: 'Up and down for height, sideways for angle',
    when: (f) => f.brows.on,
    at: (f) => ({ x: eyeCentre(f, side), y: f.brows.y }),
    drag: (f, p) =>
      edit(f, {
        brows: {
          ...f.brows,
          y: clampTo('browY', p.y),
          // Dragging a brow towards the nose drops its inner end — the angry
          // direction — whichever brow you grabbed.
          angle: clampTo('browAngle', -side * (p.x - eyeCentre(f, side)) * 1.8),
        },
      }),
    reset: (f, base) => edit(f, { brows: { ...f.brows, y: base.brows.y, angle: base.brows.angle } }),
  };
}

export function visibleHandles(f: FaceParams): Handle[] {
  return HANDLES.filter((h) => !h.when || h.when(f));
}

/** Arrow-key nudge: the same drag, two units from where the handle already is. */
export function nudge(handle: Handle, f: FaceParams, dx: number, dy: number): FaceParams {
  const at = handle.at(f);
  return handle.drag(f, { x: at.x + dx, y: at.y + dy });
}
