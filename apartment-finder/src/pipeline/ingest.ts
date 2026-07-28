/**
 * Ingest: turn scraped listings into persisted records, and work out which of
 * them deserve an alert.
 *
 * The alerting rules are intentionally conservative, because a feed that cries
 * wolf gets muted:
 *
 *  - NEW fires once per listing, ever. Re-posts collapse onto the existing
 *    record via the fingerprint, so the same flat cannot alert twice.
 *  - PRICE_DROP fires only on a real decrease that clears the configured
 *    percentage, and never twice for the same price point.
 */

import type { PrismaClient } from '@prisma/client';
import type { RawListing, SearchCriteria, AlertKind } from '../types';
import { evaluate, isSignificantDrop } from '../criteria';
import { computeFingerprint } from './fingerprint';
import { translateCity, translateNeighborhood } from '../translate';
import { log } from '../logger';

export interface PendingAlert {
  kind: AlertKind;
  listingId: string;
  oldPrice?: number;
  newPrice?: number;
  /** Snapshot used to render the message. */
  listing: {
    id: string;
    title: string;
    url: string;
    source: string;
    priceIls: number | null;
    rooms: number | null;
    sizeSqm: number | null;
    floor: number | null;
    city: string;
    neighborhood: string | null;
    cityEn: string | null;
    neighborhoodEn: string | null;
    contactPhone: string | null;
    score: number;
    scoreReasons: string[];
    imageUrls: string[];
  };
}

export interface IngestResult {
  seen: number;
  created: number;
  updated: number;
  rejected: number;
  alerts: PendingAlert[];
}

/**
 * Finds the record this scraped listing belongs to. Preference order matters:
 * an exact (source, externalId) hit is authoritative, and only when that misses
 * do we fall back to the fuzzy fingerprint match.
 */
async function findExisting(prisma: PrismaClient, listing: RawListing, fingerprint: string) {
  const exact = await prisma.listing.findUnique({
    where: { source_externalId: { source: listing.source, externalId: listing.externalId } },
  });
  if (exact) return exact;

  return prisma.listing.findFirst({
    where: { fingerprint },
    orderBy: { firstSeenAt: 'asc' },
  });
}

