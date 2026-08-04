/**
 * Criteria matching and scoring.
 *
 * Two distinct jobs live here, deliberately kept apart:
 *
 *  1. Hard filters decide whether a listing is eligible at all. A listing that
 *     fails one is rejected and never alerted on.
 *  2. Soft scoring ranks the survivors 0-100. Scoring is what makes the feed
 *     useful — without it every under-budget flat looks equally good, which is
 *     how you end up ignoring the alerts.
 *
 * Unknown values never reject. Israeli listing sites routinely omit size, floor
 * or amenities, so treating "missing" as "fails the requirement" would throw
 * away most of the market. Missing data costs a listing points instead.
 */

import type { RawListing, SearchCriteria, MatchResult, AmenityKey } from './types';
import { normalizeText } from './text';
import { translateFeature, translateNeighborhood } from './translate';

// Re-exported for the many modules that import it from here.
export { normalizeText };

/** Weights sum to 100. */
const WEIGHTS = {
  price: 30,
  size: 20,
  neighborhood: 15,
  amenities: 15,
  freshness: 10,
  keywords: 10,
} as const;

/**
 * How much of the amenity weight goes to the amenities you named, when you
 * named any. The remainder still counts the others, so a flat with your
 * must-haves *plus* parking beats an otherwise identical one without.
 */
const PREFERRED_AMENITY_SHARE = 0.8;

/**
 * Display names for the amenity keys, used in score reasons.
 *
 * A mamad carries its shield here and everywhere else it is shown. In Tel Aviv
 * they are rare enough — most of the housing stock predates the 1992 rule — that
 * the point of the marker is to make the exception jump out of a list of
 * near-identical flats, rather than to decorate a common feature.
 */
const AMENITY_LABEL: Record<AmenityKey, string> = {
  elevator: 'elevator',
  parking: 'parking',
  balcony: 'balcony',
  safeRoom: '🛡️ mamad',
  furnished: 'furniture',
};


/** The searchable text blob for a listing. */
function haystack(listing: RawListing): string {
  return normalizeText(
    [listing.title, listing.description, listing.neighborhood, listing.street].filter(Boolean).join(' ')
  );
}

function containsAny(hay: string, needles: string[]): string | null {
  for (const needle of needles) {
    const n = normalizeText(needle);
    if (n && hay.includes(n)) return needle;
  }
  return null;
}

/**
 * Scores a value that is better when smaller, within [best, worst].
 * Returns 1 at or below `best`, 0 at or above `worst`, linear in between.
 */
function scoreLowerIsBetter(value: number, best: number, worst: number): number {
  if (worst <= best) return value <= best ? 1 : 0;
  if (value <= best) return 1;
  if (value >= worst) return 0;
  return (worst - value) / (worst - best);
}

/**
 * Scores a value that is better when larger, within [worst, best].
 */
function scoreHigherIsBetter(value: number, worst: number, best: number): number {
  if (best <= worst) return value >= best ? 1 : 0;
  if (value >= best) return 1;
  if (value <= worst) return 0;
  return (value - worst) / (best - worst);
}

/**
 * City comparison is lenient because the sources disagree on the canonical
 * name: Yad2 says "תל אביב יפו", Homeless says "תל אביב", and users type
 * "תל-אביב". Matching either direction on the normalized string covers all of
 * these without a hand-maintained alias table.
 */
export function cityMatches(listingCity: string, wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const c = normalizeText(listingCity).replace(/-/g, ' ');
  return wanted.some((w) => {
    const n = normalizeText(w).replace(/-/g, ' ');
    return c === n || c.includes(n) || n.includes(c);
  });
}

/**
 * Applies the hard filters, then scores. `now` is injectable so freshness
 * scoring is deterministic in tests.
 */
