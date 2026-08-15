/*
 * The template shelf.
 *
 * Starting points, not the product. Each one is a full FaceParams, so the
 * moment you drag a handle in the studio you are editing these same numbers —
 * there is no "preset mode" to leave.
 *
 * The range is deliberate. A mood picker that offers happy, fine and sad
 * flatters nobody; most days are Fuzzy or Wired, and a sock that can say so is
 * the entire point of the brand.
 */

import type { FaceParams } from './face';

const BASE: FaceParams = {
  width: 72,
  height: 72,
  squish: 0,
  tilt: 0,
  // No outline, the way these faces get drawn by hand: two eyes and a mouth,
  // floating. `gap` is the opening in the loop and 360 leaves nothing of it —
  // the studio's Outline control puts a circle back for anyone who wants one.
  gap: 360,
  eyes: { shape: 'bar', x: 28, y: 82, size: 13, squint: 0, tilt: 0 },
  brows: { on: false, y: 52, angle: 0, length: 24 },
  mouth: { y: 128, width: 62, curve: 0.5, open: 0, wave: 0, flick: 0 },
  marks: [],
};

/** Deep-merge a template over the base so each entry only states what differs. */
function face(over: DeepPartial<FaceParams>): FaceParams {
  return {
    ...BASE,
    ...over,
    eyes: { ...BASE.eyes, ...over.eyes },
    brows: { ...BASE.brows, ...over.brows },
    mouth: { ...BASE.mouth, ...over.mouth },
    marks: (over.marks ?? BASE.marks) as FaceParams['marks'],
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

export interface Template {
  id: string;
  name: string;
  /** One line, in the wearer's voice. Shown under the face in the picker. */
  blurb: string;
  face: FaceParams;
}

export const TEMPLATES: Template[] = [
  {
    id: 'sunny',
    name: 'Sunny',
    blurb: 'Genuinely good. Rare enough to print.',
    face: face({
      eyes: { shape: 'arc', size: 15, y: 84, squint: 0.1 },
      mouth: { curve: 0.95, width: 74, y: 126, flick: 0.85 },
      marks: ['sparkle'],
    }),
  },
  {
    id: 'steady',
    name: 'Steady',
    blurb: "Nothing dramatic. I'll take it.",
    face: face({
      eyes: { shape: 'tick', size: 13 },
      mouth: { curve: 0.42, width: 58, flick: 0.5 },
    }),
  },
  {
    id: 'fuzzy',
    name: 'Fuzzy',
    blurb: "Present, technically. Not sure what I'd say if you asked.",
    face: face({
      eyes: { shape: 'line', size: 12, y: 86 },
      mouth: { curve: 0.05, width: 46, wave: 0.35, y: 132 },
    }),
  },
  {
    id: 'wired',
    name: 'Wired',
    blurb: 'Everything is fine and I have said so eleven times.',
    face: face({
      squish: 6,
      eyes: { shape: 'round', size: 15, x: 30, y: 80 },
      brows: { on: true, y: 48, angle: -18, length: 26 },
      mouth: { curve: -0.1, width: 52, wave: 0.85, y: 134 },
      marks: ['sweat'],
    }),
  },
  {
    id: 'heavy',
    name: 'Heavy',
    blurb: 'Low. Not looking for advice.',
    face: face({
      squish: -8,
      eyes: { shape: 'bar', size: 13, y: 88, squint: 0.45 },
      brows: { on: true, y: 60, angle: -26, length: 26 },
      mouth: { curve: -0.72, width: 58, y: 148 },
      marks: ['tear'],
    }),
  },
  {
    id: 'static',
    name: 'Static',
    blurb: 'Too much input. All of it at once.',
    face: face({
      tilt: -5,
      eyes: { shape: 'round', size: 11, x: 32, y: 78 },
      mouth: { curve: -0.2, width: 54, wave: 1, open: 0.25, y: 138 },
      marks: ['static'],
    }),
  },
  {
    id: 'tender',
    name: 'Tender',
    blurb: 'Soft today. Be gentle, including you.',
    face: face({
      eyes: { shape: 'arc', size: 13, y: 86, squint: 0.2 },
      mouth: { curve: 0.34, width: 46, y: 132, flick: 0.4 },
      marks: ['blush'],
    }),
  },
  {
    id: 'fierce',
    name: 'Fierce',
    blurb: 'Running hot. Do not test it.',
    face: face({
      tilt: 4,
      width: 76,
      eyes: { shape: 'bar', size: 14, y: 84, squint: 0.35, tilt: 22 },
      brows: { on: true, y: 58, angle: 32, length: 30 },
      mouth: { curve: -0.5, width: 62, open: 0.3, y: 142 },
    }),
  },
  {
    id: 'drained',
    name: 'Drained',
    blurb: 'Out of battery. Not out of the woods.',
    face: face({
      squish: -6,
      eyes: { shape: 'bar', size: 14, y: 88, squint: 0.82 },
      brows: { on: true, y: 62, angle: -10, length: 24 },
      mouth: { curve: -0.28, width: 44, y: 146 },
      marks: ['zzz'],
    }),
  },
  {
    id: 'hopeful',
    name: 'Hopeful',
    blurb: 'Better than last week. Counting it.',
    face: face({
      eyes: { shape: 'arc', size: 14, y: 84, squint: 0.15, tilt: -6 },
      mouth: { curve: 0.6, width: 56, y: 128, flick: 0.7 },
      marks: ['sparkle'],
    }),
  },
  {
    id: 'loved',
    name: 'Loved',
    blurb: 'Someone showed up. It worked.',
    face: face({
      eyes: { shape: 'arc', size: 15, y: 86, squint: 0.25 },
      mouth: { curve: 0.8, width: 66, y: 128, flick: 0.6 },
      marks: ['blush', 'sparkle'],
    }),
  },
  {
    id: 'sly',
    name: 'Sly',
    blurb: "Fine. Mostly. Ask me later and I'll deny it.",
    face: face({
      tilt: -3,
      eyes: { shape: 'tick', size: 14, y: 84 },
      mouth: { curve: 0.55, width: 60, y: 130, flick: 1 },
      marks: ['wink'],
    }),
  },
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'Watching myself from across the room.',
    face: face({
      eyes: { shape: 'spiral', size: 14, x: 30, y: 82 },
      mouth: { curve: 0, width: 40, y: 138 },
    }),
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[1]; // Steady

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Deep copy, so editing a design can never mutate the shelf. */
export function cloneFace(f: FaceParams): FaceParams {
  return {
    ...f,
    eyes: { ...f.eyes },
    brows: { ...f.brows },
    mouth: { ...f.mouth },
    marks: [...f.marks],
  };
}
