/**
 * Yad2 source adapter.
 *
 * Yad2 is a Next.js app, so the rendered search page embeds its data as JSON in
 * `#__NEXT_DATA__`. Reading that is far more reliable than scraping the DOM,
 * whose class names are hashed and change between deploys.
 *
 * Two deliberate choices:
 *
 *  - We read the *public search page*, not `gw.yad2.co.il`. Yad2's robots.txt
 *    disallows `/api/` and `/ajax/`, and the gw host is the private API behind
 *    them. The search page carries the same data and is not disallowed.
 *  - The JSON is mined with a recursive shape-based scan rather than a fixed
 *    path like `props.pageProps.feed.private`. Yad2 reshuffles its internal
 *    state tree regularly; matching on "an object that has a price and an
 *    address" survives that, a hardcoded path does not.
 */

import type { Page } from 'patchright';
import type { RawListing, SearchCriteria } from '../types';
import type { ListingSource, SourceResult } from './types';
import { openPage, throttle } from './browser';
import { config } from '../config';
import { log } from '../logger';
import { clean, detectAgency, detectAmenities, parseFloor, parseInteger, parsePrice, parseRooms, parseHebrewDate } from './parse';
import { normalizeText } from '../criteria';

/**
 * Yad2 addresses cities by numeric code. Only the ones relevant to a Tel Aviv
 * search are listed; an unmapped city falls back to a free-text query.
 */
const CITY_CODES: Record<string, number> = {
  'תל אביב יפו': 5000,
  'תל אביב': 5000,
  'רמת גן': 8600,
  גבעתיים: 6300,
  'בני ברק': 6100,
  הרצליה: 6400,
  'בת ים': 6200,
  חולון: 6600,
  'ראשון לציון': 8300,
  'רמת השרון': 2650,
  'גבעת שמואל': 681,
  'קרית אונו': 2620,
};

function buildSearchUrl(criteria: SearchCriteria, city: string, page: number): string {
  const params = new URLSearchParams();

  const code = CITY_CODES[city.trim()];
  if (code) params.set('city', String(code));
  else params.set('text', city);

  if (criteria.minPriceIls != null || criteria.maxPriceIls != null) {
    params.set('price', `${criteria.minPriceIls ?? 0}-${criteria.maxPriceIls ?? 100000}`);
  }
  if (criteria.minRooms != null || criteria.maxRooms != null) {
    params.set('rooms', `${criteria.minRooms ?? 1}-${criteria.maxRooms ?? 20}`);
  }
  if (criteria.minSizeSqm != null || criteria.maxSizeSqm != null) {
    params.set('squaremeter', `${criteria.minSizeSqm ?? 0}-${criteria.maxSizeSqm ?? 1000}`);
  }
  if (page > 1) params.set('page', String(page));

  return `https://www.yad2.co.il/realestate/rent?${params.toString()}`;
}

/**
 * Walks an arbitrary JSON tree and collects every object that plausibly
 * describes a listing. Depth-limited so a cyclic or enormous payload cannot
 * hang the scan.
 */
export function harvestListingObjects(root: unknown, maxDepth = 12): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown, depth: number): void => {
    if (depth > maxDepth || node == null || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    const obj = node as Record<string, unknown>;
    if (looksLikeListing(obj)) found.push(obj);

    for (const value of Object.values(obj)) visit(value, depth + 1);
  };

  visit(root, 0);
  return found;
}

/** Keys Yad2 has used for the same concept across versions. */
const KEY_ALIASES = {
  id: ['id', 'orderId', 'adNumber', 'token', 'linkToken', 'adId'],
  price: ['price', 'currentPrice', 'priceValue', 'monthlyPrice'],
  rooms: ['rooms', 'roomsCount', 'room', 'numberOfRooms'],
  size: ['square_meters', 'squareMeters', 'squareMeter', 'size', 'builtArea'],
  floor: ['floor', 'floorNumber', 'onFloor'],
  city: ['city', 'cityText', 'city_name', 'cityName'],
  neighborhood: ['neighborhood', 'neighborhoodText', 'area', 'areaText', 'hood'],
  street: ['street', 'streetText', 'street_name', 'address'],
  title: ['title', 'headline', 'adTitle', 'title_text'],
  description: ['description', 'info_text', 'infoText', 'adDescription', 'searchText'],
  date: ['date', 'updated_at', 'updatedAt', 'dateAdded', 'dateInList'],
  images: ['images', 'imageUrls', 'image_urls', 'metaData', 'coverImage'],
} as const;

