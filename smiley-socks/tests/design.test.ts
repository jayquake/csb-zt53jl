/*
 * Restoring a bag is the riskiest thing this app does with data it does not
 * control: whatever is in localStorage was written by an older release, or
 * hand-edited, or truncated by a browser that ran out of quota mid-write.
 */

import { describe, expect, it } from 'vitest';
import {
  cloneDesign,
  CUFF_TEXT_MAX,
  DEFAULT_DESIGN,
  normaliseCuffText,
  pricedFrom,
  sanitiseDesign,
} from '../src/store/design';
import { FACE_LIMITS } from '../src/brand/face';

describe('sanitiseDesign', () => {
  it('turns junk into a usable design instead of throwing', () => {
    for (const junk of [null, undefined, 42, 'nope', [], {}]) {
      const d = sanitiseDesign(junk);
      expect(d.heightId).toBe(DEFAULT_DESIGN.heightId);
      expect(d.face.width).toBeGreaterThan(0);
    }
  });

  it('rejects catalog values it does not recognise', () => {
    const d = sanitiseDesign({
      heightId: 'stilts',
      sizeId: 'xxxl',
      colorwayId: 'invisible',
      placementId: 'everywhere',
    });
    expect(d.heightId).toBe(DEFAULT_DESIGN.heightId);
    expect(d.sizeId).toBe(DEFAULT_DESIGN.sizeId);
    expect(d.colorwayId).toBe(DEFAULT_DESIGN.colorwayId);
    expect(d.placementId).toBe(DEFAULT_DESIGN.placementId);
  });

  it('re-clamps a face that was stored out of range', () => {
    const d = sanitiseDesign({
      templateId: 'heavy',
      face: { ...DEFAULT_DESIGN.face, width: 100000, mouth: { ...DEFAULT_DESIGN.face.mouth, curve: -99 } },
    });
    expect(d.face.width).toBe(FACE_LIMITS.width[1]);
    expect(d.face.mouth.curve).toBe(-1);
  });

  it('keeps a real photo and drops anything that is not one', () => {
    const good = sanitiseDesign({ photo: { src: 'data:image/png;base64,abc', scale: 1.4, x: 10, y: -10 } });
    expect(good.photo?.scale).toBe(1.4);

    // A remote URL would mean the sock preview fetches from someone else's
    // server — only in-browser data URLs survive a restore.
    for (const bad of [
      { src: 'https://example.com/tracker.png' },
      { src: 'javascript:alert(1)' },
      { src: 42 },
      'photo',
    ]) {
      expect(sanitiseDesign({ photo: bad }).photo).toBeNull();
    }
  });

  it('clamps photo placement so a restored image cannot fly off the sock', () => {
    const d = sanitiseDesign({ photo: { src: 'data:image/jpeg;base64,abc', scale: 99, x: 900, y: -900 } });
    expect(d.photo?.scale).toBeLessThanOrEqual(2.6);
    expect(d.photo?.x).toBe(60);
    expect(d.photo?.y).toBe(-60);
  });

  it('reports a photo to the pricer, since it is a paid extra', () => {
    const withPhoto = sanitiseDesign({ photo: { src: 'data:image/png;base64,abc' } });
    expect(pricedFrom(withPhoto).hasPhoto).toBe(true);
    expect(pricedFrom(DEFAULT_DESIGN).hasPhoto).toBe(false);
  });
});

describe('cuff text', () => {
  it('uppercases and keeps only knittable characters', () => {
    expect(normaliseCuffText('ok today')).toBe('OK TODAY');
    expect(normaliseCuffText('héllo☃')).toBe('HLLO');
  });

  it('stops at the character limit', () => {
    expect(normaliseCuffText('ABCDEFGHIJKLMNOP')).toHaveLength(CUFF_TEXT_MAX);
  });

  it('survives a restore round trip', () => {
    expect(sanitiseDesign({ cuffText: 'still here!!' }).cuffText).toBe(normaliseCuffText('still here!!'));
  });
});

describe('cloneDesign', () => {
  it('gives the bag its own copy, so editing on after adding changes nothing', () => {
    const original = { ...DEFAULT_DESIGN, photo: { src: 'data:image/png;base64,a', scale: 1, x: 0, y: 0 } };
    const copy = cloneDesign(original);
    copy.face.eyes.x = 47;
    copy.face.marks.push('tear');
    copy.photo!.scale = 2;

    expect(original.face.eyes.x).not.toBe(47);
    expect(original.face.marks).not.toContain('tear');
    expect(original.photo!.scale).toBe(1);
  });
});
