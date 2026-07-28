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
import { clean, detectAgency, detectAmenities, extractPhone, parseFloor, parseInteger, parsePrice, parseRooms } from './parse';

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

/**
 * Komo's detail page carries a structured feature list that the result cards
 * omit. Reading it is the difference between guessing "balcony" from prose and
 * knowing whether a flat has a ממ"ד.
 *
 *   <li class='mamad'>ממד</li>          -> absent
 *   <li class='mizug add'>מיזוג</li>    -> present
 *
 * The `add` modifier means present. That polarity was verified against four
 * live listings by cross-checking the flags with the free-text description —
 * one said "ללא ממ\"ד" (no safe room) and duly had `mamad` without `add`, and
 * another said "מרוהטת" (furnished) and had `riut add`. Getting this backwards
 * would silently mislabel every listing, which is why it was checked rather
 * than assumed.
 */
const FEATURE_CLASSES: Record<string, keyof DetailFeatures> = {
  mamad: 'hasSafeRoom',
  maalit: 'hasElevator',
  soragim: 'hasBars',
  mizug: 'hasAirConditioning',
  riut: 'isFurnished',
  machsan: 'hasStorage',
  hanaya: 'hasParking',
  parking: 'hasParking',
  unit: 'isStudioUnit',
};

export interface DetailFeatures {
  hasSafeRoom?: boolean;
  hasElevator?: boolean;
  hasBars?: boolean;
  hasAirConditioning?: boolean;
  isFurnished?: boolean;
  hasStorage?: boolean;
  hasParking?: boolean;
  isStudioUnit?: boolean;
}

export interface KomoDetail extends DetailFeatures {
  description?: string;
  hasBalcony?: boolean;
  isAgency?: boolean;
  phone?: string;
}

/**
 * Parses a detail page. Exported for fixture-based testing — the network half
 * cannot be exercised in CI, but the interpretation is where bugs live.
 */
export function parseKomoDetail(html: string): KomoDetail {
  const detail: KomoDetail = {};

  const listMatch = html.match(/<ul[^>]*list-style-type:\s*none[^>]*>([\s\S]*?)<\/ul>/);
  if (listMatch) {
    for (const item of listMatch[1].matchAll(/<li class='([^']*)'/g)) {
      const classes = item[1].trim().split(/\s+/);
      const field = FEATURE_CLASSES[classes[0]];
      // Every feature the site knows about is listed on every page; `add` is
      // what distinguishes "has it" from "does not". So an entry without it is
      // a positive statement of absence, not missing data.
      if (field) detail[field] = classes.includes('add');
    }
  }

  // The description lives in the og:description meta and in #teurWrap; the
  // meta tag is the more reliably present of the two.
  const description =
    html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ??
    html.match(/<div id="teurWrap">([\s\S]*?)<\/div>/)?.[1];

  if (description) {
    const text = clean(
      description
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
    );
    detail.description = text;

    // Balcony is not one of the structured flags, so it still comes from the
    // prose — but the negation-aware detector handles "ללא מרפסת" correctly.
    const fromText = detectAmenities(text);
    detail.hasBalcony = fromText.hasBalcony;
    detail.isAgency = detectAgency(text);
    detail.phone = extractPhone(text);
  }

  return detail;
}

/**
 * Fetches and parses one detail page. Returns null rather than throwing so a
 * single bad page cannot abort enrichment for the rest.
 */
async function fetchDetail(externalId: string, headers: Record<string, string>): Promise<KomoDetail | null> {
  try {
    const response = await fetch(`${BASE}/code/nadlan/details/?modaaNum=${externalId}`, {
      headers: { ...headers, Accept: 'text/html', Referer: `${BASE}/` },
      signal: AbortSignal.timeout(config.browser.navigationTimeoutMs),
    });
    if (!response.ok) return null;
    return parseKomoDetail(await response.text());
  } catch {
    return null;
  }
}

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

    await this.enrich(listings, headers, errors);

    return { source: 'komo', listings, errors };
  }

  /**
   * Fills in the structured amenities the result cards omit by reading each
   * listing's detail page.
   *
   * Bounded on purpose. Enrichment costs one request per listing, so it runs
   * only for listings that already pass the price and room filters — there is
   * no point spending a request to learn the amenities of a flat that is over
   * budget — and stops at `enrichLimit`. That keeps a scan to a couple of dozen
   * extra requests rather than one per result.
   */
  private async enrich(
    listings: RawListing[],
    headers: Record<string, string>,
    errors: string[]
  ): Promise<void> {
    if (!config.komo.enrich) return;

    const candidates = listings.slice(0, config.komo.enrichLimit);
    if (candidates.length === 0) return;

    log.info(`komo: enriching ${candidates.length} listings with detail-page amenities`);
    let enriched = 0;

    for (const listing of candidates) {
      const detail = await fetchDetail(listing.externalId, headers);
      await sleep(config.browser.throttleMs);

      if (!detail) continue;
      enriched += 1;

      // The detail page is authoritative for the structured flags: it states
      // presence AND absence, where the card text could only ever hint.
      if (detail.hasSafeRoom !== undefined) listing.hasSafeRoom = detail.hasSafeRoom;
      if (detail.hasElevator !== undefined) listing.hasElevator = detail.hasElevator;
      if (detail.hasParking !== undefined) listing.hasParking = detail.hasParking;
      if (detail.isFurnished !== undefined) listing.isFurnished = detail.isFurnished;
      if (detail.hasBalcony !== undefined) listing.hasBalcony = detail.hasBalcony;

      // The full description is richer than the card blurb, so prefer it — and
      // re-derive the text-based signals from it.
      if (detail.description) listing.description = detail.description;
      if (detail.isAgency !== undefined) listing.isAgency = detail.isAgency;
      if (detail.phone) listing.contactPhone = detail.phone;
    }

    log.info(`komo: enriched ${enriched}/${candidates.length}`);
    if (enriched === 0 && candidates.length > 0) {
      errors.push('komo: detail enrichment returned nothing — the detail page markup may have changed');
    }
  }
}