export async function ingest(
  prisma: PrismaClient,
  scraped: RawListing[],
  criteria: SearchCriteria,
  now: Date = new Date()
): Promise<IngestResult> {
  const result: IngestResult = { seen: scraped.length, created: 0, updated: 0, rejected: 0, alerts: [] };

  for (const raw of scraped) {
    const verdict = evaluate(raw, criteria, now);

    if (!verdict.matches) {
      result.rejected += 1;
      log.debug(`rejected ${raw.source}:${raw.externalId} — ${verdict.rejectedBy}`);
      continue;
    }

    const fingerprint = computeFingerprint(raw);
    const existing = await findExisting(prisma, raw, fingerprint);

    const data = {
      source: raw.source,
      externalId: raw.externalId,
      url: raw.url,
      fingerprint,
      title: raw.title,
      description: raw.description ?? null,
      priceIls: raw.priceIls ?? null,
      rooms: raw.rooms ?? null,
      sizeSqm: raw.sizeSqm ?? null,
      floor: raw.floor ?? null,
      totalFloors: raw.totalFloors ?? null,
      city: raw.city ?? '',
      neighborhood: raw.neighborhood ?? null,
      street: raw.street ?? null,
      cityEn: translateCity(raw.city) ?? null,
      neighborhoodEn: translateNeighborhood(raw.neighborhood) ?? null,
      lat: raw.lat ?? null,
      lng: raw.lng ?? null,
      hasElevator: raw.hasElevator ?? null,
      hasParking: raw.hasParking ?? null,
      hasBalcony: raw.hasBalcony ?? null,
      hasSafeRoom: raw.hasSafeRoom ?? null,
      isFurnished: raw.isFurnished ?? null,
      petsAllowed: raw.petsAllowed ?? null,
      isRoommates: raw.isRoommates ?? false,
      isAgency: raw.isAgency ?? null,
      imageUrls: JSON.stringify(raw.imageUrls ?? []),
      contact: raw.contact ?? null,
      contactPhone: raw.contactPhone ?? null,
      postedAt: raw.postedAt ?? null,
      score: verdict.score,
      scoreReasons: JSON.stringify(verdict.reasons),
      raw: raw.raw ? JSON.stringify(raw.raw) : null,
      lastSeenAt: now,
      isActive: true,
    };

    if (!existing) {
      const created = await prisma.listing.create({ data: { ...data, firstSeenAt: now } });
      result.created += 1;

      if (raw.priceIls != null) {
        await prisma.priceHistory.create({
          data: { listingId: created.id, priceIls: raw.priceIls, seenAt: now },
        });
      }

      if (verdict.score >= criteria.minScoreToAlert) {
        result.alerts.push(toPendingAlert('NEW', created, verdict.reasons, raw.imageUrls ?? []));
      }
      continue;
    }

    // Existing listing: update in place, then look for a price drop.
    const previousPrice = existing.priceIls;
    const updated = await prisma.listing.update({
      where: { id: existing.id },
      // Keep the original source/externalId. If this is a cross-source match,
      // overwriting them would make the record flip-flop between sources on
      // alternating scans and break the exact-match lookup above.
      data: {
        ...data,
        source: existing.source,
        externalId: existing.externalId,
        url: existing.url,
      },
    });
    result.updated += 1;

    if (raw.priceIls == null) continue;

    const lastRecorded = await prisma.priceHistory.findFirst({
      where: { listingId: existing.id },
      orderBy: { seenAt: 'desc' },
    });

    // Only append when the price actually moved, so the history stays a log of
    // changes rather than one row per scan.
    if (!lastRecorded || lastRecorded.priceIls !== raw.priceIls) {
      await prisma.priceHistory.create({
        data: { listingId: existing.id, priceIls: raw.priceIls, seenAt: now },
      });
    }

    if (previousPrice == null || !isSignificantDrop(previousPrice, raw.priceIls, criteria.minPriceDropPercent)) {
      continue;
    }

    // Guard against re-alerting the same drop if a scan is re-run.
    const alreadyAlerted = await prisma.alert.findFirst({
      where: { listingId: existing.id, kind: 'PRICE_DROP', newPrice: raw.priceIls, ok: true },
    });
    if (alreadyAlerted) continue;

    result.alerts.push({
      ...toPendingAlert('PRICE_DROP', updated, verdict.reasons, raw.imageUrls ?? []),
      oldPrice: previousPrice,
      newPrice: raw.priceIls,
    });
  }

  // Best finds first, and cap the batch so a backlog cannot produce a wall of text.
  result.alerts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'PRICE_DROP' ? -1 : 1;
    return b.listing.score - a.listing.score;
  });
  result.alerts = result.alerts.slice(0, criteria.maxAlertsPerRun);

  return result;
}

function toPendingAlert(
  kind: AlertKind,
  row: {
    id: string;
    title: string;
    url: string;
    source: string;
    priceIls: number | null;
    rooms: number | null;
    sizeSqm: number | null;
    floor: number | null;
    city: string;
    neighborhood: string | null;
    cityEn?: string | null;
    neighborhoodEn?: string | null;
    contactPhone?: string | null;
    score: number;
  },
  reasons: string[],
  imageUrls: string[]
): PendingAlert {
  return {
    kind,
    listingId: row.id,
    listing: {
      id: row.id,
      title: row.title,
      url: row.url,
      source: row.source,
      priceIls: row.priceIls,
      rooms: row.rooms,
      sizeSqm: row.sizeSqm,
      floor: row.floor,
      city: row.city,
      neighborhood: row.neighborhood,
      cityEn: row.cityEn ?? null,
      neighborhoodEn: row.neighborhoodEn ?? null,
      contactPhone: row.contactPhone ?? null,
      score: row.score,
      scoreReasons: reasons,
      imageUrls,
    },
  };
}

/**
 * Marks listings that have not been seen for a while as inactive, so the feed
 * reflects what is actually still on the market.
 */
export async function markStale(prisma: PrismaClient, staleAfterDays: number, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterDays * 86_400_000);
  const { count } = await prisma.listing.updateMany({
    where: { isActive: true, lastSeenAt: { lt: cutoff } },
    data: { isActive: false },
  });
  return count;
}
