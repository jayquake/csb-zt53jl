/*
 * The photo compositor's maths. ImageData is just width, height and a byte
 * array, so the fold map can be checked in Node without a canvas.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACE, foldMap, printRect } from '../src/mockup/composite';

/** A greyscale test image, built from a function of x and y. */
function image(w: number, h: number, value: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = value(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
}

describe('fold map', () => {
  it('is flat for flat cloth', () => {
    const map = foldMap(image(24, 24, () => 128));
    for (const v of map) expect(v).toBeCloseTo(128 / 255, 2);
  });

  it('reads brightness as height', () => {
    const map = foldMap(image(24, 24, (x) => (x < 12 ? 40 : 220)), 0);
    expect(map[5]).toBeLessThan(map[20]);
    expect(map[20]).toBeGreaterThan(0.7);
  });

  it('blurs, so per-pixel grain cannot shred the artwork', () => {
    // A single bright pixel in a dark field: blurred, its energy spreads to the
    // neighbours instead of producing one violent spike of displacement.
    const spike = (x: number, y: number) => (x === 12 && y === 12 ? 255 : 0);
    const sharp = foldMap(image(25, 25, spike), 0);
    const soft = foldMap(image(25, 25, spike), 4);
    const at = (m: Float32Array, x: number, y: number) => m[y * 25 + x];

    expect(at(sharp, 12, 12)).toBeGreaterThan(at(soft, 12, 12));
    expect(at(soft, 13, 12)).toBeGreaterThan(at(sharp, 13, 12));
  });

  it('keeps every value in range', () => {
    const map = foldMap(image(30, 30, (x, y) => (x * 7 + y * 11) % 256), 3);
    for (const v of map) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('print placement', () => {
  it('places the print as a fraction of the photo, so it survives a resize', () => {
    const small = printRect(DEFAULT_PLACE, 400, 600);
    const large = printRect(DEFAULT_PLACE, 800, 1200);
    expect(large.cx / small.cx).toBeCloseTo(2, 5);
    expect(large.cy / small.cy).toBeCloseTo(2, 5);
    expect(large.size / small.size).toBeCloseTo(2, 5);
  });

  it('starts somewhere sane on an unseen photo', () => {
    expect(DEFAULT_PLACE.x).toBeGreaterThan(0.2);
    expect(DEFAULT_PLACE.x).toBeLessThan(0.8);
    expect(DEFAULT_PLACE.blend).toBe('multiply');
    expect(DEFAULT_PLACE.displace).toBeGreaterThan(0);
  });
});
