import * as React from 'react';
import { ChevronLeft, ChevronRight, Star, EyeOff, CheckCircle2, TrendingDown } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkline } from './Sparkline';
import { scoreIcon } from '@/lib/map-icons';
import { shekels, safeUrl, localPhone, waLink, relativeTime, cn } from '@/lib/utils';
import type { Listing, UserActionStatus } from '@/lib/types';

export function ListingDetail({
  listing,
  onAction,
}: {
  listing: Listing;
  onAction: (id: string, requested: UserActionStatus) => void;
}) {
  const [imageIndex, setImageIndex] = React.useState(0);
  const images = listing.imageUrls || [];
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

  const placeHe = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  const placeEn = [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ');
  const place = placeEn || placeHe;

  const url = safeUrl(listing.url);
  const wa = waLink(listing.contactPhone);
  const seen = relativeTime(listing.lastSeenAt || listing.firstSeenAt);
  const firstSeen = relativeTime(listing.firstSeenAt);

  const amenityLabels: Array<[string, boolean | null | undefined]> = [
    ['Elevator', listing.amenities.elevator],
    ['Parking', listing.amenities.parking],
    ['Balcony', listing.amenities.balcony],
    ['Safe room', listing.amenities.safeRoom],
    ['Furnished', listing.amenities.furnished],
    ['Pets allowed', listing.amenities.pets],
  ];

  return (
    <div>
      <DialogTitle dir="auto">{listing.title}</DialogTitle>

      {images.length > 0 && (
        <div className="relative mt-3 -mx-4">
          <img
            src={images[imageIndex]}
            alt=""
            className="w-full h-56 object-cover bg-muted"
            referrerPolicy="no-referrer"
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5"
                onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1.5"
                onClick={() => setImageIndex((i) => (i + 1) % images.length)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-1.5 w-1.5 rounded-full', i === imageIndex ? 'bg-white' : 'bg-white/40')}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-bold">{shekels(listing.priceIls)}</span>
          {isDrop && (
            <>
              <span className="text-muted-foreground line-through text-sm">{shekels(firstPrice)}</span>
              <Badge className="bg-success/15 text-success border-success/30 gap-0.5">
                <TrendingDown className="h-3 w-3" />
                price drop
              </Badge>
            </>
          )}
        </div>

        <div className="text-muted-foreground text-sm mt-1">
          {specs}
          {specs && place ? ' · ' : ''}
          {place}
        </div>
        {placeEn && placeHe && (
          <div className="text-muted-foreground text-xs opacity-75 mt-0.5" dir="rtl">
            {placeHe}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge variant="score">{listing.score}</Badge>
          <Badge variant="source">{listing.source}</Badge>
          {listing.isAgency === true && <Badge variant="warn">Realtor</Badge>}
          {listing.isAgency === false && <Badge variant="ok">Owner</Badge>}
          {amenityLabels
            .filter(([, on]) => on === true)
            .map(([label]) => (
              <Badge key={label}>{label}</Badge>
            ))}
          {amenityLabels
            .filter(([, on]) => on === false)
            .map(([label]) => (
              <Badge key={label} variant="source" className="opacity-60 line-through">
                {label}
              </Badge>
            ))}
        </div>

        {listing.scoreReasons && listing.scoreReasons.length > 0 && (
          <ul className="text-muted-foreground text-sm mt-3 space-y-0.5">
            {listing.scoreReasons.map((reason, i) => (
              <li key={i}>✨ {reason}</li>
            ))}
          </ul>
        )}

        {history.length > 1 && (
          <div className="mt-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Price history</div>
            <Sparkline history={history} />
          </div>
        )}

        {listing.description && (
          <p className="text-sm mt-3 whitespace-pre-wrap leading-relaxed" dir="auto">
            {listing.description}
          </p>
        )}

        {typeof listing.lat === 'number' && typeof listing.lng === 'number' && (
          <div className="mt-3 rounded-md overflow-hidden border border-border">
            <MapContainer
              center={[listing.lat, listing.lng]}
              zoom={16}
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
              style={{ height: 140 }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <Marker position={[listing.lat, listing.lng]} icon={scoreIcon(listing.score)} />
            </MapContainer>
          </div>
        )}

        <div className="text-muted-foreground text-xs mt-3">
          {firstSeen && `First seen ${firstSeen}`}
          {firstSeen && seen ? ' · ' : ''}
          {seen && `updated ${seen}`}
        </div>

        {url && (
          <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open original listing
            </a>
          </Button>
        )}

        {listing.contactPhone && /^\+\d{8,15}$/.test(listing.contactPhone) && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
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

        <div className="flex gap-1.5 mt-3 flex-wrap">
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
    </div>
  );
}