/**
 * Reads the first alias present on the object, descending one level into
 * nested containers Yad2 groups fields under.
 *
 * A candidate is only accepted if `asText` can actually make sense of it.
 * Without that check, `address` (one of the `street` aliases, for shapes
 * where it is a bare string) matches the *container* object on this schema
 * — `obj.address` is `{ city, street, house, coords, ... }`, not a string —
 * and short-circuits before the nested-container loop below ever gets a
 * chance to pull the real `address.street.text`. Verified against a live
 * Yad2 payload (order 57260750): without this check `street` came back
 * `undefined` despite `address.street.text` being `"הרצל"`.
 */
function pick(obj: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const key of aliases) {
    const value = obj[key];
    if (value != null && value !== '' && asText(value) != null) return value;
  }
  // Yad2 nests address parts under `address`/`location`, and room/size/floor
  // under `additionalDetails`.
  for (const container of ['address', 'location', 'addressDetails', 'additionalDetails']) {
    const nested = obj[container];
    if (nested && typeof nested === 'object') {
      for (const key of aliases) {
        const value = (nested as Record<string, unknown>)[key];
        if (value != null && value !== '' && asText(value) != null) return value;
      }
    }
  }
  return undefined;
}

/** Tag names Yad2 attaches to a listing, e.g. `ממ"ד`, `מרוהט`, `בניין משופץ`. */
function tagNames(obj: Record<string, unknown>): string[] {
  const tags = obj.tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => asText((t as Record<string, unknown>)?.name)).filter((t): t is string => !!t);
}

/** Some fields arrive as `{ text: "..." , id: 123 }` rather than a bare string. */
function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['text', 'name', 'title', 'value']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
    }
  }
  return undefined;
}

function looksLikeListing(obj: Record<string, unknown>): boolean {
  const hasId = KEY_ALIASES.id.some((k) => obj[k] != null);
  const hasPrice = KEY_ALIASES.price.some((k) => obj[k] != null);
  const hasPlace =
    KEY_ALIASES.city.some((k) => obj[k] != null) ||
    KEY_ALIASES.street.some((k) => obj[k] != null) ||
    obj.address != null;
  // Require all three: id alone matches analytics blobs, price alone matches
  // ad-config objects, and place alone matches the city autocomplete list.
  return hasId && hasPrice && hasPlace;
}

