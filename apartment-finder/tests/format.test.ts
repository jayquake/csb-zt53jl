import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDigest } from '../src/notify/format';
import type { PendingAlert } from '../src/pipeline/ingest';

function alert(overrides: Partial<PendingAlert> = {}): PendingAlert {
  return {
    kind: 'NEW',
    listingId: 'l1',
    listing: {
      id: 'l1',
      title: 'דירת 3 חדרים',
      url: 'https://www.yad2.co.il/item/abc',
      source: 'yad2',
      priceIls: 6400,
      rooms: 3,
      sizeSqm: 72,
      floor: 2,
      city: 'תל אביב יפו',
      neighborhood: 'פלורנטין',
      score: 80,
      scoreReasons: ['well priced'],
      imageUrls: [],
    },
    ...overrides,
  };
}

test('no alerts produces no message rather than a daily "nothing found"', () => {
  assert.equal(formatDigest([]), null);
});

test('a new listing renders price, specs, location and a bare tappable URL', () => {
  const message = formatDigest([alert()]);
  assert.ok(message);
  assert.match(message!, /₪6,400/);
  assert.match(message!, /3 rooms/);
  assert.match(message!, /72m²/);
  assert.match(message!, /פלורנטין/);
  // WhatsApp linkifies bare URLs; markdown link syntax would render literally.
  assert.match(message!, /https:\/\/www\.yad2\.co\.il\/item\/abc/);
  assert.doesNotMatch(message!, /\]\(/);
});

test('a price drop shows both prices and the percentage', () => {
  const message = formatDigest([
    alert({ kind: 'PRICE_DROP', oldPrice: 8000, newPrice: 7000, listing: { ...alert().listing, priceIls: 7000 } }),
  ]);
  assert.ok(message);
  assert.match(message!, /13%/); // (8000-7000)/8000 = 12.5% -> 13
  assert.match(message!, /₪8,000/);
  assert.match(message!, /₪7,000/);
});

test('price drops are listed before new listings', () => {
  const message = formatDigest([
    alert({ kind: 'NEW', listingId: 'new-one', listing: { ...alert().listing, title: 'חדשה' } }),
    alert({ kind: 'PRICE_DROP', listingId: 'drop-one', oldPrice: 8000, newPrice: 7000, listing: { ...alert().listing, title: 'ירידה' } }),
  ])!;
  assert.ok(message.indexOf('ירידה') < message.indexOf('חדשה'));
});

test('a large batch is truncated rather than cut off mid-listing', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    alert({ listingId: `l${i}`, listing: { ...alert().listing, id: `l${i}`, title: `דירה מספר ${i} עם תיאור ארוך למדי` } })
  );
  const message = formatDigest(many, { appUrl: 'http://localhost:8080' })!;

  assert.ok(message.length <= 1600, `message was ${message.length} chars`);
  assert.match(message, /and \d+ more/);
  // The link out must survive truncation — it is how the rest is reachable.
  assert.match(message, /http:\/\/localhost:8080/);
});

test('missing optional fields are omitted, not rendered as undefined', () => {
  const sparse = alert({
    listing: { ...alert().listing, rooms: null, sizeSqm: null, floor: null, neighborhood: null, priceIls: null },
  });
  const message = formatDigest([sparse])!;
  assert.doesNotMatch(message, /undefined|null|NaN/);
  assert.match(message, /price not listed/);
});
