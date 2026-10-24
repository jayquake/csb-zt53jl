export function ListingCardSkeleton() {
  return (
    <div className="grid grid-cols-[92px_1fr] sm:grid-cols-[120px_1fr] gap-3 items-start rounded-lg border border-border bg-card p-3 animate-pulse">
      <div className="w-[92px] h-[92px] sm:w-[120px] sm:h-[110px] rounded-md bg-muted" />
      <div className="space-y-2 pt-1">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-5 bg-muted rounded w-1/3" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-10 bg-muted rounded-full" />
          <div className="h-5 w-14 bg-muted rounded-full" />
        </div>
      </div>
    </div>
  );
}
