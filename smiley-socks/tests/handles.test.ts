/*
 * The editor's contract, tested without a browser: handles are pure functions
 * of the face, so everything that makes a drag feel right can be asserted here
 * rather than eyeballed.
 */

import { describe, expect, it } from 'vitest';
import { clampFace, FACE_CX, FACE_LIMITS, type FaceParams } from '../src/brand/face';
import { HANDLES, nudge, visibleHandles } from '../src/editor/handles';
import { cloneFace, TEMPLATES } from '../src/brand/templates';

// Faces are outline-less by default now, so this fixture puts an outline back
// on: it exists to exercise every handle, including the three that only appear
// when there is an outline to pull.
const base: FaceParams = {
  ...cloneFace(TEMPLATES[1].face),
  gap: 26,
  brows: { on: true, y: 52, angle: 0, length: 24 },
};

describe('drag handles', () => {
  it('puts the handle where you dropped it, along the axes it controls', () => {
    // Round trip: drag a handle, and it should report a position back at the
    // point you dropped it — that is what "the dot stays under your finger"
    // means in code.
    //
    // Some handles are deliberately axis-locked. The crown and chin run up and
    // down the centre line, the side runs across, and the mouth's middle
    // handle stays centred because its sideways travel sets the wobble rather
    // than moving the dot. A brow handle is the same: it stays above its eye
    // and its sideways travel sets the angle. Those axes are listed rather
    // than asserted.
    const tracks: Record<string, ('x' | 'y')[]> = {
      crown: ['y'],
      chin: ['y'],
      side: ['x'],
      mouthC: ['y'],
      browL: ['y'],
      browR: ['y'],
    };

    for (const h of visibleHandles(base)) {
      const at = h.at(base);
      const target = { x: at.x + 6, y: at.y + 6 };
      const landed = h.at(clampFace(h.drag(base, target)));
      for (const axis of tracks[h.id] ?? ['x', 'y']) {
        expect(landed[axis], `${h.id}.${axis}`).toBeCloseTo(target[axis], 1);
      }
    }
  });

  it('never produces an out-of-range face, however far you pull', () => {
    for (const h of visibleHandles(base)) {
      for (const point of [
        { x: -5000, y: -5000 },
        { x: 5000, y: 5000 },
        { x: 0, y: 5000 },
        { x: 5000, y: 0 },
      ]) {
        const f = h.drag(base, point);
        expect(f, h.id).toEqual(clampFace(f));
      }
    }
  });

  it('moves both eyes together, mirrored', () => {
    const h = HANDLES.find((x) => x.id === 'eyeR')!;
    const moved = h.drag(base, { x: FACE_CX + 44, y: 70 });
    expect(moved.eyes.x).toBeCloseTo(44, 5);
    expect(moved.eyes.y).toBeCloseTo(70, 5);
  });

  it('spills leftover travel from the crown into the stretch', () => {
    const h = HANDLES.find((x) => x.id === 'crown')!;
    // Pull far past the tallest a face is allowed to be.
    const pulled = h.drag(base, { x: FACE_CX, y: -60 });
    expect(pulled.height).toBe(FACE_LIMITS.height[1]);
    expect(pulled.squish).toBe(FACE_LIMITS.squish[1]);
  });

  it('opens the mouth only once the frown has bottomed out', () => {
    const h = HANDLES.find((x) => x.id === 'mouthC')!;
    const halfway = h.drag(base, { x: FACE_CX, y: base.mouth.y + 15 });
    expect(halfway.mouth.curve).toBeCloseTo(0.5, 5);
    expect(halfway.mouth.open).toBe(0);

    const yanked = h.drag(base, { x: FACE_CX, y: base.mouth.y + 60 });
    expect(yanked.mouth.curve).toBe(1);
    expect(yanked.mouth.open).toBeGreaterThan(0);
  });

  it('ignores a little sideways slop on the mouth before adding a wobble', () => {
    const h = HANDLES.find((x) => x.id === 'mouthC')!;
    expect(h.drag(base, { x: FACE_CX + 5, y: base.mouth.y }).mouth.wave).toBe(0);
    expect(h.drag(base, { x: FACE_CX + 40, y: base.mouth.y }).mouth.wave).toBeGreaterThan(0);
  });

  it('drops the inner brow end when a brow is dragged towards the nose', () => {
    const left = HANDLES.find((x) => x.id === 'browL')!;
    const right = HANDLES.find((x) => x.id === 'browR')!;
    const leftEye = FACE_CX - base.eyes.x;
    const rightEye = FACE_CX + base.eyes.x;

    // Positive angle is the angry direction for both sides.
    expect(left.drag(base, { x: leftEye + 10, y: 52 }).brows.angle).toBeGreaterThan(0);
    expect(right.drag(base, { x: rightEye - 10, y: 52 }).brows.angle).toBeGreaterThan(0);
  });

  it('hides the brow handles until brows are switched on', () => {
    const off = { ...cloneFace(base), brows: { ...base.brows, on: false } };
    const ids = visibleHandles(off).map((h) => h.id);
    expect(ids).not.toContain('browL');
    expect(ids).not.toContain('browR');
    expect(visibleHandles(base).map((h) => h.id)).toContain('browL');
  });

  it('hides the outline handles when there is no outline to pull', () => {
    const bare = { ...cloneFace(base), gap: 360 };
    const ids = visibleHandles(bare).map((h) => h.id);
    for (const gone of ['crown', 'chin', 'side']) expect(ids, gone).not.toContain(gone);
    // The features you can still see are still draggable.
    for (const kept of ['eyeL', 'eyeR', 'mouthC']) expect(ids, kept).toContain(kept);
  });

  it('resets only its own feature', () => {
    const h = HANDLES.find((x) => x.id === 'mouthC')!;
    const pulled = h.drag(base, { x: FACE_CX + 30, y: base.mouth.y + 60 });
    const wideEyes = { ...pulled, eyes: { ...pulled.eyes, size: 22 } };
    const reset = h.reset(wideEyes, base);

    expect(reset.mouth.curve).toBe(base.mouth.curve);
    expect(reset.mouth.open).toBe(base.mouth.open);
    expect(reset.eyes.size).toBe(22); // untouched
  });

  it('nudges by the requested amount with the arrow keys', () => {
    const h = HANDLES.find((x) => x.id === 'eyeR')!;
    const before = h.at(base);
    const after = h.at(nudge(h, base, 2, -2));
    expect(after.x - before.x).toBeCloseTo(2, 5);
    expect(after.y - before.y).toBeCloseTo(-2, 5);
  });

  it('gives every handle a label and a hint for screen readers', () => {
    for (const h of HANDLES) {
      expect(h.label.length, h.id).toBeGreaterThan(2);
      expect(h.hint.length, h.id).toBeGreaterThan(6);
    }
    expect(new Set(HANDLES.map((h) => h.id)).size).toBe(HANDLES.length);
  });
});
