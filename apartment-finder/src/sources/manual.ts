/**
 * Manual paste source.
 *
 * Facebook groups are deliberately not scraped — the Groups API was withdrawn
 * in 2020 and automated collection breaches Meta's terms. This adapter is the
 * compliant substitute: paste a post's text into the UI (or POST it to
 * /api/ingest/manual) and it goes through the same normalize → dedupe → score →
 * alert path as a scraped listing, so a flat someone mentioned in a group is
 * tracked for price drops just like a Yad2 one.
 *
 * The parser is intentionally forgiving, because group posts are free-form.
 */

import { createHash } from 'crypto';
import type { RawListing } from '../types';
import { clean, detectAgency, detectAmenities, extractPhone, parseFloor, parseInteger, parsePrice, parseRooms } from './parse';
import { normalizeText } from '../criteria';

/** Neighborhood names worth recognising in free text. */
const KNOWN_AREAS = [
  'לב תל אביב',
  'פלורנטין',
  'נווה צדק',
  'הצפון הישן',
  'הצפון החדש',
  'כרם התימנים',
  'רמת אביב',
  'יד אליהו',
  'שפירא',
  'מונטיפיורי',
  'בבלי',
  'נחלת יצחק',
  'התקווה',
  'עג׳מי',
  'צהלה',
];

const KNOWN_CITIES = ['תל אביב יפו', 'תל אביב', 'רמת גן', 'גבעתיים', 'בת ים', 'חולון', 'הרצליה', 'בני ברק'];

function findFirst(text: string, candidates: string[]): string | undefined {
  const normalized = normalizeText(text);
  // Longest first, so "תל אביב יפו" wins over "תל אביב".
  for (const candidate of [...candidates].sort((a, b) => b.length - a.length)) {
    if (normalized.includes(normalizeText(candidate))) return candidate;
  }
  return undefined;
}

/**
 * Turns a pasted post into a listing. `sourceUrl` is optional — if the post
 * linked somewhere, that link becomes the listing URL.
 */
export function parseManualPost(text: string, sourceUrl?: string, now: Date = new Date()): RawListing | null {
  const body = clean(text);
  if (body.length < 20) return null;

  const priceMatch =
    body.match(/([\d.,]{3,})\s*(?:₪|ש"ח|שח|nis|shekel)/i) ?? body.match(/(?:₪|ש"ח)\s*([\d.,]{3,})/);
  const roomsMatch = body.match(/(\d+(?:\.\d+)?)\s*(?:חד'?|חדרים|rooms?)/i);
  const sizeMatch = body.match(/(\d+)\s*(?:מ["״']?ר|מטר|sqm|m2)/i);
  const floorMatch = body.match(/קומה\s*([\d]+|קרקע|מרתף)/);

  const urlMatch = body.match(/https?:\/\/\S+/);
  const url = sourceUrl || urlMatch?.[0] || '';

  const city = findFirst(body, KNOWN_CITIES) ?? '';
  const neighborhood = findFirst(body, KNOWN_AREAS);

  // The id must be stable across re-pastes of the same post, otherwise editing
  // and re-submitting would create a duplicate rather than update the record.
  const externalId = createHash('sha1').update(url || body).digest('hex').slice(0, 16);

  // Split on sentence-ending periods only. A bare /[.\n]/ would cut
  // "דירת 2.5 חדרים…" down to "דירת 2", so the period must not be between digits.
  const firstLine = body.split(/\n|\.(?!\d)/)[0]?.trim();

  return {
    source: 'manual',
    externalId,
    // Without a link there is nothing to open, so point back at our own UI.
    url: url || `manual://${externalId}`,
    title: (firstLine && firstLine.length > 5 ? firstLine : body).slice(0, 200),
    description: body,
    priceIls: parsePrice(priceMatch?.[1]),
    rooms: parseRooms(roomsMatch?.[1]),
    sizeSqm: parseInteger(sizeMatch?.[1]),
    floor: floorMatch ? parseFloor(floorMatch[1]) : undefined,
    city,
    neighborhood,
    postedAt: now,
    ...detectAmenities(body),
    isAgency: detectAgency(body),
    // Pasted and forwarded posts are the one place a number is reliably
    // public — the poster typed it themselves. This is where the WhatsApp
    // button actually earns its place, since the scraped sources hide theirs.
    contactPhone: extractPhone(body),
    raw: { text: body, sourceUrl },
  };
}
