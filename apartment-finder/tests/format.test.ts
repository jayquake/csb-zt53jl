import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDigest, formatStatus } from '../src/notify/format';
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
      cityEn: 'Tel Aviv-Yafo',
      neighborhoodEn: 'Florentin',
      contactPhone: '+972501234567',
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

test('the telegram flavor emits valid HTML, not WhatsApp markup', () => {
  const message = formatDigest(
    [alert({ kind: 'PRICE_DROP', oldPrice: 8000, newPrice: 7000 })],
    { flavor: 'telegram', appUrl: 'https://example.com' }
  )!;

  assert.match(message, /<b>/);
  assert.match(message, /<s>₪8,000<\/s>/); // real strikethrough, not ~...~
  assert.match(message, /<a href="https:\/\/www\.yad2\.co\.il\/item\/abc">/);
  assert.doesNotMatch(message, /\*Price drop/);
  assert.doesNotMatch(message, /~₪/);
});

test('listing titles are HTML-escaped for telegram', () => {
  // An unescaped < in a title would make Telegram reject the whole message
  // with "can't parse entities", losing the entire digest.
  const message = formatDigest(
    [alert({ listing: { ...alert().listing, title: 'דירה <script> & "quotes"' } })],
    { flavor: 'telegram' }
  )!;
  assert.match(message, /&lt;script&gt;/);
  assert.match(message, /&amp;/);
  assert.doesNotMatch(message, /<script>/);
});

test('telegram gets a larger budget than whatsapp', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    alert({ listingId: `l${i}`, listing: { ...alert().listing, id: `l${i}` } })
  );
  const wa = formatDigest(many, { flavor: 'whatsapp' })!;
  const tg = formatDigest(many, { flavor: 'telegram' })!;

  assert.ok(wa.length <= 1600, `whatsapp was ${wa.length}`);
  assert.ok(tg.length <= 4096, `telegram was ${tg.length}`);
  // Telegram has no 24h window and a 4096 limit, so it should carry more.
  const count = (s: string) => (s.match(/^\d+\. /gm) || []).length;
  assert.ok(count(tg) > count(wa), `telegram ${count(tg)} vs whatsapp ${count(wa)}`);
});

test('whatsapp rendering is unchanged by the flavor work', () => {
  const message = formatDigest([alert()], { flavor: 'whatsapp' })!;
  assert.match(message, /\*/);
  assert.doesNotMatch(message, /<b>|<a href/);
});

/* ---- morning status message ----
   The point of these: silence used to mean both "quiet market" and "scraper is
   dead", and only one of those is fine. */

test('a healthy quiet morning reads as quiet, not broken', () => {
  const message = formatStatus({ sourceStats: { komo: 12 }, activeCount: 28, errors: [] });
  assert.match(message, /Morning apartment update/);
  assert.doesNotMatch(message, /problem|⚠️/);
  assert.match(message, /28 listings still tracked/);
});

test('a scrape that returned nothing is flagged as a problem, not a quiet day', () => {
  // Exactly the shape of the real 2026-08-03 run: source ran, returned 0.
  const message = formatStatus({
    sourceStats: { komo: 0 },
    activeCount: 28,
    errors: ['komo תל אביב יפו: fetch failed'],
  });
  assert.match(message, /Morning scan problem/);
  // The raw error is what makes it diagnosable without opening the CI log.
  assert.match(message, /fetch failed/);
});

test('zero results with no thrown error is still reported as suspicious', () => {
  const message = formatStatus({ sourceStats: { komo: 0 }, activeCount: 28, errors: [] });
  assert.match(message, /Morning scan problem/);
  assert.match(message, /komo returned 0|returned 0/);
});

test('status escapes html for telegram', () => {
  const message = formatStatus({
    flavor: 'telegram',
    sourceStats: { komo: 0 },
    errors: ['<script>alert(1)</script> & co'],
  });
  assert.match(message, /&lt;script&gt;/);
  assert.doesNotMatch(message, /<script>/);
});

test('status caps a flood of errors instead of blowing the length limit', () => {
  const errors = Array.from({ length: 12 }, (_, i) => `source ${i} exploded`);
  const message = formatStatus({ sourceStats: { komo: 0 }, errors });
  assert.match(message, /…and 7 more/);
  assert.ok(message.length < 1600, `status was ${message.length}`);
});
