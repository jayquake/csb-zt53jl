/*
 * The 3D sock's shape, checked without a GPU. buildSockMesh is deliberately
 * free of three.js, so everything that could actually be wrong about the model
 * — a torn surface, a collapsed toe, UVs off the edge of the texture — is
 * arithmetic that can be asserted here.
 */

import { describe, expect, it } from 'vitest';
import { buildSockMesh, meshBounds } from '../src/three/sockMesh';
import { printSpots } from '../src/three/texture';
import { DEFAULT_DESIGN } from '../src/store/design';

const crew = buildSockMesh({ legLength: 21 });

describe('sock mesh', () => {
  it('produces a complete, finite surface', () => {
    expect(crew.positions.length % 3).toBe(0);
    expect(crew.uvs.length / 2).toBe(crew.positions.length / 3);
    expect(crew.indices.length % 3).toBe(0);
    for (const v of crew.positions) expect(Number.isFinite(v)).toBe(true);
  });

  it('indexes only vertices that exist', () => {
    const vertices = crew.positions.length / 3;
    let max = 0;
    for (const i of crew.indices) max = Math.max(max, i);
    expect(max).toBe(vertices - 1);
  });

  it('keeps every UV inside the texture', () => {
    for (const uv of crew.uvs) {
      expect(uv).toBeGreaterThanOrEqual(0);
      expect(uv).toBeLessThanOrEqual(1);
    }
  });

  it('is sock-shaped: taller than it is wide, and longer in the foot than it is around', () => {
    const { min, max } = meshBounds(crew.positions);
    const width = max[0] - min[0];
    const height = max[1] - min[1];
    const depth = max[2] - min[2];
    // A crew sock: ~21cm of leg, ~21cm of foot, ~9cm across.
    expect(width).toBeGreaterThan(6);
    expect(width).toBeLessThan(12);
    expect(height).toBeGreaterThan(width);
    expect(depth).toBeGreaterThan(15);
  });

  it('closes the toe instead of leaving a hole', () => {
    // The last ring should have collapsed to nearly a point.
    const around = crew.uvs.lastIndexOf(1) >= 0 ? 56 : 56;
    const ring = crew.positions.slice(crew.positions.length - (around + 1) * 3);
    let spread = 0;
    for (let i = 0; i < ring.length; i += 3) {
      for (let j = 0; j < ring.length; j += 3) {
        spread = Math.max(spread, Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1], ring[i + 2] - ring[j + 2]));
      }
    }
    expect(spread).toBeLessThan(0.6);
  });

  it('grows only in the leg when the height changes', () => {
    const ankle = meshBounds(buildSockMesh({ legLength: 11 }).positions);
    const knee = meshBounds(buildSockMesh({ legLength: 38 }).positions);
    const crewB = meshBounds(crew.positions);

    const tall = (b: typeof crewB) => b.max[1] - b.min[1];
    const long = (b: typeof crewB) => b.max[2] - b.min[2];

    expect(tall(ankle)).toBeLessThan(tall(crewB));
    expect(tall(crewB)).toBeLessThan(tall(knee));
    // The foot is the same foot at every height.
    expect(Math.abs(long(ankle) - long(knee))).toBeLessThan(1.5);
  });

  it('puts the landmarks in order down the sock', () => {
    const { cuffEnd, heel, toeStart } = crew.landmarks;
    expect(cuffEnd).toBeGreaterThan(0);
    expect(cuffEnd).toBeLessThan(heel);
    expect(heel).toBeLessThan(toeStart);
    expect(toeStart).toBeLessThan(1);
  });
});

describe('print placement in UV space', () => {
  const landmarks = crew.landmarks;

  it('puts a cuff hit on the outer leg, below the cuff and above the heel', () => {
    const [spot] = printSpots({ ...DEFAULT_DESIGN, placementId: 'cuff' }, landmarks);
    expect(spot.u).toBe(0.5); // the outer side, away from the texture seam
    expect(spot.v).toBeGreaterThan(landmarks.cuffEnd);
    expect(spot.v).toBeLessThan(landmarks.heel);
  });

  it('quotes the same size the flat proof does', () => {
    const [cuff] = printSpots({ ...DEFAULT_DESIGN, placementId: 'cuff' }, landmarks);
    const [leg] = printSpots({ ...DEFAULT_DESIGN, placementId: 'leg' }, landmarks);
    expect(cuff.cm).toBeCloseTo(2.89, 2); // 34 units x 0.85mm
    expect(leg.cm).toBeGreaterThan(cuff.cm);
  });

  it('stacks three up the leg, all clear of the heel', () => {
    const spots = printSpots({ ...DEFAULT_DESIGN, placementId: 'stacked' }, landmarks);
    expect(spots).toHaveLength(3);
    for (const s of spots) expect(s.v).toBeLessThan(landmarks.heel);
    expect(spots[0].v).toBeLessThan(spots[2].v);
  });

  it('tiles the all-over print around the whole sock', () => {
    const spots = printSpots({ ...DEFAULT_DESIGN, placementId: 'allover' }, landmarks);
    expect(spots.length).toBeGreaterThan(40);
    expect(new Set(spots.map((s) => s.u)).size).toBeGreaterThan(4);
    for (const s of spots) {
      expect(s.u).toBeGreaterThanOrEqual(0);
      expect(s.v).toBeLessThan(1);
    }
  });
});
