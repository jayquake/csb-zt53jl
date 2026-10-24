/**
 * Homeless.co.il source adapter.
 *
 * Homeless is a classic server-rendered board, so the listings are in the HTML
 * directly — no embedded JSON to mine. It sits behind Cloudflare (a plain
 * request returns 403 "Just a moment..."), so it still needs the shared browser
 * session, but once the challenge clears the parsing is straightforward.
 *
 * Its robots.txt is permissive: only `/board/xmlcache` and `/index/xmlcache`
 * are disallowed, neither of which is touched here.
 */

import type { Page } from 'patchright';
import type { RawListing, SearchCriteria } from '../types';
import type { ListingSource, SourceResult } from './types';
import { openPage, throttle } from './browser';
import { config } from '../config';
import { log } from '../logger';
import { clean, detectAgency, detectAmenities, parseFloor, parseInteger, parsePrice, parseRooms, parseHebrewDate } from './parse';

/**
 * Builds a search URL.
 *
 * The site used to take filters as ordinary query params
 * (`/rent/?city=1&priceTo=8000&...`) — that shape is now dead: it 500s into
 * `GeneralError.aspx`, which falls back to rendering the unfiltered citywide
 * board rather than erroring visibly, so the old code "worked" (200 OK, no
 * exception) while silently returning zero matching cards every run.
 * Verified directly in a real browser: the live shape is a path segment,
 * `/rent/city=<hebrew name>`, with no query-string filters at all — the
 * price/rooms dropdowns are client-side JS, not URL params — and pagination
 * is `/rent/city=<name>/<page>`. So this scrapes unfiltered and leaves
 * price/room matching to the ingest pipeline's own criteria check, same as
 * it already does for the other sources' edge cases.
 */
function buildSearchUrl(city: string, page: number): string {
  const base = `https://www.homeless.co.il/rent/city=${encodeURIComponent(city)}`;
  return page > 1 ? `${base}/${page}` : base;
}

/**
 * Extracts listing cards from the DOM.
 *
 * Anchored on the `/rent/<id>` href shape rather than class names, which is the
 * one thing a board like this cannot change without breaking its own URLs.
 */
