import { Router } from 'express';
import { prisma, loadCriteria, saveCriteria } from './db';
import { runScan } from './pipeline/run';
import { parseManualPost } from './sources/manual';
import { ingest } from './pipeline/ingest';
import { config } from './config';
import { log } from './logger';
import { DEFAULT_CRITERIA, type SearchCriteria, type UserActionStatus } from './types';

export const api = Router();

/** Guards against two scans running at once and fighting over the browser profile. */
let scanInFlight: Promise<unknown> | null = null;

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function serializeListing(row: Record<string, any>) {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    description: row.description,
    priceIls: row.priceIls,
    rooms: row.rooms,
    sizeSqm: row.sizeSqm,
    floor: row.floor,
    totalFloors: row.totalFloors,
    city: row.city,
    neighborhood: row.neighborhood,
    neighborhoodEn: row.neighborhoodEn,
    cityEn: row.cityEn,
    street: row.street,
    lat: row.lat,
    lng: row.lng,
    amenities: {
      elevator: row.hasElevator,
      parking: row.hasParking,
      balcony: row.hasBalcony,
      safeRoom: row.hasSafeRoom,
      furnished: row.isFurnished,
      pets: row.petsAllowed,
    },
    // null means the listing never said; the UI shows a badge only for a
    // confirmed agent post.
    isAgency: row.isAgency,
    imageUrls: parseJsonArray(row.imageUrls),
    contact: row.contact,
    contactPhone: row.contactPhone,
    postedAt: row.postedAt,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    isActive: row.isActive,
    score: row.score,
    scoreReasons: parseJsonArray(row.scoreReasons),
    status: row.action?.status ?? null,
    notes: row.action?.notes ?? null,
    priceHistory: (row.priceHistory ?? []).map((p: any) => ({ priceIls: p.priceIls, seenAt: p.seenAt })),
  };
}

/** GET /api/listings — the main feed, filtered and sorted for the UI. */
api.get('/listings', async (req, res) => {
  const {
    status,
    source,
    minScore,
    minPrice,
    maxPrice,
    minRooms,
    maxRooms,
    minSize,
    poster,
    area,
    q,
    sort = 'score',
    includeHidden = 'false',
    includeInactive = 'false',
    limit = '100',
    offset = '0',
  } = req.query as Record<string, string>;

  const where: Record<string, unknown> = {};
  if (includeInactive !== 'true') where.isActive = true;
  if (source) where.source = source;
  if (minScore) where.score = { gte: Number(minScore) };

  // Price range as a single bounded filter — two separate `priceIls` keys would
  // overwrite each other and silently drop the lower bound.
  const priceRange: Record<string, number> = {};
  if (minPrice) priceRange.gte = Number(minPrice);
  if (maxPrice) priceRange.lte = Number(maxPrice);
  if (Object.keys(priceRange).length) where.priceIls = priceRange;

  const roomRange: Record<string, number> = {};
  if (minRooms) roomRange.gte = Number(minRooms);
  if (maxRooms) roomRange.lte = Number(maxRooms);
  if (Object.keys(roomRange).length) where.rooms = roomRange;

  if (minSize) where.sizeSqm = { gte: Number(minSize) };
  if (area) where.neighborhood = area;

  // Conditions that each need their own OR group. They are collected into a
  // single AND so a later one cannot clobber an earlier one's `OR` key.
  const and: Record<string, unknown>[] = [];

  // `private` keeps unknown-provenance listings, matching the scan-time rule —
  // most listings never say, and excluding them would empty the feed.
  //
  // `{ not: true }` is deliberately NOT used here: under SQL three-valued
  // logic `isAgency != true` is unknown for NULL rows, so Prisma excludes
  // them, and the permissive filter would return nothing at all.
  if (poster === 'private') and.push({ OR: [{ isAgency: false }, { isAgency: null }] });
  else if (poster === 'agency') and.push({ isAgency: true });

  if (q) {
    and.push({
      OR: [{ title: { contains: q } }, { description: { contains: q } }, { neighborhood: { contains: q } }],
    });
  }

  if (and.length) where.AND = and;

  if (status) where.action = { status };
  else if (includeHidden !== 'true') {
    // Hidden listings stay out of the default feed but remain queryable.
    where.NOT = { action: { status: 'HIDDEN' } };
  }

  const SORTS = {
    score: { score: 'desc' as const },
    price: { priceIls: 'asc' as const },
    price_desc: { priceIls: 'desc' as const },
    newest: { firstSeenAt: 'desc' as const },
    oldest: { firstSeenAt: 'asc' as const },
    size: { sizeSqm: 'desc' as const },
    rooms: { rooms: 'desc' as const },
    updated: { lastSeenAt: 'desc' as const },
  };
  const orderBy = SORTS[sort as keyof typeof SORTS] ?? SORTS.score;

  try {
    const [rows, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy,
        take: Math.min(Number(limit) || 100, 500),
        skip: Number(offset) || 0,
        include: {
          action: true,
          priceHistory: { orderBy: { seenAt: 'asc' }, take: 30 },
        },
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({ total, listings: rows.map(serializeListing) });
  } catch (err) {
    log.error('GET /listings failed', err);
    res.status(500).json({ error: 'failed to load listings' });
  }
});

api.get('/listings/:id', async (req, res) => {
  const row = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { action: true, priceHistory: { orderBy: { seenAt: 'asc' } }, alerts: true },
  });
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serializeListing(row));
});

