/**
 * Address → coordinates, so listings can be plotted on a map.
 *
 * None of the sources publish coordinates — Komo's detail pages carry no lat/lng
 * at all — so addresses have to be geocoded. Nominatim (OpenStreetMap) is used
 * because it is free and handles Israeli addresses well: "ראשונים 3, תל אביב יפו"
 * resolves to house-level precision.
 *
 * Queries are always in **Hebrew**. Transliterated English is materially worse:
 * "Sheinkin, Tel Aviv" resolves to a street in Givatayim — the wrong city
 * entirely — where the Hebrew form lands on the right one.
 *
 * Nominatim's usage policy is taken seriously here, because abusing a free
 * community service to save a few seconds would be indefensible:
 *
 *   - At most one request per second (this waits slightly longer).
 *   - A real User-Agent identifying the application.
 *   - Results cached indefinitely. An address is geocoded once, ever — streets
 *     do not move, so a repeat lookup would be pure waste.
 *   - Bounded per run, so a large backlog cannot turn into a bulk import.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from './logger';
import { config } from './config';
import { normalizeText } from './text';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * The cache key. Normalised so "לוינסקי 12 , תל אביב" and "לוינסקי 12, תל אביב"
 * are one entry rather than two lookups.
 *
 * Falls back to neighborhood when there is no street — Yad2's public search
 * page never exposes one (only Komo's detail pages do), so requiring a
 * street here would silently drop every Yad2 listing from the map. A
 * neighborhood centroid is far coarser than a house-level pin, but Tel Aviv
 * neighborhoods are small enough that it still lands in the right part of
 * the city, which beats not showing the listing at all.
 */
export function addressKey(
  street: string | null | undefined,
  neighborhood: string | null | undefined,
  city: string | null | undefined
): string | null {
  const parts = [street || neighborhood, city].map((p) => normalizeText(p ?? '')).filter(Boolean);
  // A city on its own would geocode to the city centre and put every listing
  // in that city on the same pin, which is worse than showing nothing.
  if (parts.length < 2) return null;
  return parts.join(', ');
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Israel's bounding box, used to reject obviously wrong results. */
function isPlausible(lat: number, lng: number): boolean {
  return lat > 29.4 && lat < 33.4 && lng > 34.2 && lng < 35.9;
}

async function lookup(query: string): Promise<Coordinates | null> {
  const url = `${ENDPOINT}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'il',
  })}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': config.geocode.userAgent,
      'Accept-Language': 'he,en',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`nominatim responded ${response.status}`);

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(results) || results.length === 0) return null;

  const lat = Number(results[0].lat);
  const lng = Number(results[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // A result outside Israel means the query matched something unrelated.
  if (!isPlausible(lat, lng)) return null;

  return { lat, lng };
}

/**
 * Fills in coordinates for listings that lack them.
 *
 * Failures are cached too — as a row with null coordinates — so an address that
 * Nominatim cannot resolve is not retried every single morning.
 */
export async function geocodeMissing(prisma: PrismaClient, limit = config.geocode.limit): Promise<number> {
  if (!config.geocode.enabled) return 0;

  const pending = await prisma.listing.findMany({
    where: {
      isActive: true,
      lat: null,
      OR: [{ street: { not: null } }, { neighborhood: { not: null } }],
    },
    select: { id: true, street: true, neighborhood: true, city: true },
    orderBy: { score: 'desc' },
  });

  if (pending.length === 0) return 0;

  let resolved = 0;
  let requests = 0;

  for (const listing of pending) {
    const key = addressKey(listing.street, listing.neighborhood, listing.city);
    if (!key) continue;

    const cached = await prisma.geocode.findUnique({ where: { address: key } });
    if (cached) {
      if (cached.lat != null && cached.lng != null) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { lat: cached.lat, lng: cached.lng },
        });
        resolved += 1;
      }
      continue; // cached miss: do not ask again
    }

    if (requests >= limit) break;

    try {
      // Query in Hebrew — see the note at the top of this file.
      const coords = await lookup(key);
      requests += 1;

      await prisma.geocode.create({
        data: { address: key, lat: coords?.lat ?? null, lng: coords?.lng ?? null },
      });

      if (coords) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: { lat: coords.lat, lng: coords.lng },
        });
        resolved += 1;
      }
    } catch (err) {
      log.warn(`geocode failed for "${key}"`, err instanceof Error ? err.message : err);
      // Not cached as a miss: a network blip is not the address's fault, and
      // caching it would permanently blacklist a perfectly good address.
    }

    await sleep(config.geocode.throttleMs);
  }

  log.info(`geocode: ${resolved} listings placed (${requests} new lookups, ${pending.length} pending)`);
  return resolved;
}