async function readCards(page: Page): Promise<Array<Record<string, string>>> {
  return page
    .evaluate(() => {
      const out: Array<Record<string, string>> = [];
      const anchors = Array.from(document.querySelectorAll('a[href*="/rent/"], a[href*="/item/"]'));
      for (const anchor of anchors) {
        const href = (anchor as HTMLAnchorElement).href;
        // Detail pages are `/rent/viewad,<id>.aspx` — the older `/rent/<id>` and
        // `/item/<id>` shapes are kept as a fallback in case other boards or a
        // future redesign use them.
        const idMatch = href.match(/viewad,(\d+)/) ?? href.match(/\/(?:rent|item)\/(\d+)/);
        if (!idMatch) continue;
        const card = anchor.closest('tr, li, article, div[class*="item"], div[class*="card"]') ?? anchor;
        const text = (card as HTMLElement).innerText ?? '';
        if (!text.trim()) continue;
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
}

/**
 * Interprets one card's visible text. Exported so it can be unit tested against
 * fixtures without a browser.
 */
export function parseCardText(
  externalId: string,
  href: string,
  text: string,
  image: string | undefined,
  fallbackCity: string,
  now: Date = new Date()
): RawListing | null {
  const body = clean(text);
  if (!body) return null;

  const priceMatch = body.match(/([\d.,]{3,})\s*(?:₪|ש"ח|שח)/) ?? body.match(/(?:₪|ש"ח)\s*([\d.,]{3,})/);
  const roomsMatch = body.match(/(\d+(?:\.\d+)?)\s*חד/);
  const sizeMatch = body.match(/(\d+)\s*מ["״']?ר/);
  const floorMatch = body.match(/קומה\s*([\d]+|קרקע|מרתף)/);
  const dateMatch = body.match(/(לפני\s*\d+\s*\S+|אתמול|היום|\d{1,2}[./]\d{1,2}[./]\d{2,4})/);

  // A card with neither a price nor a room count is almost certainly a banner
  // or a navigation row that matched the href pattern.
  const priceIls = parsePrice(priceMatch?.[1]);
  const rooms = parseRooms(roomsMatch?.[1]);
  if (priceIls == null && rooms == null) return null;

  const lines = body.split(/[\n|·]/).map((l) => l.trim()).filter(Boolean);
  const title = lines[0]?.slice(0, 200) || `דירה ${externalId}`;

  return {
    source: 'homeless',
    externalId,
    url: href,
    title,
    description: body,
    priceIls,
    rooms,
    sizeSqm: parseInteger(sizeMatch?.[1]),
    floor: floorMatch ? parseFloor(floorMatch[1]) : undefined,
    city: fallbackCity,
    imageUrls: image ? [image] : [],
    postedAt: parseHebrewDate(dateMatch?.[1], now),
    ...detectAmenities(body),
    isAgency: detectAgency(body),
    raw: { text: body },
  };
}

/**
 * SVG icon filename -> the RawListing field it confirms. Verified directly
 * against a live detail page (viewad,726976): each is rendered inside a
 * `.IconOption` div carrying an `on`/`off` class, with the icon's filename as
 * the stable identifier — the div's own class is a build-hashed CSS module
 * name elsewhere on this site, but this icon grid isn't, and the filenames
 * read as plain English regardless of the page's Hebrew/translated state.
 */
const ICON_FIELD: Record<string, keyof RawListing> = {
  'Elevators.svg': 'hasElevator',
  'parking.svg': 'hasParking',
  'Terrace.svg': 'hasBalcony',
  'safeRoom.svg': 'hasSafeRoom',
  'furnished.svg': 'isFurnished',
  'pets.svg': 'petsAllowed',
  'room-mates.svg': 'isRoommates',
};

/**
 * Turns what the detail page's DOM evaluation handed back (a raw amenities
 * map plus the floor/size/price block as plain text) into typed RawListing
 * fields. Pulled out of fetchDetailFields so it can be unit tested against a
 * captured real block without a browser — same split as parseCardText/readCards.
 */
export function parseDetailFields(amenities: Record<string, boolean>, detailText: string): Partial<RawListing> {
  const sizeMatch = detailText.match(/מ["״]ר:\s*(\d+)/);
  const floorMatch = detailText.match(/קומה:\s*(\d+|קרקע|מרתף)/);

  return {
    ...amenities,
    sizeSqm: parseInteger(sizeMatch?.[1]),
    floor: floorMatch ? parseFloor(floorMatch[1]) : undefined,
  };
}

/**
 * Visits a listing's own detail page for the fields the search-results card
 * never carries: size, floor and the amenity checklist (elevator, parking,
 * balcony, safe room, furnished, pets, roommates). The card only has
 * title/price/rooms — verified directly, every Homeless listing in the local
 * database had `sizeSqm`/amenities stuck at `null` because nothing ever
 * fetched this page before.
 *
 * Soft-fails: a listing this can't enrich still ships with whatever the card
 * gave it, same as the rest of this codebase's "one bad page doesn't sink the
 * run" rule.
 */
async function fetchDetailFields(url: string): Promise<Partial<RawListing>> {
  let page: Page | undefined;
  try {
    page = await openPage(url);
    const raw = await page.evaluate((iconField) => {
      const amenities: Record<string, boolean> = {};
      document.querySelectorAll('.IconOption').forEach((el) => {
        const img = el.querySelector('img.itemsAd');
        const src = img ? (img.getAttribute('src') || '').split('/').pop() || '' : '';
        const field = iconField[src];
        if (!field) return;
        amenities[field] = el.className.split(/\s+/).includes('on');
      });

      // The floor/size/price block has no stable container class either, so
      // it's found the same way: anchor on a leaf text node whose content is
      // recognisable (the "מ"ר:" label), then read a few ancestors up to
      // capture the whole sibling block as plain text.
      const leaf = Array.from(document.querySelectorAll('body *')).find(
        (el) => el.children.length === 0 && /מ["״]ר:?$/.test((el.textContent || '').trim())
      );
      let detailText = '';
      if (leaf) {
        let node: Element | null = leaf.parentElement;
        for (let i = 0; i < 4 && node && node.parentElement; i += 1) node = node.parentElement;
        detailText = node ? node.textContent || '' : '';
      }
      return { amenities, detailText };
    }, ICON_FIELD);

    return parseDetailFields(raw.amenities, raw.detailText);
  } catch (err) {
    log.debug(`homeless: detail page enrichment failed for ${url}`, err instanceof Error ? err.message : err);
    return {};
  } finally {
    await page?.close().catch(() => undefined);
    await throttle();
  }
}

export class HomelessSource implements ListingSource {
  readonly name = 'homeless' as const;

  async fetch(criteria: SearchCriteria): Promise<SourceResult> {
    const listings: RawListing[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const city of criteria.cities) {
      for (let pageNum = 1; pageNum <= config.browser.maxPages; pageNum += 1) {
        const url = buildSearchUrl(city, pageNum);
        let page: Page | undefined;

        try {
          log.info(`homeless: fetching ${url}`);
          page = await openPage(url);

          const cards = await readCards(page);
          const parsed = cards
            .map((c) => parseCardText(c.externalId, c.href, c.text, c.image, city))
            .filter((l): l is RawListing => l !== null);

          const fresh = parsed.filter((l) => !seen.has(l.externalId));
          fresh.forEach((l) => seen.add(l.externalId));

          // The card has no size or amenity data at all (see fetchDetailFields)
          // — only the detail page does, so each fresh listing costs one more
          // page load. Sequential and throttled, same politeness as the board
          // pages themselves.
          for (const listing of fresh) {
            Object.assign(listing, await fetchDetailFields(listing.url));
          }

          listings.push(...fresh);
          log.debug(`homeless: ${fresh.length} new listings from page ${pageNum}`);

          if (fresh.length === 0) break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`homeless ${city} p${pageNum}: ${message}`);
          log.warn(`homeless: failed on ${url}`, message);
          break;
        } finally {
          await page?.close().catch(() => undefined);
          await throttle();
        }
      }
    }

    return { source: 'homeless', listings, errors };
  }
}
