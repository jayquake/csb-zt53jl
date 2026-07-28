/**
 * Komo parser tests, run against a real search page saved from komo.co.il.
 *
 * Using a captured fixture rather than a hand-written snippet is the point: it
 * is the actual markup, so a change to Komo's card structure surfaces here
 * rather than as an empty scan at 07:30.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseKomoHtml, parseResultCount } from '../src/sources/komo';
import { detectAgency } from '../src/sources/parse';

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/komo-rent-tlv.html'), 'utf8');
const listings = parseKomoHtml(fixture, 'תל אביב יפו');

test('parses every card on a real results page', () => {
  assert.ok(listings.length >= 20, `expected 20+ listings, got ${listings.length}`);
  assert.ok(listings.every((l) => l.source === 'komo'));
  // IDs must be unique or the dedupe layer will silently merge distinct flats.
  assert.equal(new Set(listings.map((l) => l.externalId)).size, listings.length);
});

test('reads the server-side result count', () => {
  assert.equal(parseResultCount(fixture), 1142);
});

test('extracts price, rooms, size and floor', () => {
  const withPrice = listings.filter((l) => l.priceIls != null);
  assert.ok(withPrice.length / listings.length > 0.9, 'over 90% of cards should yield a price');

  const first = listings.find((l) => l.externalId === '4839371');
  assert.ok(first, 'expected the known listing to be present');
  assert.equal(first!.priceIls, 9500);
  assert.equal(first!.rooms, 2);
  assert.equal(first!.sizeSqm, 65);
  assert.equal(first!.floor, 2);
  assert.equal(first!.totalFloors, 2);
});

test('splits the title into city, neighborhood and street', () => {
  // Komo's title is a structured "city, neighborhood, street" field, which is
  // better location data than the other two sources expose.
  const first = listings.find((l) => l.externalId === '4839371')!;
  assert.equal(first.city, 'תל אביב יפו');
  assert.equal(first.neighborhood, 'נווה צדק');
  assert.equal(first.street, 'ראשונים');
});

test('builds absolute URLs for links and images', () => {
  for (const listing of listings) {
    assert.match(listing.url, /^https:\/\/www\.komo\.co\.il\/code\/nadlan\/details\/\?modaaNum=\d+$/);
    for (const image of listing.imageUrls ?? []) assert.match(image, /^https:\/\//);
  }
});

test('malformed input yields nothing rather than throwing', () => {
  assert.deepEqual(parseKomoHtml('<html><body>nope</body></html>', 'תל אביב'), []);
  assert.deepEqual(parseKomoHtml('', 'תל אביב'), []);
});

test('detectAgency reads Hebrew agent and owner markers', () => {
  assert.equal(detectAgency('דירה יפה, תיווך פינטו נדל"ן'), true);
  assert.equal(detectAgency('בלעדיות למשרדנו'), true);
  assert.equal(detectAgency('דירה להשכרה מהבעלים'), false);

  // "ללא תיווך" contains the word "תיווך" — the negative form must win, or
  // every no-fee listing would be misfiled as an agency post.
  assert.equal(detectAgency('דירה מהממת ללא תיווך!'), false);
  assert.equal(detectAgency('ללא דמי תיווך'), false);

  // Silence is not a claim either way.
  assert.equal(detectAgency('דירת 3 חדרים בפלורנטין'), undefined);
  assert.equal(detectAgency(''), undefined);
});
