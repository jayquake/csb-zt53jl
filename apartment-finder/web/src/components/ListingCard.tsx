import * as React from 'react';
import { Star, EyeOff, CheckCircle2, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkline } from './Sparkline';
import { ScoreRing } from './ScoreRing';
import { shekels, safeUrl, localPhone, waLink, cn, relativeTime } from '@/lib/utils';
import type { Listing, UserActionStatus } from '@/lib/types';

export function ListingCard({
  listing,
  onAction,
}: {
  listing: Listing;
  onAction: (id: string, requested: UserActionStatus) => void;
}) {
  const [imageBroken, setImageBroken] = React.useState(false);
  const image = !imageBroken && listing.imageUrls?.[0];
  const history = listing.priceHistory || [];
  const firstPrice = history.length > 1 ? history[0].priceIls : null;
  const isDrop = firstPrice != null && listing.priceIls != null && listing.priceIls < firstPrice;

  const specs = [
    listing.rooms != null ? `${listing.rooms} rm` : null,
    listing.sizeSqm != null ? `${listing.sizeSqm} m²` : null,
    listing.floor != null ? (listing.floor === 0 ? 'ground floor' : `floor ${listing.floor}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // English first for skimming, Hebrew kept because that is what you paste
  // into Waze or quote to a landlord.
  const placeHe = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  const placeEn = [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ');
  const place = placeEn || placeHe;

  const url = safeUrl(listing.url);
  const reasons = (listing.scoreReasons || []).slice(0, 2).join(' · ');
  const wa = waLink(listing.contactPhone);
  const seen = relativeTime(listing.lastSeenAt || listing.firstSeenAt);

  const amenityLabels: Array<[string, boolean | null | undefined]> = [
    ['Elevator', listing.amenities.elevator],
    ['Parking', listing.amenities.parking],
    ['Balcony', listing.amenities.balcony],
    ['Safe room', listing.amenities.safeRoom],
    ['Furnished', listing.amenities.furnished],
  ];

  return (
    <article
      className={cn(
        'grid gap-3 items-start rounded-lg border border-border bg-card shadow-sm p-3',
        image ? 'grid-cols-[92px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-1'
      )}
    >
      {image && (
        <img
          className="w-[92px] h-[92px] sm:w-[120px] sm:h-[110px] rounded-md object-cover bg-border"
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageBroken(true)}
        />
      )}
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-[15px] mb-0.5 break-anywhere" dir="auto">
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {listing.title}
              </a>
            ) : (
              listing.title
            )}
          </p>
          <ScoreRing score={listing.score} className="mt-0.5" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[17px] font-bold">{shekels(listing.priceIls)}</span>
          {isDrop && (
            <>
              <span className="text-muted-foreground line-through text-sm">{shekels(firstPrice)}</span>
              <Badge className="bg-success/15 text-success border-success/30 gap-0.5">
                <TrendingDown className="h-3 w-3" />
                drop
              </Badge>
            </>
          )}
        </div>
        <div className="text-muted-foreground text-[13px] mt-0.5">
          {specs}
          {specs && place ? ' · ' : ''}
          {place}
          {seen ? ` · ${seen}` : ''}
        </div>
        {placeEn && placeHe && (
          <div className="text-muted-foreground text-xs opacity-75 mt-0.5" dir="rtl">
            {placeHe}
          </div>
        )}
        {reasons && <div className="text-muted-foreground text-[13px] mt-0.5">✨ {reasons}</div>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="source">{listing.source}</Badge>
          {listing.isAgency === true && <Badge variant="warn">Realtor</Badge>}
          {listing.isAgency === false && <Badge variant="ok">Owner</Badge>}
          {amenityLabels
            .filter(([, on]) => on === true)
            .map(([label]) => (
              <Badge key={label}>{label}</Badge>
            ))}
        </div>
        <Sparkline history={history} />
        {listing.contactPhone && /^\+\d{8,15}$/.test(listing.contactPhone) && (
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {wa && (
              <Button asChild variant="whatsapp" size="sm">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <a href={`tel:${listing.contactPhone}`}>{localPhone(listing.contactPhone)}</a>
            </Button>
          </div>
        )}
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => onAction(listing.id, 'SAVED')}>
            <Star className="h-3.5 w-3.5" fill={listing.status === 'SAVED' ? 'currentColor' : 'none'} />
            {listing.status === 'SAVED' ? 'Saved' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction(listing.id, 'HIDDEN')}>
            <EyeOff className="h-3.5 w-3.5" />
            Hide
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction(listing.id, 'CONTACTED')}>
            <CheckCircle2 className="h-3.5 w-3.5" fill={listing.status === 'CONTACTED' ? 'currentColor' : 'none'} />
            {listing.status === 'CONTACTED' ? 'Contacted' : 'Contacted?'}
          </Button>
        </div>
      </div>
    </article>
  );
}
