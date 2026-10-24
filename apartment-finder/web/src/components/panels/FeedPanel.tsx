import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ListingCard';
import { ListingCardSkeleton } from '@/components/ListingCardSkeleton';
import { FilterBar } from '@/components/FilterBar';
import { StatsRow } from '@/components/StatsRow';
import { useAppContext } from '@/lib/app-context';
import { PAGE_SIZE, fetchFeedServer, staticFeed } from '@/lib/api';
import { applyAction, nextStatus } from '@/lib/use-action';
import type { Listing, UserActionStatus } from '@/lib/types';

export function FeedPanel() {
  const { mode, snapshot, filters, status } = useAppContext();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (nextOffset: number, append: boolean) => {
      if (mode === 'loading') return;
      setLoading(true);
      setError(null);
      try {
        const data =
          mode === 'static' && snapshot
            ? staticFeed(snapshot, filters, nextOffset)
            : await fetchFeedServer(filters, nextOffset);
        setOffset(nextOffset);
        setTotal(data.total);
        setListings((prev) => (append ? prev.concat(data.listings) : data.listings));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [mode, snapshot, filters]
  );

  React.useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, snapshot, filters]);

  const handleAction = async (id: string, requested: UserActionStatus) => {
    const listing = listings.find((l) => l.id === id);
    if (!listing) return;
    const status = nextStatus(listing.status, requested);
    try {
      await applyAction(mode, id, status);
      if (status === 'HIDDEN') {
        setListings((prev) => prev.filter((l) => l.id !== id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
      }
    } catch {
      // toasted in applyAction
    }
  };

  return (
    <div>
      <StatsRow status={status} listings={listings} />

      <FilterBar />

      <div className="flex items-center justify-between gap-2.5 mt-3 mb-3 min-h-5">
        <span className="text-muted-foreground text-[13px]">
          {total > 0 ? `${listings.length} of ${total}` : ''}
        </span>
      </div>

      {mode === 'static' && (
        <p className="mb-3 p-2.5 rounded-md border border-border bg-card text-muted-foreground text-[13px] leading-relaxed">
          Published snapshot — updated by the scheduled scan. Save and Hide are kept in this browser. To change the
          search criteria or add a listing, run the app locally or edit the workflow.
        </p>
      )}

      {error && <p className="text-center text-muted-foreground py-10">Failed to load: {error}</p>}

      {loading && listings.length === 0 && (
        <div className="grid gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!error && !loading && listings.length === 0 && (
        <p className="text-center text-muted-foreground py-10">
          No listings match. Try widening the filters, or tap "Scan now".
        </p>
      )}

      <div className="grid gap-2.5">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} onAction={handleAction} />
        ))}
      </div>

      {listings.length < total && (
        <Button
          variant="ghost"
          className="w-full mt-3"
          disabled={loading}
          onClick={() => load(offset + PAGE_SIZE, true)}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
