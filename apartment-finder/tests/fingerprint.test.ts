import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFingerprint } from '../src/pipeline/fingerprint';
import type { RawListing } from '../src/types';

function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    source: 'yad2',
    externalId: 'a1',
    url: 'https://example.com/a1',
    title: 'דירה',
    city: 'תל אביב יפו',
    neighborhood: 'פלורנטין',
    street: 'לוינסקי 12',
    rooms: 3,
    sizeSqm: 70,
    floor: 2,
    priceIls: 6500,
    ...overrides,
  };
}

test('the same apartment cross-posted to two sources shares a fingerprint', () => {
  const onYad2 = listing({ source: 'yad2', externalId: 'a1' });
  const onHomeless = listing({ source: 'homeless', externalId: '999' });
  assert.equal(computeFingerprint(onYad2), computeFingerprint(onHomeless));
});

test('price is excluded from the fingerprint', () => {
  // Otherwise a price drop would look like a brand new listing, which is
  // exactly the event we need to detect.
  assert.equal(computeFingerprint(listing({ priceIls: 6500 })), computeFingerprint(listing({ priceIls: 5900 })));
});

test('small measurement disagreements still collapse to one listing', () => {
  // Two sources rounding 78m² differently must not create a duplicate.
  assert.equal(computeFingerprint(listing({ sizeSqm: 70 })), computeFingerprint(listing({ sizeSqm: 71 })));
});

test('genuinely different apartments get different fingerprints', () => {
  const a = computeFingerprint(listing());
  assert.notEqual(a, computeFingerprint(listing({ rooms: 5 })));
  assert.notEqual(a, computeFingerprint(listing({ neighborhood: 'רמת אביב' })));
  assert.notEqual(a, computeFingerprint(listing({ floor: 7 })));
});

test('house-number suffixes do not split a listing', () => {
  assert.equal(computeFingerprint(listing({ street: 'לוינסקי 12' })), computeFingerprint(listing({ street: 'לוינסקי 12א' })));
});

test('sparse listings stay distinct instead of all colliding', () => {
  // With almost no structured data, a content hash would merge unrelated flats
  // into one record. They must fall back to a per-listing unique id.
  const sparseA = { ...listing({ externalId: 'p1' }), city: '', neighborhood: undefined, street: undefined, rooms: undefined, sizeSqm: undefined, floor: undefined };
  const sparseB = { ...sparseA, externalId: 'p2' };
  assert.notEqual(computeFingerprint(sparseA), computeFingerprint(sparseB));
});
