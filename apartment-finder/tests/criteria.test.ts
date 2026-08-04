import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isSignificantDrop } from '../src/criteria';
import { DEFAULT_CRITERIA, type RawListing, type SearchCriteria } from '../src/types';

const NOW = new Date('2026-07-28T09:00:00Z');

function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    source: 'yad2',
    externalId: 'x1',
    url: 'https://example.com/x1',
    title: 'דירת 3 חדרים',
    city: 'תל אביב יפו',
    priceIls: 6500,
    rooms: 3,
    sizeSqm: 70,
    postedAt: NOW,
    ...overrides,
  };
}

const criteria: SearchCriteria = { ...DEFAULT_CRITERIA };

test('a listing inside every bound matches', () => {
  const result = evaluate(listing(), criteria, NOW);
  assert.equal(result.matches, true);
  assert.ok(result.score > 0 && result.score <= 100);
});

test('over-budget listings are rejected', () => {
  const result = evaluate(listing({ priceIls: 9500 }), criteria, NOW);
  assert.equal(result.matches, false);
  assert.match(result.rejectedBy ?? '', /over budget/);
});

test('a listing with no price is rejected when a budget is set', () => {
  // "Call for price" posts cannot be shown to be affordable and are mostly spam.
  const result = evaluate(listing({ priceIls: undefined }), criteria, NOW);
  assert.equal(result.matches, false);
  assert.match(result.rejectedBy ?? '', /no price/);
});

test('excluded keywords reject regardless of everything else', () => {
  const result = evaluate(listing({ title: 'סאבלט לחודשיים' }), criteria, NOW);
  assert.equal(result.matches, false);
  assert.match(result.rejectedBy ?? '', /excluded keyword/);
});

test('roommate posts are rejected unless explicitly allowed', () => {
  const flat = listing({ isRoommates: true });
  assert.equal(evaluate(flat, criteria, NOW).matches, false);
  assert.equal(evaluate(flat, { ...criteria, allowRoommates: true }, NOW).matches, true);
});

test('cities are matched leniently across naming variants', () => {
  // Sources disagree: "תל אביב" vs "תל אביב יפו" vs "תל-אביב".
  for (const city of ['תל אביב', 'תל אביב יפו', 'תל-אביב']) {
    assert.equal(evaluate(listing({ city }), criteria, NOW).matches, true, `failed for ${city}`);
  }
  assert.equal(evaluate(listing({ city: 'באר שבע' }), criteria, NOW).matches, false);
});

test('missing optional data never rejects, it only costs points', () => {
  const withSize = evaluate(listing({ sizeSqm: 80 }), criteria, NOW);
  const noSize = evaluate(listing({ sizeSqm: undefined }), criteria, NOW);

  assert.equal(noSize.matches, true, 'unknown size must not reject');
  assert.ok(noSize.score < withSize.score, 'unknown size should score lower');
});

test('a hard amenity requirement rejects only a confirmed absence', () => {
  const strict = { ...criteria, requireElevator: true };

  assert.equal(evaluate(listing({ hasElevator: false }), strict, NOW).matches, false);
  assert.equal(evaluate(listing({ hasElevator: true }), strict, NOW).matches, true);
  // Unknown must not reject — most listings simply do not state it.
  assert.equal(evaluate(listing({ hasElevator: undefined }), strict, NOW).matches, true);
});

test('cheaper listings score higher than pricier ones', () => {
  const cheap = evaluate(listing({ priceIls: 5500 }), criteria, NOW).score;
  const pricey = evaluate(listing({ priceIls: 7900 }), criteria, NOW).score;
  assert.ok(cheap > pricey, `expected ${cheap} > ${pricey}`);
});

test('a favorite neighborhood raises the score', () => {
  const favorite = evaluate(listing({ neighborhood: 'פלורנטין' }), criteria, NOW);
  const other = evaluate(listing({ neighborhood: 'רמת החייל' }), criteria, NOW);
  assert.ok(favorite.score > other.score);
  // The reason is translated so the digest reads at a glance without Hebrew.
  assert.ok(favorite.reasons.some((r) => r.includes('Florentin')), favorite.reasons.join(' | '));
});

test('fresh listings outscore stale ones', () => {
  const old = new Date(NOW.getTime() - 20 * 86_400_000);
  assert.ok(evaluate(listing({ postedAt: NOW }), criteria, NOW).score > evaluate(listing({ postedAt: old }), criteria, NOW).score);
});

test('scores stay within 0-100 for extreme inputs', () => {
  const best = evaluate(
    listing({
      priceIls: 3000,
      sizeSqm: 200,
      neighborhood: 'פלורנטין',
      title: 'מרפסת מעלית חניה משופצת ממ"ד',
      hasElevator: true,
      hasParking: true,
      hasBalcony: true,
      hasSafeRoom: true,
      isFurnished: true,
    }),
    criteria,
    NOW
  );
  assert.ok(best.score <= 100 && best.score >= 0);
});

test('isSignificantDrop ignores increases and token reductions', () => {
  assert.equal(isSignificantDrop(7000, 6500, 3), true); // ~7%
  assert.equal(isSignificantDrop(7000, 6900, 3), false); // ~1.4%, agent bumping the ad
  assert.equal(isSignificantDrop(7000, 7500, 3), false); // an increase
  assert.equal(isSignificantDrop(7000, 7000, 3), false); // unchanged
});