/** Converts one harvested object into a RawListing, or null if too incomplete. */
export function toRawListing(obj: Record<string, unknown>, now: Date = new Date()): RawListing | null {
  const externalId = asText(pick(obj, KEY_ALIASES.id));
  if (!externalId) return null;

  const priceIls = parsePrice(asText(pick(obj, KEY_ALIASES.price)));
  const city = clean(asText(pick(obj, KEY_ALIASES.city)) ?? '');
  const neighborhood = clean(asText(pick(obj, KEY_ALIASES.neighborhood)) ?? '') || undefined;
  const rooms = parseRooms(asText(pick(obj, KEY_ALIASES.rooms)));
  const sizeSqm = parseInteger(asText(pick(obj, KEY_ALIASES.size)));
  const description = clean(asText(pick(obj, KEY_ALIASES.description)) ?? '') || undefined;

  // `floor` and the house number live at `address.house.{floor,number}` —
  // two levels down, one deeper than `pick`'s single-level container descent
  // reaches — so they are read directly rather than through the alias table.
  const addressObj = (obj.address ?? {}) as Record<string, unknown>;
  const house = (addressObj.house ?? {}) as Record<string, unknown>;
  const floor = parseFloor(asText(pick(obj, KEY_ALIASES.floor))) ?? parseFloor(asText(house.floor));

  const streetName = clean(asText(pick(obj, KEY_ALIASES.street)) ?? '') || undefined;
  const houseNumber = asText(house.number);
  // "הרצל 114" reads and pastes into Waze better than the bare street name.
  const street = streetName && houseNumber ? `${streetName} ${houseNumber}` : streetName;

  const title =
    clean(asText(pick(obj, KEY_ALIASES.title)) ?? '') ||
    [street, neighborhood, city].filter(Boolean).join(', ') ||
    `דירה ${externalId}`;

  const images = extractImages(obj);
  const tags = tagNames(obj);
  const amenities = detectAmenities(
    [title, description, neighborhood, streetName, ...tags].filter(Boolean).join(' ')
  );

  const coords = extractCoords(obj);

  // A listing agency's name is a direct, unambiguous signal — far stronger
  // than guessing from free text, and this schema carries no other text to
  // guess from in the first place (commercial cards have no description).
  const agencyName = asText((obj.customer as Record<string, unknown> | undefined)?.agencyName);

  return {
    source: 'yad2',
    externalId,
    url: `https://www.yad2.co.il/item/${externalId}`,
    title,
    description,
    priceIls,
    rooms,
    sizeSqm,
    floor,
    city,
    neighborhood,
    street,
    lat: coords?.lat,
    lng: coords?.lng,
    ...amenities,
    // Structured booleans, when Yad2 provides them, win over the text guess.
    hasElevator: readBool(obj, ['elevator', 'hasElevator']) ?? amenities.hasElevator,
    hasParking: readBool(obj, ['parking', 'hasParking']) ?? amenities.hasParking,
    hasBalcony: readBool(obj, ['balcony', 'hasBalcony', 'balconies']) ?? amenities.hasBalcony,
    hasSafeRoom: readBool(obj, ['saferoom', 'hasSaferoom', 'mamad']) ?? amenities.hasSafeRoom,
    imageUrls: images,
    isAgency:
      readBool(obj, ['isAgency', 'merchant', 'isBroker']) ??
      (agencyName ? true : undefined) ??
      detectAgency([title, description].filter(Boolean).join(' ')),
    postedAt: parseHebrewDate(asText(pick(obj, KEY_ALIASES.date)), now),
    raw: obj,
  };
}

function readBool(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string' && ['1', 'true', 'כן'].includes(value.toLowerCase())) return true;
  }
  return undefined;
}

/**
 * Real, exact coordinates Yad2 already provides at `address.coords.{lat,lon}`
 * — verified against a live payload (order 57260750: `32.054872, 34.770744`,
 * the actual building). Missing the `coords` key name meant this always came
 * back empty and every Yad2 listing fell through to geocoding a
 * neighborhood-centroid guess instead of using the real address it already
 * had — worse precision for no reason.
 */
function extractCoords(obj: Record<string, unknown>): { lat: number; lng: number } | undefined {
  const containers = [obj, obj.address, obj.location, obj.coordinates].filter(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object'
  );
  for (const c of containers) {
    const coords = (c.coordinates ?? c.coords ?? c) as Record<string, unknown>;
    const lat = Number(coords.lat ?? coords.latitude);
    const lng = Number(coords.lon ?? coords.lng ?? coords.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { lat, lng };
  }
  return undefined;
}

function extractImages(obj: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const consider = (value: unknown): void => {
    if (typeof value === 'string' && /^https?:\/\/.+\.(jpe?g|png|webp)/i.test(value)) urls.add(value);
    else if (Array.isArray(value)) value.forEach(consider);
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) consider(v);
    }
  };
  for (const key of KEY_ALIASES.images) consider(obj[key]);
  return [...urls].slice(0, 5);
}

