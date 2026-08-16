/*
 * The real-photo view only stands in for garments someone actually
 * photographed. This checks the gate, not the canvas compositing itself
 * (that's mockup.test.ts's compositor plus a real screenshot, not a unit
 * test — there's no DOM canvas in Node).
 */

import { describe, expect, it } from 'vitest';
import { sockPhotoMatches } from '../src/brand/SockPhoto';

describe('sockPhotoMatches', () => {
  it('matches every garment that was actually photographed', () => {
    expect(sockPhotoMatches({ colorwayId: 'fog', heightId: 'knee', placementId: 'cuff' })).toBe(true);
    expect(sockPhotoMatches({ colorwayId: 'bone', heightId: 'knee', placementId: 'cuff' })).toBe(true);
    expect(sockPhotoMatches({ colorwayId: 'butter', heightId: 'knee', placementId: 'cuff' })).toBe(true);
    expect(sockPhotoMatches({ colorwayId: 'oatmeal', heightId: 'knee', placementId: 'cuff' })).toBe(true);
    // Shot as a crew sock, not knee-high — a different garment from the rest.
    expect(sockPhotoMatches({ colorwayId: 'bubblegum', heightId: 'crew', placementId: 'cuff' })).toBe(true);
  });

  it('refuses a colourway nobody photographed', () => {
    expect(sockPhotoMatches({ colorwayId: 'midnight', heightId: 'knee', placementId: 'cuff' })).toBe(false);
    expect(sockPhotoMatches({ colorwayId: 'clay', heightId: 'knee', placementId: 'cuff' })).toBe(false);
    expect(sockPhotoMatches({ colorwayId: 'moss', heightId: 'knee', placementId: 'cuff' })).toBe(false);
  });

  it('refuses a height nobody photographed that garment in', () => {
    expect(sockPhotoMatches({ colorwayId: 'fog', heightId: 'crew', placementId: 'cuff' })).toBe(false);
    expect(sockPhotoMatches({ colorwayId: 'bubblegum', heightId: 'knee', placementId: 'cuff' })).toBe(false);
  });

  it('refuses a placement the photo was not shot for', () => {
    expect(sockPhotoMatches({ colorwayId: 'fog', heightId: 'knee', placementId: 'allover' })).toBe(false);
  });
});