test('posterType private_only rejects agent listings but keeps unknowns', () => {
  const strictish: SearchCriteria = { ...criteria, posterType: 'private_only' };

  assert.equal(evaluate(listing({ isAgency: true }), strictish, NOW).matches, false);
  assert.equal(evaluate(listing({ isAgency: false }), strictish, NOW).matches, true);
  // The common case: the listing never says. Dropping these would discard most
  // of the market, so they survive by default.
  assert.equal(evaluate(listing({ isAgency: undefined }), strictish, NOW).matches, true);
});

test('strictPosterFilter also drops listings of unknown provenance', () => {
  const strict: SearchCriteria = { ...criteria, posterType: 'private_only', strictPosterFilter: true };
  const result = evaluate(listing({ isAgency: undefined }), strict, NOW);
  assert.equal(result.matches, false);
  assert.match(result.rejectedBy ?? '', /unknown/);
});

test('posterType agency_only is the mirror image', () => {
  const agencyOnly: SearchCriteria = { ...criteria, posterType: 'agency_only' };
  assert.equal(evaluate(listing({ isAgency: true }), agencyOnly, NOW).matches, true);
  assert.equal(evaluate(listing({ isAgency: false }), agencyOnly, NOW).matches, false);
  assert.equal(evaluate(listing({ isAgency: undefined }), agencyOnly, NOW).matches, true);
});

test('posterType any ignores provenance entirely', () => {
  for (const isAgency of [true, false, undefined]) {
    assert.equal(evaluate(listing({ isAgency }), criteria, NOW).matches, true);
  }
});

/* ---- preferred amenities ----
   The point: with a flat 1/5 share per amenity, a flat with parking + safe room
   + furniture scored the same as one with the elevator and balcony actually
   asked for. These pin the ranking the other way round. */

test('the amenities you asked for outrank the same number of ones you did not', () => {
  const wanted = listing({
    hasElevator: true,
    hasBalcony: true,
    hasParking: false,
    hasSafeRoom: false,
    isFurnished: false,
  });
  const other = listing({
    hasElevator: false,
    hasBalcony: false,
    hasParking: true,
    hasSafeRoom: true,
    isFurnished: true,
  });

  const prefs: SearchCriteria = {
    ...criteria,
    preferences: { ...criteria.preferences, preferredAmenities: ['elevator', 'balcony'] },
  };

  const a = evaluate(wanted, prefs);
  const b = evaluate(other, prefs);
  assert.ok(a.score > b.score, `wanted ${a.score} should beat other ${b.score}`);
});

test('score reasons name the amenities rather than counting them', () => {
  const result = evaluate(
    listing({ hasElevator: true, hasBalcony: true }),
    { ...criteria, preferences: { ...criteria.preferences, preferredAmenities: ['elevator', 'balcony'] } }
  );
  assert.ok(
    result.reasons.some((r) => r.includes('elevator') && r.includes('balcony')),
    `reasons were ${JSON.stringify(result.reasons)}`
  );
});

test('a preferred amenity that is merely unmentioned does not reject the listing', () => {
  // The real data: most Tel Aviv listings never mention a balcony at all.
  const result = evaluate(
    listing({ hasElevator: undefined, hasBalcony: undefined }),
    { ...criteria, preferences: { ...criteria.preferences, preferredAmenities: ['elevator', 'balcony'] } }
  );
  assert.equal(result.matches, true, 'unknown amenities must never reject');
});

test('extras break a tie between listings that both have what you asked for', () => {
  // Extras are deliberately a tiebreaker, not a rival to the preferred set:
  // they share only 20% of the amenity weight between all five, so ONE extra is
  // worth ~0.6 points and can round away entirely. That is intended — parking
  // should not close the gap on a missing elevator. What must hold is that
  // extras never hurt, and that several of them do move the score.
  const prefs: SearchCriteria = {
    ...criteria,
    preferences: { ...criteria.preferences, preferredAmenities: ['elevator', 'balcony'] },
  };
  const bare = evaluate(listing({ hasElevator: true, hasBalcony: true }), prefs);
  const loaded = evaluate(
    listing({
      hasElevator: true,
      hasBalcony: true,
      hasParking: true,
      hasSafeRoom: true,
      isFurnished: true,
    }),
    prefs
  );
  assert.ok(loaded.score > bare.score, `loaded ${loaded.score} should beat bare ${bare.score}`);

  const one = evaluate(listing({ hasElevator: true, hasBalcony: true, hasParking: true }), prefs);
  assert.ok(one.score >= bare.score, 'an extra amenity must never lower the score');
});

test('with no preferred amenities set, scoring is the old flat share', () => {
  const flat: SearchCriteria = {
    ...criteria,
    preferences: { ...criteria.preferences, preferredAmenities: [] },
  };
  const a = evaluate(listing({ hasElevator: true, hasBalcony: true }), flat);
  const b = evaluate(listing({ hasParking: true, hasSafeRoom: true }), flat);
  assert.equal(a.score, b.score, 'without preferences all amenities weigh the same');
});