/** POST /api/listings/:id/action — save, hide or mark contacted. */
api.post('/listings/:id/action', async (req, res) => {
  const { status, notes } = req.body as { status?: UserActionStatus; notes?: string };
  const valid: UserActionStatus[] = ['SAVED', 'HIDDEN', 'CONTACTED'];

  if (status != null && !valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${valid.join(', ')}` });
  }

  const exists = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!exists) return res.status(404).json({ error: 'not found' });

  // No status clears the action entirely, which is how "un-hide" works.
  if (!status) {
    await prisma.userAction.deleteMany({ where: { listingId: req.params.id } });
    return res.json({ ok: true, status: null });
  }

  const action = await prisma.userAction.upsert({
    where: { listingId: req.params.id },
    create: { listingId: req.params.id, status, notes: notes ?? null },
    update: { status, notes: notes ?? null },
  });

  res.json({ ok: true, status: action.status, notes: action.notes });
});

/** GET/PUT /api/criteria — edit the search from the phone. */
api.get('/criteria', async (_req, res) => {
  res.json({ criteria: await loadCriteria(), defaults: DEFAULT_CRITERIA });
});

api.put('/criteria', async (req, res) => {
  const incoming = req.body as Partial<SearchCriteria>;
  const current = await loadCriteria();

  const merged: SearchCriteria = {
    ...current,
    ...incoming,
    preferences: { ...current.preferences, ...(incoming.preferences ?? {}) },
  };

  // Guard the few fields where a bad value would either silence the alerts
  // entirely or turn them into a firehose.
  merged.minScoreToAlert = Math.max(0, Math.min(100, Number(merged.minScoreToAlert) || 0));
  merged.minPriceDropPercent = Math.max(0, Math.min(100, Number(merged.minPriceDropPercent) || 0));
  merged.maxAlertsPerRun = Math.max(1, Math.min(50, Number(merged.maxAlertsPerRun) || 10));
  const posterTypes = ['any', 'private_only', 'agency_only'];
  if (!posterTypes.includes(merged.posterType)) merged.posterType = 'any';
  merged.cities = (merged.cities ?? []).map(String).filter(Boolean);
  merged.neighborhoods = (merged.neighborhoods ?? []).map(String).filter(Boolean);
  merged.excludeKeywords = (merged.excludeKeywords ?? []).map(String).filter(Boolean);

  await saveCriteria(merged);
  res.json({ ok: true, criteria: merged });
});

/** POST /api/scan — trigger a scan by hand. */
api.post('/scan', async (req, res) => {
  if (scanInFlight) return res.status(409).json({ error: 'a scan is already running' });

  const dryRun = req.body?.dryRun === true;
  const promise = runScan({ dryRun }).finally(() => {
    scanInFlight = null;
  });
  scanInFlight = promise;

  // Scraping takes minutes, so return immediately and let the UI poll /status.
  if (req.body?.wait !== true) return res.status(202).json({ ok: true, started: true });

  try {
    res.json({ ok: true, summary: await promise });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/ingest/manual — paste a Facebook-group post (or any free text) and
 * have it tracked like a scraped listing.
 */
api.post('/ingest/manual', async (req, res) => {
  const { text, url } = req.body as { text?: string; url?: string };
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: 'text is required and must be at least 20 characters' });
  }

  const parsed = parseManualPost(text, url);
  if (!parsed) return res.status(400).json({ error: 'could not parse a listing out of that text' });

  const criteria = await loadCriteria();
  const result = await ingest(prisma, [parsed], criteria);

  res.json({
    ok: true,
    parsed,
    created: result.created,
    updated: result.updated,
    rejected: result.rejected,
    // Explaining the rejection is the difference between "it silently vanished"
    // and "ah, it's over my budget".
    note: result.rejected > 0 ? 'parsed, but it does not match your current criteria' : undefined,
  });
});

/**
 * GET /api/areas — the neighbourhoods that currently have listings.
 *
 * Served from the database rather than derived from a page of results, so the
 * dropdown offers every area with matches, not just those on the visible page.
 */
api.get('/areas', async (_req, res) => {
  try {
    const rows = await prisma.listing.findMany({
      where: { isActive: true, neighborhood: { not: null } },
      select: { neighborhood: true, neighborhoodEn: true },
    });

    const areas = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      const he = row.neighborhood!;
      const entry = areas.get(he);
      if (entry) entry.count += 1;
      else areas.set(he, { label: row.neighborhoodEn ?? he, count: 1 });
    }

    res.json({
      areas: [...areas.entries()]
        .map(([value, { label, count }]) => ({ value, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    });
  } catch (err) {
    log.error('GET /areas failed', err);
    res.status(500).json({ error: 'failed to load areas' });
  }
});

/** GET /api/status — last scan, counts, whether a scan is running now. */
api.get('/status', async (_req, res) => {
  const [lastRun, activeCount, savedCount, alertCount] = await Promise.all([
    prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.listing.count({ where: { isActive: true } }),
    prisma.userAction.count({ where: { status: 'SAVED' } }),
    prisma.alert.count(),
  ]);

  res.json({
    scanning: scanInFlight !== null,
    schedule: { cron: config.scanCron, timezone: config.timezone },
    channels: config.notify.channels,
    sources: config.sources,
    counts: { active: activeCount, saved: savedCount, alertsSent: alertCount },
    lastRun: lastRun
      ? {
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          ok: lastRun.ok,
          seen: lastRun.seenCount,
          new: lastRun.newCount,
          drops: lastRun.dropCount,
          errors: parseJsonArray(lastRun.errors),
          sourceStats: lastRun.sourceStats ? JSON.parse(lastRun.sourceStats) : {},
        }
      : null,
  });
});
