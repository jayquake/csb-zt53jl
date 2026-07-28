/**
 * JSON snapshot: state persistence and the static site's data file, in one.
 *
 * On GitHub Actions every run starts from a fresh checkout with no database.
 * Something has to carry the price history across runs, or every scan would
 * treat every listing as brand new and alert on all of them, every morning.
 *
 * A JSON snapshot committed to the repo is used rather than the SQLite file
 * itself for two reasons: it diffs readably in git instead of as an opaque
 * binary blob, and it is exactly the file the static UI needs to render. One
 * artifact serves both jobs.
 *
 *   import  →  scan  →  export  →  commit + publish
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import { log } from './logger';
import type { SearchCriteria } from './types';

export const SNAPSHOT_VERSION = 1;

interface SnapshotListing {
  id: string;
  source: string;
  externalId: string;
  url: string;
  fingerprint: string;
  title: string;
  description: string | null;
  priceIls: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  city: string;
  neighborhood: string | null;
  street: string | null;
  cityEn: string | null;
  neighborhoodEn: string | null;
  contactPhone: string | null;
  lat: number | null;
  lng: number | null;
  hasElevator: boolean;
  hasParking: boolean;
  hasBalcony: boolean;
  hasSafeRoom: boolean;
  isFurnished: boolean;
  petsAllowed: boolean;
  isRoommates: boolean;
  isAgency: boolean | null;
  imageUrls: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
  score: number;
  scoreReasons: string | null;
  priceHistory: Array<{ priceIls: number; seenAt: string }>;
  /** Only present for listings acted on, to keep the file small. */
  action?: { status: string; notes: string | null };
}

export interface Snapshot {
  version: number;
  generatedAt: string;
  criteria: SearchCriteria | null;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    ok: boolean;
    seen: number;
    new: number;
    drops: number;
    errors: string[];
    sourceStats: Record<string, number>;
  } | null;
  counts: { active: number; total: number };
  listings: SnapshotListing[];
}

/**
 * Alerts are deliberately included: the "don't alert the same price drop
 * twice" guard reads them, so dropping them would make a re-run re-notify.
 */
