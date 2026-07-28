/**
 * Detail-page parsing, translation and contact extraction.
 *
 * The detail fixture is a real Komo page. Its polarity matters more than most
 * assertions here: the feature list names every amenity the site knows about on
 * every page, and only an extra `add` class distinguishes "has it" from "does
 * not". Reading that backwards would tell you a flat has a ממ"ד when it
 * explicitly says it has none.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseKomoDetail } from '../src/sources/komo';
import { extractPhone, whatsappLink, formatPhoneLocal } from '../src/sources/parse';
import { translateCity, translateNeighborhood, translateFeature } from '../src/translate';

const detailHtml = fs.readFileSync(path.join(__dirname, 'fixtures/komo-detail.html'), 'utf8');
const detail = parseKomoDetail(detailHtml);

test('the add class means present, and its absence means absent', () => {
  // This fixture's description says "ללא ממ\"ד" — no safe room — and the list
  // carries `mamad` with no `add`. If these two ever disagree, the polarity has
  // been read backwards.
  assert.equal(detail.hasSafeRoom, false);
  assert.equal(detail.hasElevator, false);

  // "מרוהטת" in the same description, and `riut add` in the list.
  assert.equal(detail.isFurnished, true);
  assert.equal(detail.hasAirConditioning, true);
  assert.equal(detail.hasBars, true);
});

test('absence is recorded as false, not left unknown', () => {
  // The distinction matters: `undefined` means "the listing never said" and
  // survives a strict amenity filter, whereas `false` is a positive statement
  // of absence that should reject.
  assert.notEqual(detail.hasSafeRoom, undefined);
  assert.equal(typeof detail.hasSafeRoom, 'boolean');
});

test('balcony is read from the description, negation-aware', () => {
  // Balcony is not one of the structured flags; this listing advertises
  // "מרפסת שמש קידמית ועורפית".
  assert.equal(detail.hasBalcony, true);
});

test('the full description is recovered and decoded', () => {
  assert.ok(detail.description && detail.description.length > 80);
  assert.doesNotMatch(detail.description!, /&quot;|&nbsp;|<[a-z]/i);
});

test('a page with no feature list yields nothing rather than throwing', () => {
  const empty = parseKomoDetail('<html><body>nope</body></html>');
  assert.equal(empty.hasSafeRoom, undefined);
  assert.equal(empty.hasBalcony, undefined);
});

test('extractPhone normalises the shapes Israeli numbers are written in', () => {
  for (const raw of ['050-123-4567', '0501234567', '+972 50 123 4567', '972501234567', '050 123 4567']) {
    assert.equal(extractPhone(`call me ${raw} thanks`), '+972501234567', `failed for ${raw}`);
  }
  // Landlines too — the leading 0 is dropped, the area code is kept.
  assert.equal(extractPhone('03-1234567'), '+97231234567');
  assert.equal(extractPhone('02-6543210'), '+97226543210');
});

test('extractPhone rejects things that merely look numeric', () => {
  assert.equal(extractPhone('דירת 3 חדרים 75 מטר'), undefined);
  assert.equal(extractPhone('₪6,500 לחודש'), undefined);
  assert.equal(extractPhone(''), undefined);
  assert.equal(extractPhone(null), undefined);
});

test('whatsappLink only builds a link from a normalised number', () => {
  assert.equal(whatsappLink('+972501234567'), 'https://wa.me/972501234567');
  // A half-parsed string must never become a broken link.
  assert.equal(whatsappLink('050-123-4567'), undefined);
  assert.equal(whatsappLink(null), undefined);
});

test('formatPhoneLocal renders the form people recognise', () => {
  assert.equal(formatPhoneLocal('+972501234567'), '050-123-4567');
});

test('translation covers cities, neighbourhoods and features', () => {
  assert.equal(translateCity('תל אביב יפו'), 'Tel Aviv-Yafo');
  assert.equal(translateCity('רמת גן'), 'Ramat Gan');
  assert.equal(translateNeighborhood('פלורנטין'), 'Florentin');
  assert.equal(translateNeighborhood('נווה צדק'), 'Neve Tzedek');
  assert.equal(translateFeature('ממ"ד'), 'Safe room');
  // The gershayim variant must resolve to the same thing.
  assert.equal(translateFeature('ממ״ד'), 'Safe room');
  assert.equal(translateFeature('מרפסת'), 'Balcony');
});

test('an unknown place returns undefined so callers keep the Hebrew', () => {
  assert.equal(translateCity('עיר שלא קיימת'), undefined);
  assert.equal(translateNeighborhood('שכונה מומצאת'), undefined);
});

test('a neighbourhood embedded in a longer string still resolves', () => {
  assert.equal(translateNeighborhood('שכונת התקווה, כרמי'), 'HaTikva');
});

test('text detection is tri-state, so silence is not read as absence', () => {
  const { detectAmenities } = require('../src/sources/parse');

  // Explicitly present.
  assert.equal(detectAmenities('דירה עם מרפסת גדולה').hasBalcony, true);

  // Explicitly absent — positive evidence, so false.
  assert.equal(detectAmenities('דירה ללא מעלית').hasElevator, false);

  // Never mentioned. This must stay undefined: a description that does not
  // enumerate features is not a description of a flat lacking them, and
  // collapsing it to false would make a hard amenity filter reject the market.
  assert.equal(detectAmenities('דירת 3 חדרים בקומה 2').hasBalcony, undefined);
  assert.equal(detectAmenities('דירת 3 חדרים בקומה 2').hasSafeRoom, undefined);
});

test('an unmentioned amenity survives a hard requirement, a denied one does not', () => {
  const { evaluate } = require('../src/criteria');
  const { DEFAULT_CRITERIA } = require('../src/types');
  const base = {
    source: 'komo', externalId: 'x', url: 'https://example.com/x',
    title: 'דירה', city: 'תל אביב יפו', priceIls: 6000, rooms: 3, sizeSqm: 70,
  };
  const strict = { ...DEFAULT_CRITERIA, requireBalcony: true };

  assert.equal(evaluate({ ...base, hasBalcony: true }, strict).matches, true);
  assert.equal(evaluate({ ...base, hasBalcony: false }, strict).matches, false);
  assert.equal(evaluate({ ...base, hasBalcony: undefined }, strict).matches, true);
});
