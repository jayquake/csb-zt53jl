import type { FeedFilters } from './types';

/** How many filters currently narrow the result set, for a "3 active" badge. */
export function countActiveFilters(filters: FeedFilters): number {
  let n = 0;
  if (filters.q.trim()) n += 1;
  if (filters.minPrice) n += 1;
  if (filters.maxPrice) n += 1;
  if (filters.poster) n += 1;
  if (filters.source) n += 1;
  if (filters.area) n += 1;
  n += filters.amenities.length;
  return n;
}
