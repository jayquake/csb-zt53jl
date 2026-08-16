/*
 * The real-photo view only stands in for the one garment we actually
 * photographed. This checks the gate, not the canvas compositing itself
 * (that's mockup.test.ts's compositor plus a real screenshot, not a unit
 * test — there's no DOM canvas in Node).
 */

import { describe, expect, it } from 'vitest';
import { sockPhotoMatches } from '../src/brand/SockPhoto';

const base = { colorwayId: 'fog', heightId: 'knee', placementId: 'cuff' };

describe('sockPhotoMatches', () => {
  it('matches the exact garment that was photographed', () => {
    expect(sockPhotoMatches(base)).toBe(true);
  });

  it('refuses a colourway nobody photographed', () => {
    expect(sockPhotoMatches({ ...base, colorwayId: 'midnight' })).toBe(false);
  });

  it('refuses a height nobody photographed', () => {
    expect(sockPhotoMatches({ ...base, heightId: 'crew' })).toBe(false);
  });

  it('refuses a placement the photo was not shot for', () => {
    expect(sockPhotoMatches({ ...base, placementId: 'allover' })).toBe(false);
  });
});
