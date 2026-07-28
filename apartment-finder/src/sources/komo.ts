/**
 * Komo (komo.co.il) source adapter.
 *
 * The best-behaved of the three sources, and the only one that needs no
 * browser. Verified directly: a plain HTTP request returns the real listing
 * page — no Radware loader, no Cloudflare interstitial, no JS challenge. So
 * this adapter uses `fetch` + cheerio, which makes it an order of magnitude
 * faster than the Playwright sources and keeps working even if no browser is
 * installed.
 *
 * Komo also does the filtering server-side, which is better than filtering
 * after the fact — fewer pages fetched for the same result:
 *
 *   fromPrice / toPrice   price range
 *   fromRooms / toRooms   room range
 *   privateOnly=1         owner listings only (no agents)
 *   iskiOnly=1            agent listings only
 *   yesElevator, yesParking, yesBalcony, yesMamad, yesStoreroom, petsFriendly
 *   priceOnly=1           drop "call for price" ads
 *
 * robots.txt disallows `/api/` (which is not used for listings) and explicitly
 * allows the image path this reads. Deep pagination is deliberately skipped:
 * Komo marks its pager links `rel="nofollow"` and disallows `/*currPage=` for
 * named crawlers, and a plain client gets an empty page 2 anyway. The tight
 * server-side filters mean the first page is already the relevant slice.
 */

import * as cheerio from 'cheerio';
import type { RawListing, SearchCriteria } from '../types';
import type { ListingSource, SourceResult } from './types';
import { config } from '../config';
import { log } from '../logger';
import { browserIdentity } from './browser';
import { clean, detectAgency, detectAmenities, parseFloor, parseInteger, parsePrice, parseRooms } from './parse';

const BASE = 'https://www.komo.co.il';
/** `nehes=1` is the apartments category. */
const APARTMENTS = 1;

function buildSearchUrl(criteria: SearchCriteria, city: string): string {
  const params = new URLSearchParams();
  params.set('nehes', String(APARTMENTS));
  params.set('cityName', city);

  if (criteria.minPriceIls != null) params.set('fromPrice', String(criteria.minPriceIls));
  if (criteria.maxPriceIls != null) params.set('toPrice', String(criteria.maxPriceIls));
  if (criteria.minRooms != null) params.set('fromRooms', String(criteria.minRooms));
  if (criteria.maxRooms != null) params.set('toRooms', String(criteria.maxRooms));

  // Let Komo apply the poster filter itself rather than fetching agent
  // listings only to discard them locally.
  if (criteria.posterType === 'private_only') params.set('privateOnly', '1');
  else if (criteria.posterType === 'agency_only') params.set('iskiOnly', '1');

  if (criteria.requireElevator) params.set('yesElevator', '1');
  if (criteria.requireParking) params.set('yesParking', '1');
  if (criteria.requireBalcony) params.set('yesBalcony', '1');
  if (criteria.requireSafeRoom) params.set('yesMamad', '1');
  if (criteria.requirePetsAllowed) params.set('petsFriendly', '1');

  // A budget is meaningless against "call for price" ads, so let Komo drop them.
  if (criteria.maxPriceIls != null) params.set('priceOnly', '1');

  return `${BASE}/code/nadlan/apartments-for-rent.asp?${params.toString()}`;
}

/**
 * Parses a Komo results page. Exported so it can be tested against a saved
 * fixture without touching the network.
 *
 * Card shape:
 *   <div class="View_Ad_Details modaaPPC__box" id="modaaPPC4839371">
 *     <img src="/api/modaot/tmunot/showPic/list/?picNum=…">
 *     <a href="/code/nadlan/details/?modaaNum=4839371">
 *       <h2 class="title">תל אביב יפו, נווה צדק, ראשונים</h2></a>
 *     <div class="price">9,500&nbsp;₪</div>
 *     <div class="description">דירות&nbsp;2.0 חדרים (65 מ"ר)<br>קומה: 2 מתוך 2</div>
 */