/** Reads and parses the `__NEXT_DATA__` payload from a loaded page. */
async function readNextData(page: Page): Promise<unknown | null> {
  const text = await page
    .evaluate(() => document.querySelector('#__NEXT_DATA__')?.textContent ?? null)
    .catch(() => null);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * DOM fallback, used when `__NEXT_DATA__` is absent (Yad2 has been migrating
 * parts of the site to streamed RSC, which does not expose that script tag).
 * Deliberately anchored on the stable `[data-nagish]`/`item-id` attributes and
 * on the href shape rather than hashed class names.
 */
async function readFromDom(page: Page): Promise<RawListing[]> {
  const rows = await page
    .evaluate(() => {
      const out: Array<Record<string, string>> = [];
      const anchors = Array.from(document.querySelectorAll('a[href*="/item/"]'));
      for (const anchor of anchors) {
        const card = anchor.closest('[data-testid], li, article') ?? anchor;
        const href = (anchor as HTMLAnchorElement).href;
        const idMatch = href.match(/\/item\/([A-Za-z0-9]+)/);
        if (!idMatch) continue;
        const text = (card as HTMLElement).innerText ?? '';
        const img = card.querySelector('img');
        out.push({
          externalId: idMatch[1],
          href,
          text,
          image: img ? (img as HTMLImageElement).src : '',
        });
      }
      return out;
    })
    .catch(() => [] as Array<Record<string, string>>);

  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.externalId)) continue;
    seen.add(row.externalId);

    const text = clean(row.text);
    if (!text) continue;

    const priceMatch = text.match(/₪\s*([\d.,]+)|([\d.,]+)\s*₪/);
    const priceIls = parsePrice(priceMatch ? priceMatch[1] || priceMatch[2] : undefined);
    const roomsMatch = text.match(/(\d+(?:\.\d+)?)\s*חדרים/);
    const sizeMatch = text.match(/(\d+)\s*מ["״']?ר/);
    const floorMatch = text.match(/קומה\s*(\d+|קרקע)/);

    listings.push({
      source: 'yad2',
      externalId: row.externalId,
      url: row.href,
      title: text.split('\n')[0].slice(0, 200) || `דירה ${row.externalId}`,
      description: text,
      priceIls,
      rooms: roomsMatch ? parseRooms(roomsMatch[1]) : undefined,
      sizeSqm: sizeMatch ? parseInteger(sizeMatch[1]) : undefined,
      floor: floorMatch ? parseFloor(floorMatch[1]) : undefined,
      city: '',
      imageUrls: row.image ? [row.image] : [],
      ...detectAmenities(text),
      isAgency: detectAgency(text),
      raw: { text },
    });
  }

  return listings;
}

export class Yad2Source implements ListingSource {
  readonly name = 'yad2' as const;

  async fetch(criteria: SearchCriteria): Promise<SourceResult> {
    const listings: RawListing[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const city of criteria.cities) {
      for (let pageNum = 1; pageNum <= config.browser.maxPages; pageNum += 1) {
        const url = buildSearchUrl(criteria, city, pageNum);
        let page: Page | undefined;

        try {
          log.info(`yad2: fetching ${url}`);
          page = await openPage(url, 'a[href*="/item/"]');

          const nextData = await readNextData(page);
          let pageListings: RawListing[] = [];

          if (nextData) {
            const harvested = harvestListingObjects(nextData);
            pageListings = harvested
              .map((obj) => toRawListing(obj))
              .filter((l): l is RawListing => l !== null);
            log.debug(`yad2: __NEXT_DATA__ yielded ${pageListings.length} listings`);
          }

          if (pageListings.length === 0) {
            pageListings = await readFromDom(page);
            log.debug(`yad2: DOM fallback yielded ${pageListings.length} listings`);
          }

          // The city we searched is more trustworthy than a missing field.
          for (const listing of pageListings) {
            if (!listing.city) listing.city = city;
          }

          const fresh = pageListings.filter((l) => !seen.has(l.externalId));
          fresh.forEach((l) => seen.add(l.externalId));
          listings.push(...fresh);

          // No new results means we have walked off the end of the pagination.
          if (fresh.length === 0) break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`yad2 ${city} p${pageNum}: ${message}`);
          log.warn(`yad2: failed on ${url}`, message);
          break;
        } finally {
          await page?.close().catch(() => undefined);
          await throttle();
        }
      }
    }

    return { source: 'yad2', listings, errors };
  }
}
