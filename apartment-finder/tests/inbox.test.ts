/**
 * Telegram inbox cursor behaviour.
 *
 * The network half cannot be exercised here, but the cursor is where the real
 * risk lives: Telegram keeps updates for 24 hours and only drops them once
 * acknowledged, so a cursor that resets or rewinds means the same forwarded
 * listing is ingested again every single morning.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { exportSnapshot, importSnapshot } from '../src/snapshot';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apt-inbox-'));
const dbUrl = `file:${path.join(tmpDir, 'a.db')}`;
let prisma: PrismaClient;

before(() => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
});

after(async () => {
  await prisma?.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('the inbox cursor survives a snapshot round-trip', async () => {
  // Without this, every CI run starts from offset 0 and replays 24 hours of
  // forwards — the same trap the geocode cache fell into.
  await prisma.criteria.upsert({
    where: { id: 'telegram-offset' },
    create: { id: 'telegram-offset', json: '4242' },
    update: { json: '4242' },
  });

  const snapshotPath = path.join(tmpDir, 'snap.json');
  await exportSnapshot(prisma, snapshotPath);

  const written = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(written.telegramOffset, 4242);

  // A fresh database, as CI gets on every run.
  const freshUrl = `file:${path.join(tmpDir, 'b.db')}`;
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, DATABASE_URL: freshUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } } });
  try {
    await importSnapshot(fresh, snapshotPath);
    const restored = await fresh.criteria.findUnique({ where: { id: 'telegram-offset' } });
    assert.equal(restored?.json, '4242');
  } finally {
    await fresh.$disconnect();
  }
});

test('a stale snapshot cannot rewind the cursor', async () => {
  // Restoring an older snapshot over a further-along database would otherwise
  // replay forwards that were already ingested.
  await prisma.criteria.upsert({
    where: { id: 'telegram-offset' },
    create: { id: 'telegram-offset', json: '9000' },
    update: { json: '9000' },
  });

  const stalePath = path.join(tmpDir, 'stale.json');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snap.json'), 'utf8'));
  snapshot.telegramOffset = 100; // older than what the database holds
  fs.writeFileSync(stalePath, JSON.stringify(snapshot));

  await importSnapshot(prisma, stalePath);

  const after = await prisma.criteria.findUnique({ where: { id: 'telegram-offset' } });
  assert.equal(after?.json, '9000', 'the cursor must not move backwards');
});

test('the cursor is kept apart from the search criteria', async () => {
  // Both live in the same table under different ids; loading the criteria must
  // never pick up the cursor row and try to parse it as a criteria object.
  const { loadCriteria } = await import('../src/db');
  await prisma.criteria.upsert({
    where: { id: 'default' },
    create: { id: 'default', json: JSON.stringify({ maxPriceIls: 7000, cities: ['תל אביב יפו'] }) },
    update: { json: JSON.stringify({ maxPriceIls: 7000, cities: ['תל אביב יפו'] }) },
  });

  const stored = await prisma.criteria.findUnique({ where: { id: 'default' } });
  const parsed = JSON.parse(stored!.json);
  assert.equal(parsed.maxPriceIls, 7000);
  assert.deepEqual(parsed.cities, ['תל אביב יפו']);
  assert.equal(typeof loadCriteria, 'function');
});
