import type {
  AreaOption,
  FeedFilters,
  Listing,
  SearchCriteria,
  Snapshot,
  SnapshotListingRow,
  StatusResponse,
  UserActionStatus,
} from './types';
import { loadLocalActions } from './local-actions';

const PAGE_SIZE = 30;
export { PAGE_SIZE };

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}

/**
 * Static mode is what makes this page work on GitHub Pages, where there is
 * no server: the same UI reads a generated data.json instead of the API,
 * filters and sorts in the browser, and keeps Save/Hide in localStorage.
 * Detected at boot rather than configured, so one build serves both.
 */
export async function detectServerMode(): Promise<boolean> {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('no api');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('not json');
    return true;
  } catch {
    return false;
  }
}

export async function fetchSnapshot(): Promise<Snapshot> {
  // Relative, so the page works from a project-Pages subpath as well as a
  // domain root.
  const response = await fetch('data.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse((value as string) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Reshapes a snapshot listing into the same object the API returns. */
export function fromSnapshot(row: SnapshotListingRow, actions: Record<string, UserActionStatus>): Listing {
  return {
    ...row,
    imageUrls: parseArray(row.imageUrls) as string[],
    scoreReasons: parseArray(row.scoreReasons) as string[],
    amenities: {
      elevator: row.hasElevator,
      parking: row.hasParking,
      balcony: row.hasBalcony,
      safeRoom: row.hasSafeRoom,
      furnished: row.isFurnished,
      pets: row.petsAllowed,
    },
    // A locally saved action wins: it is this browser's, and it is newer than
    // whatever the snapshot was generated with.
    status: actions[row.id] ?? row.action?.status ?? null,
  };
}

/** Applies the feed filters client-side, mirroring the API's semantics. */
export function filterAndSort(listings: Listing[], filters: FeedFilters): Listing[] {
  const q = filters.q.trim().toLowerCase();
  const minPrice = Number(filters.minPrice) || null;
  const maxPrice = Number(filters.maxPrice) || null;

  let out = listings.filter((l) => {
    if (l.status === 'HIDDEN') return false;
    if (minPrice != null && (l.priceIls == null || l.priceIls < minPrice)) return false;
    if (maxPrice != null && (l.priceIls == null || l.priceIls > maxPrice)) return false;
    // Unknown provenance counts as "not a realtor", matching the server.
    if (filters.poster === 'private' && l.isAgency === true) return false;
    if (filters.poster === 'agency' && l.isAgency !== true) return false;
    if (filters.source && l.source !== filters.source) return false;
    if (filters.area && l.neighborhood !== filters.area) return false;
    // A checked amenity must be a *confirmed* true — undefined means the
    // listing never said, which "must have" cannot count as satisfying.
    if (filters.amenities.some((key) => l.amenities[key] !== true)) return false;
    if (q) {
      const hay = `${l.title} ${l.description || ''} ${l.neighborhood || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const num = (v: number | null | undefined) => (v == null ? -Infinity : v);
  const cmp: Record<string, (a: Listing, b: Listing) => number> = {
    score: (a, b) => b.score - a.score,
    price: (a, b) => num(a.priceIls) - num(b.priceIls),
    price_desc: (a, b) => num(b.priceIls) - num(a.priceIls),
    size: (a, b) => num(b.sizeSqm) - num(a.sizeSqm),
    rooms: (a, b) => num(b.rooms) - num(a.rooms),
    newest: (a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime(),
    oldest: (a, b) => new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime(),
    updated: (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  };
  out = out.sort(cmp[filters.sort] || cmp.score);
  return out;
}

/**
 * Builds the area lists from the listings themselves rather than a fixed
 * catalogue, so the options are always ones that currently have results —
 * offering a neighbourhood with nothing in it is just a dead end.
 */
export function areaOptionsFromListings(listings: Listing[]): AreaOption[] {
  const areas = new Map<string, { label: string; count: number }>();
  for (const listing of listings) {
    const he = listing.neighborhood;
    if (!he) continue;
    const existing = areas.get(he);
    if (existing) existing.count += 1;
    else areas.set(he, { label: listing.neighborhoodEn || he, count: 1 });
  }
  return [...areas.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function staticFeed(snapshot: Snapshot, filters: FeedFilters, offset: number): { total: number; listings: Listing[] } {
  const actions = loadLocalActions();
  const all = (snapshot.listings || []).map((row) => fromSnapshot(row, actions));
  const matched = filterAndSort(all, filters);
  return { total: matched.length, listings: matched.slice(offset, offset + PAGE_SIZE) };
}

export function staticSaved(snapshot: Snapshot): Listing[] {
  const actions = loadLocalActions();
  return (snapshot.listings || []).map((row) => fromSnapshot(row, actions)).filter((l) => l.status === 'SAVED');
}

export function staticStatus(snapshot: Snapshot): StatusResponse {
  const saved = Object.values(loadLocalActions()).filter((v) => v === 'SAVED').length;
  return {
    scanning: false,
    counts: { active: snapshot.counts?.active ?? 0, saved },
    lastRun: snapshot.lastRun,
    generatedAt: snapshot.generatedAt,
  };
}

function feedQuery(filters: FeedFilters, offset: number): URLSearchParams {
  const params = new URLSearchParams({ sort: filters.sort, limit: String(PAGE_SIZE), offset: String(offset) });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.poster) params.set('poster', filters.poster);
  if (filters.source) params.set('source', filters.source);
  if (filters.area) params.set('area', filters.area);
  for (const key of filters.amenities) params.set(key, 'true');
  return params;
}

export async function fetchFeedServer(filters: FeedFilters, offset: number): Promise<{ total: number; listings: Listing[] }> {
  return apiFetch(`/listings?${feedQuery(filters, offset).toString()}`);
}

export async function fetchMapListingsServer(filters: FeedFilters): Promise<Listing[]> {
  const params = feedQuery(filters, 0);
  params.set('limit', '500');
  params.set('offset', '0');
  const data = await apiFetch<{ listings: Listing[] }>(`/listings?${params.toString()}`);
  return data.listings;
}

export async function fetchAreasServer(): Promise<AreaOption[]> {
  const data = await apiFetch<{ areas: AreaOption[] }>('/areas');
  return data.areas;
}

export async function fetchStatusServer(): Promise<StatusResponse> {
  return apiFetch('/status');
}

export async function fetchCriteriaServer(): Promise<SearchCriteria> {
  const data = await apiFetch<{ criteria: SearchCriteria }>('/criteria');
  return data.criteria;
}

export async function saveCriteriaServer(criteria: Partial<SearchCriteria>): Promise<void> {
  await apiFetch('/criteria', { method: 'PUT', body: criteria });
}

export async function postActionServer(id: string, status: UserActionStatus | null): Promise<void> {
  await apiFetch(`/listings/${id}/action`, { method: 'POST', body: { status } });
}

export async function startScanServer(): Promise<void> {
  await apiFetch('/scan', { method: 'POST', body: {} });
}

export async function postManualIngestServer(
  text: string,
  url: string | undefined
): Promise<{ note?: string; parsed: { priceIls?: number; rooms?: number; city?: string } }> {
  return apiFetch('/ingest/manual', { method: 'POST', body: { text, url } });
}