export function evaluate(listing: RawListing, criteria: SearchCriteria, now: Date = new Date()): MatchResult {
  const hay = haystack(listing);
  const reasons: string[] = [];

  // ---- Hard filters -------------------------------------------------------

  const reject = (rejectedBy: string): MatchResult => ({ matches: false, score: 0, reasons, rejectedBy });

  const excluded = containsAny(hay, criteria.excludeKeywords);
  if (excluded) return reject(`excluded keyword: ${excluded}`);

  if (!criteria.allowRoommates && listing.isRoommates) return reject('roommate/flatshare listing');

  // Agent vs owner. `isAgency` is three-valued and unknown is the common case,
  // so an unknown listing is kept unless the filter is explicitly strict —
  // otherwise "private only" would silently discard most of the market.
  if (criteria.posterType === 'private_only') {
    if (listing.isAgency === true) return reject('posted by an agent');
    if (listing.isAgency === undefined && criteria.strictPosterFilter) {
      return reject('poster type unknown (strict filter)');
    }
  } else if (criteria.posterType === 'agency_only') {
    if (listing.isAgency === false) return reject('not an agent listing');
    if (listing.isAgency === undefined && criteria.strictPosterFilter) {
      return reject('poster type unknown (strict filter)');
    }
  }

  if (listing.city && !cityMatches(listing.city, criteria.cities)) {
    return reject(`city not wanted: ${listing.city}`);
  }

  if (criteria.neighborhoods.length > 0) {
    // Match against the whole text, not just the neighborhood field: sources
    // often leave the field empty but name the area in the title.
    if (!containsAny(hay, criteria.neighborhoods)) return reject('neighborhood not wanted');
  }

  // Price is the one field where a missing value is not forgiven when a budget
  // is set — an unpriced listing cannot be shown to be affordable, and "call
  // for price" posts are overwhelmingly agency spam.
  if (listing.priceIls != null) {
    if (criteria.maxPriceIls != null && listing.priceIls > criteria.maxPriceIls) {
      return reject(`over budget: ${listing.priceIls} > ${criteria.maxPriceIls}`);
    }
    if (criteria.minPriceIls != null && listing.priceIls < criteria.minPriceIls) {
      return reject(`under min price: ${listing.priceIls} < ${criteria.minPriceIls}`);
    }
  } else if (criteria.maxPriceIls != null) {
    return reject('no price listed');
  }

  if (listing.rooms != null) {
    if (criteria.minRooms != null && listing.rooms < criteria.minRooms) {
      return reject(`too few rooms: ${listing.rooms} < ${criteria.minRooms}`);
    }
    if (criteria.maxRooms != null && listing.rooms > criteria.maxRooms) {
      return reject(`too many rooms: ${listing.rooms} > ${criteria.maxRooms}`);
    }
  }

  if (listing.sizeSqm != null) {
    if (criteria.minSizeSqm != null && listing.sizeSqm < criteria.minSizeSqm) {
      return reject(`too small: ${listing.sizeSqm}sqm < ${criteria.minSizeSqm}`);
    }
    if (criteria.maxSizeSqm != null && listing.sizeSqm > criteria.maxSizeSqm) {
      return reject(`too large: ${listing.sizeSqm}sqm > ${criteria.maxSizeSqm}`);
    }
  }

  if (listing.floor != null) {
    if (criteria.minFloor != null && listing.floor < criteria.minFloor) {
      return reject(`floor too low: ${listing.floor}`);
    }
    if (criteria.maxFloor != null && listing.floor > criteria.maxFloor) {
      return reject(`floor too high: ${listing.floor}`);
    }
  }

  const hardAmenities: Array<[boolean | undefined, boolean | undefined, string]> = [
    [criteria.requireElevator, listing.hasElevator, 'elevator'],
    [criteria.requireParking, listing.hasParking, 'parking'],
    [criteria.requireBalcony, listing.hasBalcony, 'balcony'],
    [criteria.requireSafeRoom, listing.hasSafeRoom, 'safe room'],
    [criteria.requireFurnished, listing.isFurnished, 'furnished'],
    [criteria.requirePetsAllowed, listing.petsAllowed, 'pets allowed'],
  ];
  for (const [required, present, label] of hardAmenities) {
    if (required && present === false) return reject(`missing required ${label}`);
  }

  // ---- Soft scoring -------------------------------------------------------

  let score = 0;

  // Price: the further under the ideal budget, the better. A listing at the
  // ideal price gets full marks; one at the hard ceiling gets none.
  const ceiling = criteria.maxPriceIls ?? criteria.preferences.idealMaxPriceIls;
  const ideal = criteria.preferences.idealMaxPriceIls ?? ceiling;
  if (listing.priceIls != null && ideal != null && ceiling != null) {
    const ratio = scoreLowerIsBetter(listing.priceIls, ideal, ceiling);
    score += ratio * WEIGHTS.price;
    if (ratio >= 0.99) reasons.push(`at or under ideal budget (₪${listing.priceIls.toLocaleString()})`);
    else if (ratio >= 0.5) reasons.push(`well priced (₪${listing.priceIls.toLocaleString()})`);
  } else {
    score += WEIGHTS.price * 0.5; // no budget configured: stay neutral
  }

  // Size: reward hitting the ideal square meterage.
  const minSize = criteria.minSizeSqm ?? 0;
  const idealSize = criteria.preferences.idealMinSizeSqm;
  if (listing.sizeSqm != null && idealSize != null) {
    const ratio = scoreHigherIsBetter(listing.sizeSqm, minSize, idealSize);
    score += ratio * WEIGHTS.size;
    if (ratio >= 0.99) reasons.push(`spacious (${listing.sizeSqm}m²)`);
  } else if (listing.sizeSqm == null) {
    score += WEIGHTS.size * 0.4; // unknown size is a mild penalty, not a veto
    reasons.push('size not stated');
  } else {
    score += WEIGHTS.size * 0.7;
  }

  // Neighborhood preference.
  const favorite = containsAny(hay, criteria.preferences.favoriteNeighborhoods);
  if (favorite) {
    score += WEIGHTS.neighborhood;
    // English where a translation exists, so the reason reads at a glance.
    reasons.push(`favourite area: ${translateNeighborhood(favorite) ?? favorite}`);
  } else if (criteria.preferences.favoriteNeighborhoods.length === 0) {
    score += WEIGHTS.neighborhood * 0.5;
  }

  // Amenities. By default each present amenity contributes an equal share, but
  // an equal share is the wrong model once you care about specific ones:
  // parking + safe room + furnished would outrank the elevator and balcony you
  // were actually asking for. When `preferredAmenities` is set most of the
  // weight rides on those, and the remainder still rewards a flat that happens
  // to come with extras.
  const byKey: Record<AmenityKey, boolean | null | undefined> = {
    elevator: listing.hasElevator,
    parking: listing.hasParking,
    balcony: listing.hasBalcony,
    safeRoom: listing.hasSafeRoom,
    furnished: listing.isFurnished,
  };
  const amenityFlags = Object.values(byKey);
  const present = amenityFlags.filter(Boolean).length;
  const preferred = criteria.preferences.preferredAmenities ?? [];

  if (preferred.length > 0) {
    const got = preferred.filter((key) => byKey[key] === true);
    score += (got.length / preferred.length) * WEIGHTS.amenities * PREFERRED_AMENITY_SHARE;
    score += (present / amenityFlags.length) * WEIGHTS.amenities * (1 - PREFERRED_AMENITY_SHARE);
    if (got.length > 0) {
      // Named rather than counted: "has elevator, balcony" is the thing worth
      // knowing, where "2 key amenities" makes you open the listing to find out
      // which two.
      reasons.push(`has ${got.map((key) => AMENITY_LABEL[key]).join(', ')}`);
    }
  } else {
    score += (present / amenityFlags.length) * WEIGHTS.amenities;
    if (present >= 3) reasons.push(`${present} key amenities`);
  }

  // Freshness: a listing posted today is worth far more than a two-week-old one,
  // because in Tel Aviv the good ones are gone within days.
  if (listing.postedAt) {
    const ageDays = (now.getTime() - listing.postedAt.getTime()) / 86_400_000;
    const ratio = scoreLowerIsBetter(ageDays, 1, 14);
    score += ratio * WEIGHTS.freshness;
    if (ageDays <= 1) reasons.push('posted today');
  } else {
    score += WEIGHTS.freshness * 0.5;
  }

  // Bonus keywords.
  const bonus = criteria.preferences.bonusKeywords.filter((k) => {
    const n = normalizeText(k);
    return n && hay.includes(n);
  });
  if (criteria.preferences.bonusKeywords.length > 0) {
    score += (bonus.length / criteria.preferences.bonusKeywords.length) * WEIGHTS.keywords;
    if (bonus.length > 0) {
      reasons.push(`mentions ${bonus.map((k) => translateFeature(k) ?? k).join(', ')}`);
    }
  } else {
    score += WEIGHTS.keywords * 0.5;
  }

  return {
    matches: true,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

/**
 * Whether a price change is worth waking someone up for. Increases never alert;
 * drops must clear the configured percentage to filter out the ₪50 nudges
 * agents make to bump a listing back to the top of the feed.
 */
export function isSignificantDrop(oldPrice: number, newPrice: number, minDropPercent: number): boolean {
  if (oldPrice <= 0 || newPrice >= oldPrice) return false;
  const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;
  return dropPercent >= minDropPercent;
}
