/** Mirrors src/types.ts + the shapes src/api.ts actually returns over the wire. */

export type SourceName = 'yad2' | 'homeless' | 'komo' | 'manual';
export type UserActionStatus = 'SAVED' | 'HIDDEN' | 'CONTACTED';

export interface Amenities {
  elevator?: boolean;
  parking?: boolean;
  balcony?: boolean;
  safeRoom?: boolean;
  furnished?: boolean;
  pets?: boolean;
}

export interface PricePoint {
  priceIls: number;
  seenAt?: string;
}

export interface Listing {
  id: string;
  source: SourceName;
  url: string;
  title: string;
  description?: string;
  priceIls?: number | null;
  rooms?: number | null;
  sizeSqm?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  city?: string | null;
  cityEn?: string | null;
  neighborhood?: string | null;
  neighborhoodEn?: string | null;
  lat?: number | null;
  lng?: number | null;
  isAgency?: boolean | null;
  amenities: Amenities;
  imageUrls: string[];
  contactPhone?: string | null;
  score: number;
  scoreReasons: string[];
  status: UserActionStatus | null;
  firstSeenAt: string;
  lastSeenAt: string;
  priceHistory?: PricePoint[];
}

/** Raw snapshot row shape, before fromSnapshot() reshapes it into a Listing. */
export interface SnapshotListingRow extends Omit<Listing, 'amenities' | 'imageUrls' | 'scoreReasons' | 'status'> {
  hasElevator?: boolean;
  hasParking?: boolean;
  hasBalcony?: boolean;
  hasSafeRoom?: boolean;
  isFurnished?: boolean;
  petsAllowed?: boolean;
  imageUrls: string[] | string;
  scoreReasons: string[] | string;
  action?: { status: UserActionStatus | null };
}

export interface SearchCriteria {
  minPriceIls?: number;
  maxPriceIls?: number;
  minRooms?: number;
  maxRooms?: number;
  minSizeSqm?: number;
  maxSizeSqm?: number;
  minFloor?: number;
  maxFloor?: number;
  cities: string[];
  neighborhoods: string[];
  excludeKeywords: string[];
  requireElevator?: boolean;
  requireParking?: boolean;
  requireBalcony?: boolean;
  requireSafeRoom?: boolean;
  requireFurnished?: boolean;
  requirePetsAllowed?: boolean;
  allowRoommates?: boolean;
  posterType: 'any' | 'private_only' | 'agency_only';
  strictPosterFilter?: boolean;
  preferences: {
    idealMaxPriceIls?: number;
    idealMinSizeSqm?: number;
    favoriteNeighborhoods: string[];
    bonusKeywords: string[];
  };
  minScoreToAlert: number;
  minPriceDropPercent: number;
  maxAlertsPerRun: number;
}

export interface RunSummary {
  startedAt: string;
  new: number;
  drops: number;
  errors?: string[];
  sourceStats?: Record<string, unknown>;
}

export interface StatusResponse {
  scanning: boolean;
  counts: { active: number; saved: number };
  lastRun?: RunSummary;
  generatedAt?: string;
}

export interface AreaOption {
  value: string;
  label: string;
  count: number;
}

export interface Snapshot {
  listings: SnapshotListingRow[];
  counts?: { active: number };
  lastRun?: RunSummary;
  generatedAt?: string;
  criteria?: SearchCriteria;
}

export type SortKey = 'score' | 'newest' | 'oldest' | 'price' | 'price_desc' | 'size' | 'rooms' | 'updated';
export type PosterFilter = '' | 'private' | 'agency';

export interface FeedFilters {
  q: string;
  sort: SortKey;
  minPrice: string;
  maxPrice: string;
  poster: PosterFilter;
  source: SourceName | '';
  area: string;
  amenities: Array<keyof Amenities>;
}

export const DEFAULT_FILTERS: FeedFilters = {
  q: '',
  sort: 'score',
  minPrice: '',
  maxPrice: '',
  poster: '',
  source: '',
  area: '',
  amenities: [],
};
