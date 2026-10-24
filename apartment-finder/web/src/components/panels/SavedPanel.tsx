import * as React from 'react';
import { ListingCard } from '@/components/ListingCard';
import { useAppContext } from '@/lib/app-context';
import { staticSaved } from '@/lib/api';
import { applyAction, nextStatus } from '@/lib/use-action';
import type { Listing, UserActionStatus } from '@/lib/types';

async function fetchSavedServer(): Promise<Listing[]> {
  const response = await fetch('/api/listings?status=SAVED&limit=200', { headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.listings;
}

export function SavedPanel() {
  const { mode, snapshot } = useAppContext();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      if (mode === 'static' && snapshot) setListings(staticSaved(snapshot));
      else if (mode === 'server') setListings(await fetchSavedServer());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [mode, snapshot]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (id: string, requested: UserActionStatus) => {
    const listing = listings.find((l) => l.id === id);
    if (!listing) return;
    const status = nextStatus(listing.status, requested);
    try {
      await applyAction(mode, id, status);
      setListings((prev) => prev.filter((l) => (status === 'SAVED' ? true : l.id !== id)));
    } catch {
      // toasted in applyAction
    }
  };

  if (error) return <p className="text-center text-muted-foreground py-10">Error: {error}</p>;
  if (listings.length === 0) return <p className="text-center text-muted-foreground py-10">Nothing saved yet.</p>;

  return (
    <div className="grid gap-2.5">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} onAction={handleAction} />
      ))}
    </div>
  );
}
