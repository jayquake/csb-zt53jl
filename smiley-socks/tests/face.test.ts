import { describe, expect, it } from 'vitest';
import {
  buildFace,
  clampFace,
  FACE_LIMITS,
  faceSignature,
  outlinePath,
  type FaceParams,
  type Finish,
} from '../src/brand/face';
import { cloneFace, TEMPLATES } from '../src/brand/templates';

const base = TEMPLATES[0].face;

/** The text a Prim would contribute to a path — `d` for strokes/fills, the
 * ellipse numbers for a dot — so tests can compare any primitive uniformly. */
function textOf(p: { kind: string; d?: string; cx?: number; cy?: number; rx?: number; ry?: number } | null): string {
  if (!p) return '';
  return p.kind === 'dot' ? `${p.cx} ${p.cy} ${p.rx} ${p.ry}` : (p.d ?? '');
}

function pathsOf(f: FaceParams, finish: Finish = 'clean'): string[] {
  const g = buildFace(f, finish);
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
        marks: ['tear', 'sweat', 'blush', 'static', 'zzz', 'sparkle', 'wink', 'tongue', 'shades', 'teeth', 'bawling'],
      };
      for (const d of pathsOf(f)) expect(d).not.toMatch(/NaN|Infinity/);
      // The same extremes again, chalk finish: the wobble reads the same
      // params and must survive them exactly as cleanly as the plain draw.
      const gc = buildFace(f, 'chalk');
      for (const p of [gc.outline, ...gc.eyesLeft, ...gc.eyesRight, ...gc.rest]) {
        if (!p) continue;
        const text = p.kind === 'dot' ? `${p.cx} ${p.cy} ${p.rx} ${p.ry}` : p.d;
        expect(text).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('draws every eye shape', () => {
    for (const shape of ['bar', 'tick', 'round', 'arc', 'cross', 'line', 'spiral', 'heart', 'lash', 'star'] as const) {
      const f = { ...cloneFace(base), eyes: { ...base.eyes, shape } };
      const g = buildFace(f);
      expect(g.eyesLeft.length, shape).toBeGreaterThan(0);
      expect(g.eyesRight.length, shape).toBeGreaterThan(0);
    }
  });

  it('draws every mark', () => {
    const marks = ['tear', 'sweat', 'blush', 'static', 'zzz', 'sparkle', 'tongue', 'shades', 'teeth', 'bawling'] as const;
    for (const mark of marks) {
      const f = { ...cloneFace(base), marks: [mark] };
      const g = buildFace(f);
      expect(g.rest.length, mark).toBeGreaterThan(0);
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

  describe('the chalk wobble', () => {
    // The wobble is baked into the path data itself (not a screen filter), so
    // it has to behave like geometry: the same face draws the same wobble
    // every time, a different face draws a different one, and the clean
    // finish stays exactly what it always was.
    it('leaves the clean finish untouched — buildFace(f) and buildFace(f, "clean") agree', () => {
      for (const t of TEMPLATES) {
        const a = buildFace(t.face);
        const b = buildFace(t.face, 'clean');
        expect(textOf(a.outline)).toBe(textOf(b.outline));
        expect(a.rest.map(textOf)).toEqual(b.rest.map(textOf));
      }
    });

    it('is deterministic — the same face draws the same chalk wobble every time', () => {
      for (const t of [TEMPLATES[0], TEMPLATES[5], TEMPLATES[10]]) {
        const once = buildFace(cloneFace(t.face), 'chalk');
        const again = buildFace(cloneFace(t.face), 'chalk');
        expect(textOf(once.outline)).toBe(textOf(again.outline));
        expect(once.rest.map(textOf)).toEqual(again.rest.map(textOf));
      }
    });

    it('actually moves the geometry — chalk differs from clean', () => {
      // "Emphasise hand-drawn" only means something if the path data itself
      // changes; a face with an outline and a stroked mouth is guaranteed to
      // have both to compare.
      const f = { ...cloneFace(base), gap: 0 };
      const clean = buildFace(f, 'clean');
      const chalk = buildFace(f, 'chalk');
      expect(textOf(chalk.outline)).not.toBe(textOf(clean.outline));
      const cleanMouth = clean.rest.find((p) => p.key === 'mouth');
      const chalkMouth = chalk.rest.find((p) => p.key === 'mouth');
      expect(textOf(chalkMouth ?? null)).not.toBe(textOf(cleanMouth ?? null));
    });

    it('wobbles two different faces differently', () => {
      const a = buildFace(cloneFace(TEMPLATES[0].face), 'chalk');
      const b = buildFace(cloneFace(TEMPLATES[1].face), 'chalk');
      const am = a.rest.find((p) => p.key === 'mouth') ?? null;
      const bm = b.rest.find((p) => p.key === 'mouth') ?? null;
      expect(textOf(am)).not.toBe(textOf(bm));
    });

    it('keeps the wobble small relative to the stroke — never enough to break the shape', () => {
      // A hand tremor, not a redraw: every coordinate the wobble touches
      // should stay within a few units of its clean counterpart, on every
      // template — including the marks and eyes, not just the outline.
      for (const t of TEMPLATES) {
        const f = { ...cloneFace(t.face), gap: 0 };
        const clean = extractPoints(pathsOf(f).join(' '));
        const chalk = extractPoints(pathsOf(f, 'chalk').join(' '));
        expect(chalk.length, t.id).toBe(clean.length);
        const maxDelta = Math.max(...chalk.map((v, i) => Math.abs(v - clean[i])));
        expect(maxDelta, t.id).toBeLessThan(8);
      }
    });

    it('draws every new eye shape and mark from a chalk finish without NaNs', () => {
      const lash = { ...cloneFace(base), eyes: { ...base.eyes, shape: 'lash' as const } };
      const star = { ...cloneFace(base), eyes: { ...base.eyes, shape: 'star' as const } };
      const shades = { ...cloneFace(base), marks: ['shades' as const] };
      const teeth = { ...cloneFace(base), mouth: { ...base.mouth, open: 0.4 }, marks: ['teeth' as const] };
      const bawling = { ...cloneFace(base), marks: ['bawling' as const] };
      for (const f of [lash, star, shades, teeth, bawling]) {
        for (const d of pathsOf(f, 'chalk')) expect(d).not.toMatch(/NaN|Infinity/);
      }
    });
  });
});

/** Pull the raw numbers out of a path string, for a coarse distance check. */
function extractPoints(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}
