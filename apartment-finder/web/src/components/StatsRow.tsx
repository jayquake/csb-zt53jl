import type { ReactNode } from 'react';
import { shekels } from '@/lib/utils';
import type { Listing, StatusResponse } from '@/lib/types';

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{label}</div>
      <div className="text-lg font-bold text-foreground mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

/** A glance-level summary, not a report — four hero numbers, no chart. Avg
 * price is over what's currently loaded on screen, not the whole filtered
 * set, so it's labelled "shown" rather than implying a precision it doesn't
 * have. */
export function StatsRow({ status, listings }: { status: StatusResponse | null; listings: Listing[] }) {
  const priced = listings.map((l) => l.priceIls).filter((p): p is number => p != null);
  const avg = priced.length ? Math.round(priced.reduce((a, b) => a + b, 0) / priced.length) : null;

  return (
    <div className="grid grid-cols-4 gap-2 mb-3">
      <StatTile label="Active" value={status?.counts.active ?? '—'} />
      <StatTile label="Saved" value={status?.counts.saved ?? '—'} />
      <StatTile label="New today" value={status?.lastRun?.new ?? 0} />
      <StatTile label="Avg (shown)" value={shekels(avg)} />
    </div>
  );
}
