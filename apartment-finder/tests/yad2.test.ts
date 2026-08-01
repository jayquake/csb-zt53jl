/**
 * Yad2 __NEXT_DATA__ parsing, run against real listing payloads captured from
 * a live scan and saved as a fixture.
 *
 * This exists because there was no coverage at all for `toRawListing` before
 * a real scan revealed it was silently dropping most of what Yad2 actually
 * provides: rooms/size (nested under `additionalDetails`, a container `pick`
 * never checked), floor and house number (nested two levels down, under
 * `address.house`, one deeper than `pick` descends), the exact coordinates
 * (`address.coords`, not `address.coordinates`), the agency name
 * (`customer.agencyName`), and tag-based amenities (`tags: [{name}]`). Using
 * the real captured shape rather than a hand-written stub is the point: a
 * hand-written fixture would have "passed" the old, broken code too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { toRawListing } from '../src/sources/yad2';

const fixture: Record<string, unknown>[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/yad2-listings.json'), 'utf8')
);

const byOrderId = (id: string) => fixture.find((o) => String(o.orderId) === id)!;

test('pulls rooms and size out of additionalDetails, not just the top level', () => {
  const listing = toRawListing(byOrderId('57260750'));
  assert.equal(listing?.rooms, 3);
  assert.equal(listing?.sizeSqm, 59);
});

test('reads floor and house number from address.house, two levels deep', () => {
  const listing = toRawListing(byOrderId('57260750'));
  assert.equal(listing?.floor, 5);
  assert.equal(listing?.street, 'הרצל 114');
});

test('ground floor (0) is not dropped as falsy', () => {
  const listing = toRawListing(byOrderId('50503509'));
  assert.equal(listing?.floor, 0);
});

test('uses Yad2\'s own exact coordinates instead of leaving them for geocoding', () => {
  const listing = toRawListing(byOrderId('57260750'));
  assert.ok(listing?.lat, 'expected coordinates to be present');
  assert.equal(Math.round((listing!.lat as number) * 1e6), Math.round(32.054872 * 1e6));
  assert.equal(Math.round((listing!.lng as number) * 1e6), Math.round(34.770744 * 1e6));
});

test('a listing with a named agency is flagged as an agency, not left unknown', () => {
  const listing = toRawListing(byOrderId('57260750'));
  assert.equal(listing?.isAgency, true);
});

test('a listing with no customer.agencyName is not guessed as an agency', () => {
  // 1006196 has no `customer` object at all and no free text to guess from.
  const listing = toRawListing(byOrderId('1006196'));
  assert.equal(listing?.isAgency, undefined);
});

test('the ממ"ד tag sets hasSafeRoom, the same way free text would', () => {
  const withTag = toRawListing(byOrderId('57260750'));
  assert.equal(withTag?.hasSafeRoom, true);

  // 1006196 has an empty tags array and no text mentioning a safe room.
  const withoutTag = toRawListing(byOrderId('1006196'));
  assert.equal(withoutTag?.hasSafeRoom, undefined);
});

test('every fixture listing parses to a plausible, non-null price', () => {
  for (const obj of fixture) {
    const listing = toRawListing(obj);
    assert.ok(listing, `expected ${obj.orderId} to parse`);
    assert.ok(listing!.priceIls && listing!.priceIls > 0, `expected a price for ${obj.orderId}`);
  }
});

test('a listing missing street still gets a usable title from neighborhood/city', () => {
  // 55981868 has no address.street in the fixture.
  const listing = toRawListing(byOrderId('55981868'));
  assert.equal(listing?.street, undefined);
  assert.ok(listing?.title && listing.title.length > 0);
});
