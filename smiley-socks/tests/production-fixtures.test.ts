/*
 * The contract between the app and the production pipeline.
 *
 * `tools/` is a Python port of the face engine, the catalog and the sock
 * metrics, so that a print file can be generated from a design record alone —
 * no browser, no Node, nothing that needs a screen. A port is a second copy of
 * the truth, and second copies drift.
 *
 * This test is the alarm. It runs the *real* TypeScript and writes what it
 * produces to a fixture; the Python suite reads that same fixture and asserts
 * its own output matches, path string for path string. So the moment anyone
 * changes a curve in face.ts, a size in catalog.ts or the sweep in
 * sockMesh.ts, `npm test` refreshes the fixture and the Python tests go red
 * until the port is brought back into line. Neither side can move alone.
 *
 * It is deliberately a test rather than a script: a script only protects you
 * if you remember to run it.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFace, FACE_LIMITS, type FaceParams } from '../src/brand/face';
import { TEMPLATES, cloneFace } from '../src/brand/templates';
import { buildSockMesh } from '../src/three/sockMesh';
import { printSpots } from '../src/three/texture';
import {
  COLORWAYS,
  DONATION_RATE,
  HEIGHTS,
  MM_PER_UNIT,
  PLACEMENTS,
  PRICE,
  SIZES,
} from '../src/store/catalog';
import { CUFF_TEXT_MAX, DEFAULT_DESIGN, type Design } from '../src/store/design';
import { supports } from '../src/brand/grinline';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../tools/tests/fixtures/geometry.json');

/**
 * Faces that exercise the corners of the parameter space.
 *
 * The 24 templates are the art direction; these are the edges — every eye
 * shape, an open mouth, a full outline, both extremes of every limit. A port
 * that agrees on Sunny and disagrees on a squinting spiral eye is still broken.
 */
function edgeCases(): { name: string; face: FaceParams }[] {
  const base = cloneFace(TEMPLATES[0].face);
  const at = (over: Partial<FaceParams>, deep: Partial<FaceParams> = {}): FaceParams => ({
    ...base,
    ...over,
    eyes: { ...base.eyes, ...(deep.eyes ?? {}) },
    brows: { ...base.brows, ...(deep.brows ?? {}) },
    mouth: { ...base.mouth, ...(deep.mouth ?? {}) },
    marks: over.marks ?? base.marks,
  });

  const shapes = ['bar', 'tick', 'round', 'arc', 'cross', 'line', 'spiral', 'heart', 'lash', 'star'] as const;
  const cases: { name: string; face: FaceParams }[] = shapes.map((shape) => ({
    name: `eye-${shape}`,
    face: at({}, { eyes: { ...base.eyes, shape } }),
  }));

  cases.push(
    // The outline: fully closed, a normal open loop, and the point past which
    // it disappears entirely.
    { name: 'outline-closed', face: at({ gap: 0 }) },
    { name: 'outline-gap-60', face: at({ gap: 60 }) },
    { name: 'outline-gone', face: at({ gap: 360 }) },
    { name: 'outline-boundary', face: at({ gap: 339.9 }) },
    // Squish is the Mario-64 pull, and it is signed.
    { name: 'squish-max', face: at({ gap: 40, squish: FACE_LIMITS.squish[1] }) },
    { name: 'squish-min', face: at({ gap: 40, squish: FACE_LIMITS.squish[0] }) },
    { name: 'tilt-max', face: at({ tilt: FACE_LIMITS.tilt[1] }) },
    // An open mouth takes the fill path rather than the stroke path.
    { name: 'mouth-open', face: at({}, { mouth: { ...base.mouth, open: 1, curve: -0.4 } }) },
    { name: 'mouth-wave', face: at({}, { mouth: { ...base.mouth, wave: 1, flick: 1 } }) },
    { name: 'brows-on', face: at({}, { brows: { on: true, y: 40, angle: 30, length: 34 } }) },
    { name: 'eyes-squint', face: at({}, { eyes: { ...base.eyes, squint: 1, tilt: 40 } }) },
    // Marks reposition themselves when there is no rim to hang off.
    { name: 'marks-all-bare', face: at({ gap: 360, marks: ['tear', 'sweat', 'blush', 'static', 'zzz', 'sparkle', 'tongue', 'shades', 'teeth', 'bawling'] }) },
    { name: 'marks-all-rimmed', face: at({ gap: 0, marks: ['tear', 'sweat', 'blush', 'static', 'zzz', 'sparkle', 'tongue', 'shades', 'teeth', 'bawling'] }) },
    { name: 'wink', face: at({ marks: ['wink'] }) },
    // Out-of-range on purpose: the port has to clamp identically, not just draw
    // identically.
    { name: 'unclamped', face: at({ width: 999, height: -50, gap: -20, tilt: 99 }) },
    // Stresses the mouth wobble's width scaling at both ends, and the shades
    // bridge's clamp against tight eye spacing paired with a large eye size —
    // the combination that comes closest to inverting the bridge.
    { name: 'mouth-narrow', face: at({}, { mouth: { ...base.mouth, width: FACE_LIMITS.mouthWidth[0], curve: 0.1 } }) },
    { name: 'mouth-wide', face: at({}, { mouth: { ...base.mouth, width: FACE_LIMITS.mouthWidth[1], curve: 0.9 } }) },
    {
      name: 'shades-tight',
      face: at(
        { marks: ['shades'] },
        { eyes: { ...base.eyes, x: FACE_LIMITS.eyeX[0], size: FACE_LIMITS.eyeSize[1] } },
      ),
    },
  );
  return cases;
}

