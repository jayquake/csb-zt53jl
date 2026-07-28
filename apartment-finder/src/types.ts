/**
 * Shared domain types.
 *
 * `RawListing` is what a source adapter produces: best-effort, possibly
 * incomplete. The pipeline normalizes it into the shape Prisma stores.
 */

export interface RawListing {
  source: SourceName;
  externalId: string;
  url: string;

  title: string;
  description?: string;
  priceIls?: number;
  rooms?: number;
  sizeSqm?: number;
  floor?: number;
  totalFloors?: number;

  city?: string;
  neighborhood?: string;
  street?: string;
  lat?: number;
  lng?: number;

  hasElevator?: boolean;
  hasParking?: boolean;
  hasBalcony?: boolean;
  hasSafeRoom?: boolean;
  isFurnished?: boolean;
  petsAllowed?: boolean;
  isRoommates?: boolean;
  /**
   * True when posted by an agent, false when demonstrably by the owner,
   * undefined when the listing gives no signal. The three-way distinction is
   * load-bearing: most listings say nothing, and treating those as private
   * would defeat the filter.
   */
  isAgency?: boolean;

  imageUrls?: string[];
  contact?: string;
  postedAt?: Date;

  /** Original payload, kept for debugging parser regressions. */
  raw?: unknown;
}

export type SourceName = 'yad2' | 'homeless' | 'komo' | 'manual';

export type AlertKind = 'NEW' | 'PRICE_DROP';

export type UserActionStatus = 'SAVED' | 'HIDDEN' | 'CONTACTED';

/**
 * What the user is looking for. Every field is optional: an unset field means
 * "don't care", which is what makes the same matcher usable for a loose
 * exploratory search and a tight one.
 */
export interface SearchCriteria {
  /** Monthly rent in ILS. */
  minPriceIls?: number;
  maxPriceIls?: number;

  minRooms?: number;
  maxRooms?: number;

  minSizeSqm?: number;
  maxSizeSqm?: number;

  minFloor?: number;
  maxFloor?: number;

  /** Cities to search, in Hebrew as the sources spell them. */
  cities: string[];
  /** If non-empty, only these neighborhoods match. */
  neighborhoods: string[];
  /** Listings whose text matches any of these are rejected outright. */
  excludeKeywords: string[];

  /** Hard requirements — a listing missing any of these cannot match. */
  requireElevator?: boolean;
  requireParking?: boolean;
  requireBalcony?: boolean;
  requireSafeRoom?: boolean;
  requireFurnished?: boolean;
  requirePetsAllowed?: boolean;
  /** Roommate/flatshare posts are excluded by default. */
  allowRoommates?: boolean;

  /**
   * Who may post the listing.
   *  'any'          — no filtering (default)
   *  'private_only' — exclude agent listings, since a broker fee in Israel is
   *                   typically a month's rent
   *  'agency_only'  — the inverse, for when you want a broker's inventory
   *
   * Listings of unknown provenance are kept under 'private_only' unless
   * `strictPosterFilter` is set, because most listings never state it and
   * dropping them would discard most of the market.
   */
  posterType: 'any' | 'private_only' | 'agency_only';
  /** Require a confirmed poster type; drops unknowns too. */
  strictPosterFilter?: boolean;

  /**
   * Soft preferences. These do not reject a listing, they only move its score,
   * so a near-miss still surfaces rather than vanishing silently.
   */
  preferences: {
    /** Rent at or below this feels like a bargain and scores highly. */
    idealMaxPriceIls?: number;
    idealMinSizeSqm?: number;
    /** Neighborhoods that get a scoring bump without being mandatory. */
    favoriteNeighborhoods: string[];
    /** Free-text terms that earn bonus points when present. */
    bonusKeywords: string[];
  };

  /** Only alert on listings scoring at least this (0-100). */
  minScoreToAlert: number;
  /** Only alert on a price drop of at least this percent. */
  minPriceDropPercent: number;
  /** Cap on how many listings a single WhatsApp message describes. */
  maxAlertsPerRun: number;
}

export const DEFAULT_CRITERIA: SearchCriteria = {
  maxPriceIls: 8000,
  minRooms: 2,
  maxRooms: 4,
  minSizeSqm: 45,
  cities: ['תל אביב יפו', 'רמת גן', 'גבעתיים'],
  neighborhoods: [],
  excludeKeywords: ['סאבלט', 'שותף', 'שותפה'],
  allowRoommates: false,
  posterType: 'any',
  strictPosterFilter: false,
  preferences: {
    idealMaxPriceIls: 6500,
    idealMinSizeSqm: 65,
    favoriteNeighborhoods: ['לב תל אביב', 'פלורנטין', 'הצפון הישן', 'נווה צדק'],
    bonusKeywords: ['מרפסת', 'מעלית', 'משופצת', 'ממ"ד', 'חניה'],
  },
  minScoreToAlert: 55,
  minPriceDropPercent: 3,
  maxAlertsPerRun: 10,
};

/** Result of scoring one listing against the criteria. */
export interface MatchResult {
  matches: boolean;
  score: number;
  reasons: string[];
  /** Why it was rejected, when `matches` is false. */
  rejectedBy?: string;
}
