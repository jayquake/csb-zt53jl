/*
 * Motion is testable here because none of it touches the clock or the DOM:
 * every function takes an elapsed time and returns a face.
 */

import { describe, expect, it } from 'vitest';
import {
  applyBlink,
  blinkAmount,
  boilFace,
  easeInOut,
  faceAt,
  lerpFace,
  reelFrame,
} from '../src/brand/animation';
import { buildFace, clampFace, FACE_LIMITS, type FaceParams } from '../src/brand/face';
import { cloneFace, TEMPLATES, templateById } from '../src/brand/templates';

const sunny = templateById('sunny')!.face;
const heavy = templateById('heavy')!.face;

function paths(f: FaceParams): string {
  const g = buildFace(f);
  return [g.outline, ...g.eyesLeft, ...g.eyesRight, ...g.rest]
    .filter((p) => p !== null)
    .map((p) => (p.kind === 'dot' ? `${p.cx},${p.cy}` : p.d))
    .join(' ');
}

describe('lerpFace', () => {
  it('returns the ends exactly', () => {
    expect(lerpFace(sunny, heavy, 0)).toEqual(clampFace(sunny));
    expect(lerpFace(sunny, heavy, 1)).toEqual(clampFace(heavy));
  });

  it('lands between the two on every number', () => {
    const mid = lerpFace(sunny, heavy, 0.5);
    const between = (a: number, b: number, v: number) => v >= Math.min(a, b) - 1e-9 && v <= Math.max(a, b) + 1e-9;
    expect(between(sunny.mouth.curve, heavy.mouth.curve, mid.mouth.curve)).toBe(true);
    expect(between(sunny.eyes.y, heavy.eyes.y, mid.eyes.y)).toBe(true);
    expect(between(sunny.squish, heavy.squish, mid.squish)).toBe(true);
  });

  it('switches the things that cannot be half-way at the midpoint', () => {
    expect(lerpFace(sunny, heavy, 0.49).eyes.shape).toBe(sunny.eyes.shape);
    expect(lerpFace(sunny, heavy, 0.5).eyes.shape).toBe(heavy.eyes.shape);
    expect(lerpFace(sunny, heavy, 0.51).marks).toEqual(heavy.marks);
  });

  it('clamps out-of-range input rather than passing it through', () => {
    expect(lerpFace(sunny, heavy, -3)).toEqual(clampFace(sunny));
    expect(lerpFace(sunny, heavy, 9)).toEqual(clampFace(heavy));
  });

  it('draws cleanly at every step between any two templates', () => {
    for (const a of TEMPLATES) {
      for (const b of TEMPLATES) {
        for (const t of [0.15, 0.4, 0.5, 0.72, 0.99]) {
          const d = paths(lerpFace(a.face, b.face, t));
          expect(d, `${a.id}->${b.id}@${t}`).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });

  it('never mutates either end', () => {
    const before = JSON.stringify([sunny, heavy]);
    lerpFace(sunny, heavy, 0.5);
    expect(JSON.stringify([sunny, heavy])).toBe(before);
  });
});

describe('reelFrame', () => {
  const faces = [sunny, heavy, templateById('wired')!.face];
  const opts = { dwellMs: 1000, morphMs: 500 };

  it('holds a face still while dwelling', () => {
    expect(reelFrame(faces, 0, opts).face).toEqual(clampFace(sunny));
    expect(reelFrame(faces, 999, opts).progress).toBe(0);
    expect(reelFrame(faces, 999, opts).index).toBe(0);
  });

  it('morphs into the next face, then advances', () => {
    const mid = reelFrame(faces, 1250, opts);
    expect(mid.index).toBe(0);
    expect(mid.progress).toBeCloseTo(0.5, 5);
    expect(reelFrame(faces, 1500, opts).index).toBe(1);
  });

  it('wraps back round to the start', () => {
    expect(reelFrame(faces, 4500, opts).index).toBe(0);
    expect(reelFrame(faces, 4500, opts).face).toEqual(reelFrame(faces, 0, opts).face);
  });

  it('holds a single-face reel completely still', () => {
    const only = reelFrame([sunny], 999999);
    expect(only.face).toEqual(sunny);
    expect(only.index).toBe(0);
  });

  it('is deterministic — the same moment gives the same face', () => {
    expect(reelFrame(faces, 1234, opts)).toEqual(reelFrame(faces, 1234, opts));
  });
});

describe('blinking', () => {
  it('spends most of its time with the eyes open', () => {
    let shut = 0;
    const samples = 4000;
    for (let i = 0; i < samples; i++) if (blinkAmount(i * 10) > 0.5) shut++;
    // A blink is ~200ms in a ~3.6s cycle; anything above a few percent would
    // read as a face that is asleep.
    expect(shut / samples).toBeLessThan(0.12);
    expect(shut).toBeGreaterThan(0);
  });

  it('closes fully at some point in every cycle', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      let peak = 0;
      for (let t = cycle * 3600; t < (cycle + 1) * 3600; t += 10) peak = Math.max(peak, blinkAmount(t));
      expect(peak, `cycle ${cycle}`).toBeGreaterThan(0.9);
    }
  });

  it('does not blink two faces in lockstep when they are seeded apart', () => {
    const a = Array.from({ length: 400 }, (_, i) => blinkAmount(i * 10, 1));
    const b = Array.from({ length: 400 }, (_, i) => blinkAmount(i * 10, 2));
    expect(a).not.toEqual(b);
  });

  it('only ever closes eyes further, never opens them', () => {
    const squinting = { ...cloneFace(heavy), eyes: { ...heavy.eyes, squint: 0.8 } };
    expect(applyBlink(squinting, 0.2).eyes.squint).toBe(0.8);
    expect(applyBlink(squinting, 1).eyes.squint).toBe(1);
    expect(applyBlink(squinting, 0).eyes.squint).toBe(0.8);
  });
});

describe('boil', () => {
  it('changes the drawing from frame to frame', () => {
    expect(paths(boilFace(sunny, 1))).not.toBe(paths(boilFace(sunny, 2)));
  });

  it('repeats exactly when a frame number comes round again', () => {
    expect(boilFace(sunny, 7)).toEqual(boilFace(sunny, 7));
  });

  it('stays close to the face it was given', () => {
    for (let frame = 0; frame < 60; frame++) {
      const b = boilFace(sunny, frame);
      expect(Math.abs(b.width - sunny.width)).toBeLessThanOrEqual(1.7);
      expect(Math.abs(b.mouth.curve - sunny.mouth.curve)).toBeLessThanOrEqual(0.05);
      expect(b).toEqual(clampFace(b));
    }
  });

  it('is off when the amount is zero', () => {
    expect(boilFace(sunny, 3, 0)).toBe(sunny);
  });

  it('cannot push a face at its limits out of range', () => {
    const extreme: FaceParams = clampFace({
      ...cloneFace(sunny),
      width: FACE_LIMITS.width[1],
      height: FACE_LIMITS.height[1],
      mouth: { ...sunny.mouth, curve: 1 },
    });
    for (let frame = 0; frame < 40; frame++) {
      const b = boilFace(extreme, frame);
      expect(b.width).toBeLessThanOrEqual(FACE_LIMITS.width[1]);
      expect(b.mouth.curve).toBeLessThanOrEqual(1);
    }
  });
});

describe('faceAt', () => {
  it('gives a still, unwobbled face at rest when asked', () => {
    expect(faceAt({ faces: [sunny], blink: false, boil: 0 }, 0).face).toEqual(sunny);
  });

  it('never produces an undrawable face across a long run', () => {
    const spec = { faces: TEMPLATES.map((t) => t.face), blink: true, boil: 1 };
    for (let t = 0; t < 40000; t += 97) {
      expect(paths(faceAt(spec, t).face), `t=${t}`).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('easing starts and ends where it should', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });
});