describe('production fixtures', () => {
  it('writes the geometry contract the Python pipeline is tested against', () => {
    // Every entry carries both finishes: `geometry` is the clean render (the
    // contract that already existed), `geometryChalk` is the same face with
    // the hand-drawn wobble baked in. Chalk is the shelf default, so a port
    // that only matched the clean render would be wrong for almost every real
    // print — the wobble touches the outline, every eye shape, both marks and
    // the mouth, so there is no primitive it is safe to leave unchecked.
    const faces = [
      ...TEMPLATES.map((t) => ({ name: `template-${t.id}`, face: cloneFace(t.face) })),
      ...edgeCases(),
    ].map(({ name, face }) => ({
      name,
      params: face,
      geometry: buildFace(face),
      geometryChalk: buildFace(face, 'chalk'),
    }));

    // The sock's real dimensions, per height. These are what turn a print
    // "34 units wide" into millimetres on a canvas.
    const socks = HEIGHTS.map((h) => {
      const mesh = buildSockMesh({ legLength: h.legCm });
      return {
        heightId: h.id,
        legCm: h.legCm,
        landmarks: mesh.landmarks,
        metrics: mesh.metrics,
      };
    });

    // Where every placement lands, on every height.
    const spots = socks.flatMap((s) =>
      PLACEMENTS.map((p) => {
        const design: Design = { ...DEFAULT_DESIGN, heightId: s.heightId, placementId: p.id };
        return { heightId: s.heightId, placementId: p.id, spots: printSpots(design, s.landmarks) };
      }),
    );

    const fixture = {
      note: 'Generated by tests/production-fixtures.test.ts. Do not edit by hand.',
      catalog: {
        MM_PER_UNIT,
        DONATION_RATE,
        PRICE,
        heights: HEIGHTS,
        sizes: SIZES,
        colorways: COLORWAYS,
        placements: PLACEMENTS,
      },
      limits: FACE_LIMITS,
      // Every character the knitted alphabet can actually draw. The pipeline
      // filters cuff text against this, so it has to be the same list.
      grinline: {
        cuffTextMax: CUFF_TEXT_MAX,
        chars: [...Array(127).keys()]
          .map((code) => String.fromCharCode(code))
          .filter((ch) => ch === ch.toUpperCase() && supports(ch)),
      },
      socks,
      spots,
      faces,
    };

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);

    // Sanity, so a fixture that is merely *written* cannot pass for one that is
    // right: every face has to have drawn something.
    expect(faces.length).toBeGreaterThanOrEqual(24 + 20);
    for (const f of faces) {
      for (const g of [f.geometry, f.geometryChalk]) {
        const prims = [...(g.outline ? [g.outline] : []), ...g.eyesLeft, ...g.eyesRight, ...g.rest];
        expect(prims.length, f.name).toBeGreaterThan(1);
      }
    }
    expect(socks.every((s) => s.metrics.lengthCm > 20 && s.metrics.circumferenceCm > 10)).toBe(true);
  });
});
