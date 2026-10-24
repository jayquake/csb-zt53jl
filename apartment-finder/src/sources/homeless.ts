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
