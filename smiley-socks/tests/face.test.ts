import { describe, expect, it } from 'vitest';
import {
  buildFace,
  clampFace,
  FACE_LIMITS,
  faceSignature,
  outlinePath,
  type FaceParams,
} from '../src/brand/face';
import { cloneFace, TEMPLATES } from '../src/brand/templates';

const base = TEMPLATES[0].face;

function pathsOf(f: FaceParams): string[] {
  const g = buildFace(f);
  return [g.outline, ...g.eyesLeft, ...g.eyesRight, ...g.rest]
    .filter((p) => p !== null)
    .map((p) => (p.kind === 'dot' ? `${p.cx} ${p.cy} ${p.rx} ${p.ry}` : p.d))
    .concat(
      `${g.eyeRotation.left.deg} ${g.eyeRotation.left.cx} ${g.eyeRotation.left.cy}`,
      `${g.eyeRotation.right.deg} ${g.eyeRotation.right.cx} ${g.eyeRotation.right.cy}`,
    );
}

describe('face geometry', () => {
  it('draws every template without a NaN reaching the path data', () => {
    for (const t of TEMPLATES) {
      for (const d of pathsOf(t.face)) {
        expect(d, `${t.id}: ${d}`).not.toMatch(/NaN|Infinity|undefined/);
        expect(d.length).toBeGreaterThan(0);
      }
    }
  });

  it('survives every parameter being pushed to both limits', () => {
    // The editor clamps, but a stored design or a future template could still
    // arrive at the extremes — the renderer must cope rather than blow up.
    for (const extreme of [0, 1] as const) {
      const pick = (key: keyof typeof FACE_LIMITS) => FACE_LIMITS[key][extreme];
      const f: FaceParams = {
        width: pick('width'),
        height: pick('height'),
        squish: pick('squish'),
        tilt: pick('tilt'),
        gap: pick('gap'),
        eyes: {
          shape: 'bar',
          x: pick('eyeX'),
          y: pick('eyeY'),
          size: pick('eyeSize'),
          squint: pick('eyeSquint'),
          tilt: pick('eyeTilt'),
        },
        brows: { on: true, y: pick('browY'), angle: pick('browAngle'), length: pick('browLength') },
        mouth: {
          y: pick('mouthY'),
          width: pick('mouthWidth'),
          curve: pick('mouthCurve'),
          open: pick('mouthOpen'),
          wave: pick('mouthWave'),
          flick: pick('mouthFlick'),
        },
        marks: ['tear', 'sweat', 'blush', 'static', 'zzz', 'sparkle', 'wink'],
      };
      for (const d of pathsOf(f)) expect(d).not.toMatch(/NaN|Infinity/);
    }
  });

  it('draws every eye shape', () => {
    for (const shape of ['bar', 'tick', 'round', 'arc', 'cross', 'line', 'spiral', 'heart'] as const) {
      const f = { ...cloneFace(base), eyes: { ...base.eyes, shape } };
      const g = buildFace(f);
      expect(g.eyesLeft.length, shape).toBeGreaterThan(0);
      expect(g.eyesRight.length, shape).toBeGreaterThan(0);
    }
  });

  it('clamps anything out of range, including junk numbers', () => {
    const wild = clampFace({
      ...cloneFace(base),
      width: 9000,
      height: -9000,
      squish: Number.NaN,
      mouth: { ...base.mouth, curve: 12, open: -4, width: 1e9, y: 0, wave: 5 },
      eyes: { ...base.eyes, x: -50, size: 900, squint: 3, tilt: 400, y: 1000 },
    });

    expect(wild.width).toBe(FACE_LIMITS.width[1]);
    expect(wild.height).toBe(FACE_LIMITS.height[0]);
    expect(wild.squish).toBe(FACE_LIMITS.squish[0]);
    expect(wild.mouth.curve).toBe(1);
    expect(wild.mouth.open).toBe(0);
    expect(wild.eyes.x).toBe(FACE_LIMITS.eyeX[0]);
    expect(wild.eyes.tilt).toBe(FACE_LIMITS.eyeTilt[1]);
  });

  it('leaves the open loop open, and closes it when the gap is zero', () => {
    // The signature gap: an outline with a gap must not be a closed path.
    expect(outlinePath({ ...cloneFace(base), gap: 40 })).not.toMatch(/Z$/);
    expect(outlinePath({ ...cloneFace(base), gap: 0 })).toMatch(/Z$/);
  });

  it('drops the outline entirely when the loop is opened all the way', () => {
    // "No outline" is not a separate mode — it is the open loop taken to its
    // limit, which is how a face gets drawn by hand: features, no circle.
    const bare = buildFace({ ...cloneFace(base), gap: 360 });
    expect(bare.outline).toBeNull();
    expect(outlinePath({ ...cloneFace(base), gap: 360 })).toBe('');
    // The features are all still there.
    expect(bare.eyesLeft.length).toBeGreaterThan(0);
    expect(bare.rest.length).toBeGreaterThan(0);
  });

  it('gives every template a distinct signature', () => {
    const seen = new Set(TEMPLATES.map((t) => faceSignature(t.face)));
    expect(seen.size).toBe(TEMPLATES.length);
  });

  it('does not let a template be mutated through its clone', () => {
    const copy = cloneFace(base);
    copy.eyes.x = 99;
    copy.marks.push('tear');
    expect(base.eyes.x).not.toBe(99);
    expect(base.marks).not.toContain('tear');
  });
});