interface SnapshotFile extends Snapshot {
  alerts: Array<{ listingId: string; kind: string; oldPrice: number | null; newPrice: number | null; sentAt: string }>;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function exportSnapshot(prisma: PrismaClient, outputPath: string): Promise<Snapshot> {
  const [rows, lastRun, alerts, criteriaRow] = await Promise.all([
    prisma.listing.findMany({
      // Inactive listings are dropped: they are off the market, and keeping
      // them would grow the committed file without bound.
      where: { isActive: true },
      orderBy: { score: 'desc' },
      include: { priceHistory: { orderBy: { seenAt: 'asc' } }, action: true },
    }),
    prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.alert.findMany({ orderBy: { sentAt: 'desc' }, take: 2000 }),
    prisma.criteria.findUnique({ where: { id: 'default' } }),
  ]);

  const listings: SnapshotListing[] = rows.map((row: any) => ({
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    url: row.url,
    fingerprint: row.fingerprint,
    title: row.title,
    description: row.description,
    priceIls: row.priceIls,
    rooms: row.rooms,
    sizeSqm: row.sizeSqm,
    floor: row.floor,
    totalFloors: row.totalFloors,
    city: row.city,
    neighborhood: row.neighborhood,
    street: row.street,
    cityEn: row.cityEn,
    neighborhoodEn: row.neighborhoodEn,
    contactPhone: row.contactPhone,
    lat: row.lat,
    lng: row.lng,
    hasElevator: row.hasElevator,
    hasParking: row.hasParking,
    hasBalcony: row.hasBalcony,
    hasSafeRoom: row.hasSafeRoom,
    isFurnished: row.isFurnished,
    petsAllowed: row.petsAllowed,
    isRoommates: row.isRoommates,
    isAgency: row.isAgency,
    imageUrls: row.imageUrls,
    postedAt: toIso(row.postedAt),
    firstSeenAt: toIso(row.firstSeenAt)!,
    lastSeenAt: toIso(row.lastSeenAt)!,
    isActive: row.isActive,
    score: row.score,
    scoreReasons: row.scoreReasons,
    priceHistory: row.priceHistory.map((p: any) => ({ priceIls: p.priceIls, seenAt: toIso(p.seenAt)! })),
    ...(row.action ? { action: { status: row.action.status, notes: row.action.notes } } : {}),
  }));

  const snapshot: SnapshotFile = {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    criteria: criteriaRow ? (JSON.parse(criteriaRow.json) as SearchCriteria) : null,
    lastRun: lastRun
      ? {
          startedAt: toIso(lastRun.startedAt)!,
          finishedAt: toIso(lastRun.finishedAt),
          ok: lastRun.ok,
          seen: lastRun.seenCount,
          new: lastRun.newCount,
          drops: lastRun.dropCount,
          errors: lastRun.errors ? JSON.parse(lastRun.errors) : [],
          sourceStats: lastRun.sourceStats ? JSON.parse(lastRun.sourceStats) : {},
        }
      : null,
    counts: { active: listings.length, total: await prisma.listing.count() },
    listings,
    alerts: alerts.map((a: any) => ({
      listingId: a.listingId,
      kind: a.kind,
      oldPrice: a.oldPrice,
      newPrice: a.newPrice,
      sentAt: toIso(a.sentAt)!,
    })),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  // Pretty-printed so a git diff shows which listing changed, not one huge line.
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  log.info(`snapshot written: ${listings.length} listings → ${outputPath}`);

  return snapshot;
}

/**
 * Restores a snapshot into an empty database. Existing rows are left alone, so
 * running this against a populated local database is a no-op rather than a
 * destructive overwrite.
 */
export async function importSnapshot(prisma: PrismaClient, inputPath: string): Promise<number> {
  if (!fs.existsSync(inputPath)) {
    log.info(`no snapshot at ${inputPath} — starting from an empty database`);
    return 0;
  }

  let parsed: SnapshotFile;
  try {
    parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (err) {
    log.error(`snapshot at ${inputPath} is not valid JSON — refusing to import`, err);
    return 0;
  }

  if (parsed.version !== SNAPSHOT_VERSION) {
    log.warn(`snapshot version ${parsed.version} != ${SNAPSHOT_VERSION}; importing on a best-effort basis`);
  }

  const existing = await prisma.listing.count();
  if (existing > 0) {
    log.info(`database already has ${existing} listings — skipping import`);
    return 0;
  }

  let imported = 0;
  for (const listing of parsed.listings ?? []) {
    const { priceHistory, action, ...fields } = listing;
    try {
      await prisma.listing.create({
        data: {
          ...fields,
          postedAt: fields.postedAt ? new Date(fields.postedAt) : null,
          firstSeenAt: new Date(fields.firstSeenAt),
          lastSeenAt: new Date(fields.lastSeenAt),
          priceHistory: {
            create: (priceHistory ?? []).map((p) => ({ priceIls: p.priceIls, seenAt: new Date(p.seenAt) })),
          },
          ...(action ? { action: { create: { status: action.status, notes: action.notes } } } : {}),
        },
      });
      imported += 1;
    } catch (err) {
      // One malformed row must not abort the whole restore, or a single bad
      // record would cost the entire price history.
      log.warn(`could not import listing ${listing.id}`, err instanceof Error ? err.message : err);
    }
  }

  // Alerts come last: they reference listings, and they are what stops an
  // already-sent price drop from being announced a second time.
  for (const alert of parsed.alerts ?? []) {
    await prisma.alert
      .create({
        data: {
          listingId: alert.listingId,
          kind: alert.kind,
          oldPrice: alert.oldPrice,
          newPrice: alert.newPrice,
          channel: 'restored',
          ok: true,
          sentAt: new Date(alert.sentAt),
        },
      })
      .catch(() => undefined);
  }

  if (parsed.criteria) {
    await prisma.criteria
      .upsert({
        where: { id: 'default' },
        create: { id: 'default', json: JSON.stringify(parsed.criteria) },
        update: { json: JSON.stringify(parsed.criteria) },
      })
      .catch(() => undefined);
  }

  log.info(`snapshot restored: ${imported} listings from ${inputPath}`);
  return imported;
}

/** Copies the UI assets next to the generated data file, ready for Pages. */
export function buildStaticSite(publicDir: string, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const file of fs.readdirSync(publicDir)) {
    const from = path.join(publicDir, file);
    if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(outputDir, file));
  }
  // Stops Pages running the upload through Jekyll, which would drop files
  // whose names begin with an underscore.
  fs.writeFileSync(path.join(outputDir, '.nojekyll'), '');
  log.info(`static site assembled at ${outputDir}`);
}
