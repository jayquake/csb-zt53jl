/**
 * Cross-source deduplication.
 *
 * The same apartment is routinely posted on Yad2 and Homeless at once, and
 * re-posted with a fresh id when it goes stale. Keying only on
 * (source, externalId) would alert on the same flat repeatedly, which is the
 * fastest way to make someone mute the notifications.
 *
 * The fingerprint deliberately uses only attributes that stay put when a
 * listing is re-posted: location, size, rooms and floor. Price is excluded —
 * it is the thing we want to detect changing.
 */

import { createHash } from 'crypto';
import type { RawListing } from '../types';
import { normalizeText } from '../criteria';

/**
 * Rounds to a bucket so that trivial disagreements between sources (78m² vs
 * 80m²) still collapse to one listing.
 */
function bucket(value: number | undefined, size: number): string {
  if (value == null) return '?';
  return String(Math.round(value / size) * size);
}

/**
 * Strips the noise that differs between postings of the same flat: house
 * numbers written as "12" vs "12א", and the various street prefixes.
 */
function normalizeStreet(street: string | undefined): string {
  if (!street) return '';
  return normalizeText(street)
    .replace(/\b(רחוב|רח'|שדרות|שד')\b/g, '')
    .replace(/\d+[א-ת]?/g, (m) => m.replace(/[א-ת]/g, '')) // "12א" -> "12"
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeFingerprint(listing: RawListing): string {
  const parts = [
    normalizeText(listing.city ?? ''),
    normalizeText(listing.neighborhood ?? ''),
    normalizeStreet(listing.street),
    bucket(listing.rooms, 0.5),
    bucket(listing.sizeSqm, 5),
    listing.floor != null ? String(listing.floor) : '?',
  ];

  const basis = parts.join('|');

  // When a listing carries almost no structured data, a fingerprint built from
  // it would collide with every other sparse listing. Fall back to something
  // guaranteed unique so sparse records stay distinct rather than merging into
  // one blob.
  const informative = parts.filter((p) => p !== '' && p !== '?').length;
  if (informative < 3) {
    return sha1(`unique:${listing.source}:${listing.externalId}`);
  }

  return sha1(basis);
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}
