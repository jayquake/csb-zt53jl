/**
 * Integration test for the ingest pipeline against a real SQLite database.
 *
 * The alerting rules are the part of this system most likely to go quietly
 * wrong — a bug here means either a silent morning or a spammed phone, and
 * neither shows up in a unit test of the scoring function alone. So this runs
 * the actual Prisma path against a throwaway database.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { ingest, markStale } from '../src/pipeline/ingest';
import { DEFAULT_CRITERIA, type RawListing, type SearchCriteria } from '../src/types';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apt-finder-test-'));
const dbPath = path.join(tmpDir, 'test.db');
const dbUrl = `file:${dbPath}`;

let prisma: PrismaClient;

const criteria: SearchCriteria = { ...DEFAULT_CRITERIA, minScoreToAlert: 0, minPriceDropPercent: 3 };

function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    source: 'yad2',
    externalId: 'y-1',
    url: 'https://www.yad2.co.il/item/y-1',
    title: 'דירת 3 חדרים בפלורנטין',
    city: 'תל אביב יפו',
    neighborhood: 'פלורנטין',
    street: 'לוינסקי 12',
    priceIls: 7000,
    rooms: 3,
    sizeSqm: 70,
    floor: 2,
    ...overrides,
  };
}

before(() => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
});

after(async () => {
  await prisma?.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('a first sighting creates the listing and raises a NEW alert', async () => {
  const result = await ingest(prisma, [listing()], criteria);

  assert.equal(result.created, 1);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].kind, 'NEW');

  const history = await prisma.priceHistory.findMany();
  assert.equal(history.length, 1, 'the opening price should be recorded');
});

test('seeing the same listing again alerts nothing', async () => {
  const result = await ingest(prisma, [listing()], criteria);

  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.alerts.length, 0, 're-alerting an unchanged listing is what makes people mute alerts');

  // The price did not move, so no new history row should have been appended.
  assert.equal(await prisma.priceHistory.count(), 1);
});

test('the same flat cross-posted to another source merges instead of duplicating', async () => {
  const result = await ingest(prisma, [listing({ source: 'homeless', externalId: 'h-999' })], criteria);

  assert.equal(result.created, 0, 'the fingerprint should have matched the existing record');
  assert.equal(result.updated, 1);
  assert.equal(await prisma.listing.count(), 1);
});

test('a meaningful price drop alerts once, with both prices', async () => {
  const result = await ingest(prisma, [listing({ priceIls: 6300 })], criteria); // -10%

  assert.equal(result.alerts.length, 1);
  const alert = result.alerts[0];
  assert.equal(alert.kind, 'PRICE_DROP');
  assert.equal(alert.oldPrice, 7000);
  assert.equal(alert.newPrice, 6300);

  assert.equal(await prisma.priceHistory.count(), 2, 'the new price should be appended');
});

test('the same drop is not alerted twice', async () => {
  // Simulate the alert having been delivered, then re-run the same scan.
  const target = await prisma.listing.findFirstOrThrow();
  await prisma.alert.create({
    data: { listingId: target.id, kind: 'PRICE_DROP', oldPrice: 7000, newPrice: 6300, channel: 'console', ok: true },
  });

  const result = await ingest(prisma, [listing({ priceIls: 6300 })], criteria);
  assert.equal(result.alerts.length, 0);
});

test('a token reduction does not alert', async () => {
  // 6300 -> 6250 is 0.8%, below the 3% threshold: an agent bumping the ad.
  const result = await ingest(prisma, [listing({ priceIls: 6250 })], criteria);
  assert.equal(result.alerts.length, 0);
  // It is still recorded in the history, just not shouted about.
  assert.equal(await prisma.priceHistory.count(), 3);
});

test('a price increase never alerts', async () => {
  const result = await ingest(prisma, [listing({ priceIls: 9000 })], criteria);
  assert.equal(result.alerts.length, 0);
});

test('listings failing the criteria are rejected and never stored', async () => {
  const before = await prisma.listing.count();
  const result = await ingest(prisma, [listing({ externalId: 'y-2', priceIls: 25000 })], criteria);

  assert.equal(result.rejected, 1);
  assert.equal(result.created, 0);
  assert.equal(await prisma.listing.count(), before);
});

test('the alert batch is capped so a backlog cannot spam', async () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    listing({
      externalId: `bulk-${i}`,
      street: `רחוב ${i}`,
      neighborhood: `שכונה ${i}`,
      priceIls: 6000 + i,
    })
  );

  const result = await ingest(prisma, many, { ...criteria, maxAlertsPerRun: 5 });
  assert.equal(result.alerts.length, 5);
});

test('markStale retires listings that stopped appearing', async () => {
  const future = new Date(Date.now() + 30 * 86_400_000);
  const count = await markStale(prisma, 14, future);

  assert.ok(count > 0);
  assert.equal(await prisma.listing.count({ where: { isActive: true } }), 0);
});

test('the private-poster query must not drop unknown-provenance rows', () => {
  // Regression guard. `isAgency: { not: true }` looks correct but is wrong:
  // under SQL three-valued logic the comparison is unknown for NULL, so Prisma
  // excludes every listing that never stated who posted it — which is most of
  // them. The feed filter must use an explicit OR against null instead.
  return (async () => {
    await prisma.listing.deleteMany();
    const base = {
      source: 'komo', url: 'https://example.com/x', fingerprint: 'fp',
      title: 't', city: 'תל אביב יפו', priceIls: 6000,
    };
    await prisma.listing.create({ data: { ...base, externalId: 'unknown-1', isAgency: null } });
    await prisma.listing.create({ data: { ...base, externalId: 'owner-1', isAgency: false } });
    await prisma.listing.create({ data: { ...base, externalId: 'agent-1', isAgency: true } });

    const naive = await prisma.listing.count({ where: { isAgency: { not: true } } });
    const correct = await prisma.listing.count({
      where: { OR: [{ isAgency: false }, { isAgency: null }] },
    });

    assert.equal(naive, 1, 'the naive form silently drops the null row');
    assert.equal(correct, 2, 'owner and unknown listings must both survive');

    assert.equal(await prisma.listing.count({ where: { isAgency: true } }), 1);
  })();
});

test('narrowing the cities retires out-of-scope listings immediately', () => {
  // Dropping a city should take effect at once. Leaving those listings to age
  // out via staleAfterDays would mean a fortnight of results you have
  // explicitly excluded — which is exactly what happened when the default
  // included Ramat Gan and Givatayim.
  return (async () => {
    const { pruneOutOfScope } = await import('../src/pipeline/ingest');
    await prisma.listing.deleteMany();

    const base = { source: 'komo', url: 'https://example.com/x', fingerprint: 'f', title: 't', priceIls: 6000 };
    await prisma.listing.create({ data: { ...base, externalId: 'tlv-1', city: 'תל אביב יפו', fingerprint: 'f1' } });
    await prisma.listing.create({ data: { ...base, externalId: 'tlv-2', city: 'תל אביב', fingerprint: 'f2' } });
    await prisma.listing.create({ data: { ...base, externalId: 'rg-1', city: 'רמת גן', fingerprint: 'f3' } });
    await prisma.listing.create({ data: { ...base, externalId: 'gv-1', city: 'גבעתיים', fingerprint: 'f4' } });

    const retired = await pruneOutOfScope(prisma, { ...criteria, cities: ['תל אביב יפו'] });

    assert.equal(retired, 2, 'Ramat Gan and Givatayim should be retired');
    assert.equal(await prisma.listing.count({ where: { isActive: true } }), 2);

    // "תל אביב" must survive a "תל אביב יפו" filter — the sources spell the
    // same city both ways, and rejecting one would halve the real results.
    const kept = await prisma.listing.findMany({ where: { isActive: true }, select: { city: true } });
    assert.deepEqual(kept.map((k) => k.city).sort(), ['תל אביב', 'תל אביב יפו']);
  })();
});

test('an empty city list prunes nothing', () => {
  // No cities configured means "anywhere", not "nowhere" — pruning everything
  // would silently empty the feed.
  return (async () => {
    const { pruneOutOfScope } = await import('../src/pipeline/ingest');
    await prisma.listing.updateMany({ data: { isActive: true } });
    const before = await prisma.listing.count({ where: { isActive: true } });
    assert.equal(await pruneOutOfScope(prisma, { ...criteria, cities: [] }), 0);
    assert.equal(await prisma.listing.count({ where: { isActive: true } }), before);
  })();
});
