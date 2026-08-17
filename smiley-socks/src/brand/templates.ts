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
      // Reference: plain close-set dots, not a closed lash-curve — the
      // simplest, most open-eyed happy in the sheet.
      eyes: { shape: 'round', size: 13, x: 27, y: 82 },
      mouth: { curve: 0.95, width: 74, y: 126, flick: 0.85 },
      marks: ['sparkle'],
    }),
  },
  {
    id: 'smitten',
    name: 'Smitten',
    blurb: 'Completely gone. No notes.',
    face: face({
      // Reference draws the hearts bigger and bolder than a typical eye.
      eyes: { shape: 'heart', size: 17, x: 30, y: 80 },
      mouth: { curve: 0.85, width: 56, y: 136, flick: 0.6 },
      marks: ['blush'],
    }),
  },
  {
    id: 'flirty',
    name: 'Flirty',
    blurb: "Feeling myself today, thanks for noticing.",
    face: face({
      eyes: { shape: 'lash', size: 14, x: 29, y: 80 },
      // Reference pairs the wink with a smaller, more asymmetric smirk, not
      // a full open smile.
      mouth: { curve: 0.6, width: 44, y: 130, flick: 0.75 },
      marks: ['blush'],
    }),
  },
  {
    id: 'relieved',
    name: 'Relieved',
    blurb: 'It is over. It went fine.',
    face: face({
      eyes: { shape: 'arc', size: 14, y: 86, squint: 0.55 },
      // Reference: the closed-eye happy pairs with a real open laugh, not a
      // closed curve — the exhale is audible.
      mouth: { curve: 0.55, width: 60, open: 0.25, y: 132, flick: 0.5 },
      marks: ['sweat'],
    }),
  },
  {
    id: 'crushed',
    name: 'Crushed',
    blurb: 'That one landed. Give it a minute.',
    face: face({
      squish: -12,
      // Reference eyes droop lower and closer together than a simple arc.
      eyes: { shape: 'arc', size: 13, x: 27, y: 90, squint: 0.62, tilt: 18 },
      brows: { on: true, y: 62, angle: -32, length: 28 },
      mouth: { curve: -0.9, width: 50, y: 152 },
      marks: ['tear'],
    }),
  },
  {
    id: 'rattled',
    name: 'Rattled',
    blurb: 'That was too close. Give me a second.',
    face: face({
      // Reference eyes are wider and closer to the top of the face — the
      // startled look reads bigger than a standard round eye.
      eyes: { shape: 'round', size: 15, y: 80 },
      brows: { on: true, y: 44, angle: -30, length: 26 },
      mouth: { curve: -0.1, width: 46, open: 0.5, y: 138 },
      marks: ['teeth'],
    }),
  },
  {
    id: 'silly',
    name: 'Silly',
    blurb: 'No notes. No dignity either.',
    face: face({
      tilt: 7,
      eyes: { shape: 'round', size: 14, x: 31, y: 80 },
      // Reference mouth gapes almost the full width of the face.
      mouth: { curve: 0.9, width: 76, open: 0.6, y: 134 },
    }),
  },
  {
    id: 'queasy',
    name: 'Queasy',
    blurb: 'Something is not sitting right.',
    face: face({
      tilt: -6,
      squish: -5,
      eyes: { shape: 'bar', size: 12, y: 86, squint: 0.55 },
      brows: { on: true, y: 60, angle: -14, length: 24 },
      mouth: { curve: -0.3, width: 52, wave: 0.9, y: 142 },
      marks: ['sweat'],
    }),
  },
  {
    id: 'goofy',
    name: 'Goofy',
    blurb: 'Being normal was not working out.',
    face: face({
      // Reference tilts the whole face further off-axis for the dizzy read.
      tilt: -10,
      eyes: { shape: 'cross', size: 12, x: 30, y: 80 },
      mouth: { curve: 0.55, width: 62, y: 126, flick: 0.8 },
      marks: ['tongue'],
    }),
  },
  {
    id: 'sly',
    name: 'Sly',
    blurb: "Fine. Mostly. Ask me later and I'll deny it.",
    face: face({
      tilt: -3,
      eyes: { shape: 'tick', size: 14, y: 84 },
      // Reference gives the smirk more room — bolder, more asymmetric.
      mouth: { curve: 0.55, width: 64, y: 130, flick: 1 },
      marks: ['wink'],
    }),
  },
  {
    id: 'starstruck',
    name: 'Starstruck',
    blurb: "Somehow this is going well and I don't trust it yet.",
    face: face({
      eyes: { shape: 'star', size: 15, y: 82 },
      // Reference mouth is open, not a closed curve — teeth showing.
      mouth: { curve: 0.85, width: 60, open: 0.4, y: 126, flick: 0.6 },
    }),
  },
  {
    id: 'curious',
    name: 'Curious',
    blurb: 'Hang on. Say that again.',
    face: face({
      tilt: -8,
      eyes: { shape: 'round', size: 14, x: 29, y: 80 },
      // Reference's questioning brow sits higher and steeper.
      brows: { on: true, y: 42, angle: -26, length: 24 },
      mouth: { curve: 0.15, width: 30, open: 0.3, y: 134 },
    }),
  },
  {
    id: 'smug',
    name: 'Smug',
    blurb: 'Called it. Not going to mention it again — much.',
    face: face({
      tilt: 5,
      eyes: { shape: 'line', size: 13, y: 84, tilt: 18 },
      brows: { on: true, y: 58, angle: -20, length: 26 },
      mouth: { curve: 0.4, width: 48, y: 132, flick: 0.9 },
    }),
  },
  {
    id: 'hopeful',
    name: 'Hopeful',
    blurb: 'Better than last week. Counting it.',
    face: face({
      eyes: { shape: 'arc', size: 14, y: 84, squint: 0.15, tilt: -6 },
      // Reference: a real open grin, not a closed curve.
      mouth: { curve: 0.6, width: 60, open: 0.35, y: 128, flick: 0.7 },
      marks: ['sparkle'],
    }),
  },
  {
    id: 'melancholy',
    name: 'Melancholy',
    blurb: 'Somewhere else today. Not gone, just drifting.',
    face: face({
      tilt: -6,
      squish: -5,
      eyes: { shape: 'line', size: 12, y: 84, tilt: 15 },
      // Reference's frown is one clean stroke, not a wavering line.
      mouth: { curve: -0.3, width: 50, y: 134, wave: 0.1 },
    }),
  },
  {
    id: 'bored',
    name: 'Bored',
    blurb: 'Waiting for something to happen. Anything.',
    face: face({
      tilt: -4,
      eyes: { shape: 'bar', size: 13, y: 86, squint: 0.62 },
      brows: { on: true, y: 60, angle: -4, length: 22 },
      // Reference mouth is dead flat — no curve at all.
      mouth: { curve: 0, width: 40, y: 140 },
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
      // Reference brows are sharper and the mouth roars wider open.
      brows: { on: true, y: 58, angle: 38, length: 30 },
      mouth: { curve: -0.5, width: 62, open: 0.45, y: 142 },
    }),
  },
  {
    id: 'sobbing',
    name: 'Sobbing',
    blurb: "Not holding it together right now, and that's allowed.",
    face: face({
      squish: -8,
      eyes: { shape: 'bar', size: 13, y: 88, squint: 0.5 },
      brows: { on: true, y: 60, angle: -22, length: 26 },
      // Reference mouth quivers rather than gapes.
      mouth: { curve: -0.6, width: 40, open: 0.2, wave: 0.3, y: 148 },
      marks: ['bawling'],
    }),
  },
  {
    id: 'proud',
    name: 'Proud',
    blurb: 'Did a hard thing. Telling everyone.',
    face: face({
      squish: 4,
      eyes: { shape: 'arc', size: 14, y: 80, squint: 0.15 },
      brows: { on: true, y: 44, angle: -6, length: 26 },
      // Reference mouth is wide open, not a closed grin.
      mouth: { curve: 0.75, width: 66, open: 0.3, y: 126, flick: 0.7 },
      marks: ['sparkle'],
    }),
  },
  {
    id: 'shy',
    name: 'Shy',
    blurb: "Would rather not, but here I am.",
    face: face({
      width: 66,
      // Reference's closed-eye, blush-flanked version reads softer — eyes
      // more fully shut.
      eyes: { shape: 'arc', size: 11, y: 90, squint: 0.45, tilt: 8 },
      mouth: { curve: 0.2, width: 34, y: 136, flick: 0.3 },
      marks: ['blush'],
    }),
  },
  {
    id: 'unbothered',
    name: 'Unbothered',
    blurb: "Whatever it is, it's not getting in today.",
    face: face({
      marks: ['shades'],
      mouth: { curve: 0.15, width: 50, y: 130 },
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
    id: 'lonely',
    name: 'Lonely',
    blurb: 'Room full of people. Still.',
    face: face({
      width: 64,
      eyes: { shape: 'round', size: 9, x: 34, y: 86 },
      mouth: { curve: -0.35, width: 36, y: 146 },
    }),
  },
  {
    id: 'determined',
    name: 'Determined',
    blurb: 'Not brilliant, not quitting.',
    face: face({
      eyes: { shape: 'bar', size: 12, y: 84, squint: 0.3 },
      brows: { on: true, y: 56, angle: 24, length: 28 },
      mouth: { curve: 0.08, width: 54, y: 138 },
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

// The face a fresh design starts as, everywhere one is needed with no other
// steer — the studio with no template in the URL, a brand-new cart line. It
// leads the reordered shelf for the same reason: this is the face the brand
// puts forward by default now.
export const DEFAULT_TEMPLATE = TEMPLATES.find((t) => t.id === 'sunny')!;

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