export function parseKomoHtml(html: string, fallbackCity: string, now: Date = new Date()): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  $('.modaaPPC__box, .View_Ad_Details').each((_i, element) => {
    const card = $(element);

    const href = card.find('a[href*="modaaNum="]').first().attr('href') ?? '';
    const externalId = href.match(/modaaNum=(\d+)/)?.[1] ?? card.attr('id')?.replace(/\D/g, '') ?? '';
    if (!externalId || seen.has(externalId)) return;

    const title = clean(card.find('.title').first().text());
    const priceText = clean(card.find('.price').first().text());
    // The description holds rooms, size and floor, with <br> between lines —
    // replaced by a space so the two halves do not run together.
    const descriptionHtml = card.find('.description').first().html() ?? '';
    const description = clean(cheerio.load(`<div>${descriptionHtml.replace(/<br\s*\/?>/gi, ' | ')}</div>`)('div').text());

    const priceIls = parsePrice(priceText);
    const rooms = parseRooms(description.match(/([\d.]+)\s*חדרים/)?.[1]);
    const sizeSqm = parseInteger(description.match(/\((\d+)\s*מ["״']?ר\)/)?.[1]);
    const floorMatch = description.match(/קומה:\s*(\d+|קרקע|מרתף)/);
    const totalFloors = parseInteger(description.match(/מתוך\s*(\d+)/)?.[1]);

    // The title is "city, neighborhood, street" — the most reliable location
    // data any of the three sources gives, since it is a structured field
    // rather than something mined out of prose.
    const parts = title.split(',').map((s) => s.trim()).filter(Boolean);
    const city = parts[0] || fallbackCity;
    const neighborhood = parts[1];
    const street = parts.slice(2).join(', ') || undefined;

    const image = card.find('img').first().attr('src');
    const fullText = `${title} ${description}`;

    seen.add(externalId);
    listings.push({
      source: 'komo',
      externalId,
      url: `${BASE}/code/nadlan/details/?modaaNum=${externalId}`,
      title: title || `דירה ${externalId}`,
      description,
      priceIls,
      rooms,
      sizeSqm,
      floor: floorMatch ? parseFloor(floorMatch[1]) : undefined,
      totalFloors,
      city,
      neighborhood,
      street,
      imageUrls: image ? [image.startsWith('http') ? image : `${BASE}${image}`] : [],
      postedAt: undefined, // Komo does not date its result cards.
      ...detectAmenities(fullText),
      isAgency: detectAgency(fullText),
      raw: { title, priceText, description },
    });
  });

  return listings;
}

/** Total result count Komo reports ("נמצאו 1,142 מודעות"), for logging. */
export function parseResultCount(html: string): number | undefined {
  const match = html.match(/נמצאו\s*([\d,]+)/);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class KomoSource implements ListingSource {
  readonly name = 'komo' as const;

  async fetch(criteria: SearchCriteria): Promise<SourceResult> {
    const listings: RawListing[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    // The same identity the browser sources present, so all three look like
    // one consistent client rather than three different ones.
    const { headers } = browserIdentity();

    for (const city of criteria.cities) {
      const url = buildSearchUrl(criteria, city);

      try {
        log.info(`komo: fetching ${url}`);
        const response = await fetch(url, {
          headers: { ...headers, Accept: 'text/html,application/xhtml+xml', Referer: `${BASE}/` },
          signal: AbortSignal.timeout(config.browser.navigationTimeoutMs),
        });

        if (!response.ok) {
          errors.push(`komo ${city}: HTTP ${response.status}`);
          continue;
        }

        const html = await response.text();
        const total = parseResultCount(html);
        const parsed = parseKomoHtml(html, city);

        const fresh = parsed.filter((l) => !seen.has(l.externalId));
        fresh.forEach((l) => seen.add(l.externalId));
        listings.push(...fresh);

        log.info(`komo: ${fresh.length} listings for ${city}${total ? ` (${total} matched server-side)` : ''}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`komo ${city}: ${message}`);
        log.warn(`komo: failed on ${url}`, message);
      }

      await sleep(config.browser.throttleMs);
    }

    return { source: 'komo', listings, errors };
  }
}
