import * as React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/lib/app-context';
import { countActiveFilters } from '@/lib/filter-utils';
import { cn } from '@/lib/utils';
import type { Amenities, SortKey } from '@/lib/types';

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ['score', 'Best match'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['price', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['size', 'Largest'],
  ['rooms', 'Most rooms'],
  ['updated', 'Recently updated'],
];

/** The handful of sorts worth a one-tap pill; the rest stay in the dropdown. */
const QUICK_SORTS: Array<[SortKey, string]> = [
  ['score', 'Best match'],
  ['newest', 'Newest'],
  ['price', 'Price ↑'],
  ['price_desc', 'Price ↓'],
];

const AMENITY_CHIPS: Array<[keyof Amenities, string]> = [
  ['elevator', 'Elevator'],
  ['parking', 'Parking'],
  ['balcony', 'Balcony'],
  ['safeRoom', 'Safe room'],
  ['furnished', 'Furnished'],
];

export function FilterBar({
  collapsible = false,
  defaultOpen = true,
}: {
  /** Map tab: filters take vertical space away from the map, so they start
   * folded behind a toggle instead of always being on screen. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const { areas, filters, setFilters, resetFilters } = useAppContext();
  const [open, setOpen] = React.useState(defaultOpen);
  const activeCount = countActiveFilters(filters);

  const toggleAmenity = (key: keyof Amenities) => {
    setFilters((f) => ({
      ...f,
      amenities: f.amenities.includes(key) ? f.amenities.filter((k) => k !== key) : [...f.amenities, key],
    }));
  };

  return (
    <div>
      {collapsible && (
        <div className="flex items-center justify-between gap-2.5 mb-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge variant="score" className="ms-0.5">
                {activeCount}
              </Badge>
            )}
          </Button>
          {activeCount > 0 && (
            <Button variant="link" onClick={resetFilters}>
              Reset
            </Button>
          )}
        </div>
      )}

      {open && (
        <>
          <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] mb-2">
            {QUICK_SORTS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, sort: value }))}
                className={cn(
                  'flex-none rounded-full border px-3 py-1 text-[13px] transition-colors',
                  filters.sort === value
                    ? 'bg-primary border-primary text-primary-foreground font-semibold'
                    : 'bg-card border-border text-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2">
            <div className="relative col-span-2 sm:col-span-2">
              <Input
                type="search"
                placeholder="Search…"
                aria-label="Search listings"
                className="pr-8"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
              {filters.q && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v as SortKey }))}>
              <SelectTrigger aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 col-span-2 sm:col-span-2">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Min ₪"
                aria-label="Minimum price"
                value={filters.minPrice}
                onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
              />
              <span className="text-muted-foreground shrink-0">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Max ₪"
                aria-label="Maximum price"
                value={filters.maxPrice}
                onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
              />
            </div>
            <Select
              value={filters.poster || 'any'}
              onValueChange={(v) => setFilters((f) => ({ ...f, poster: (v === 'any' ? '' : v) as typeof f.poster }))}
            >
              <SelectTrigger aria-label="Posted by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone</SelectItem>
                <SelectItem value="private">No realtors</SelectItem>
                <SelectItem value="agency">Realtors only</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.area || 'any'}
              onValueChange={(v) => setFilters((f) => ({ ...f, area: v === 'any' ? '' : v }))}
            >
              <SelectTrigger aria-label="Area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All areas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label} ({a.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.source || 'any'}
              onValueChange={(v) => setFilters((f) => ({ ...f, source: (v === 'any' ? '' : v) as typeof f.source }))}
            >
              <SelectTrigger aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All sources</SelectItem>
                <SelectItem value="komo">Komo</SelectItem>
                <SelectItem value="yad2">Yad2</SelectItem>
                <SelectItem value="homeless">Homeless</SelectItem>
                <SelectItem value="manual">Added by me</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 mt-2.5" role="group" aria-label="Must have">
            {AMENITY_CHIPS.map(([key, label]) => (
              <label
                key={key}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm rounded-full border px-3 py-1.5 cursor-pointer transition-colors',
                  filters.amenities.includes(key) ? 'border-primary bg-accent' : 'border-border bg-card'
                )}
              >
                <Checkbox checked={filters.amenities.includes(key)} onCheckedChange={() => toggleAmenity(key)} />
                {label}
              </label>
            ))}
          </div>

          {!collapsible && (
            <div className="flex items-center justify-end gap-2.5 mt-2.5">
              {activeCount > 0 && (
                <Button variant="link" onClick={resetFilters}>
                  Reset ({activeCount})
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
