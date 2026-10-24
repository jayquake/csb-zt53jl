import * as React from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/FilterBar';
import { useAppContext } from '@/lib/app-context';
import { fetchMapListingsServer, filterAndSort, fromSnapshot } from '@/lib/api';
import { loadLocalActions } from '@/lib/local-actions';
import { safeUrl, shekels, waLink } from '@/lib/utils';
import { scoreIcon } from '@/lib/map-icons';
import type { Listing } from '@/lib/types';

const TEL_AVIV: [number, number] = [32.0761, 34.7783];

/** Clustered pins get the app's own badge styling rather than Leaflet's
 * default green/yellow/orange theme, so the map still reads as this app. */
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="pin-cluster"><span>${cluster.getChildCount()}</span></div>`,
    iconSize: [40, 40],
  });
}

const meIcon = L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [0, 0] });

function FitBounds({ listings }: { listings: Listing[] }) {
  const map = useMap();
  React.useEffect(() => {
    const bounds = listings
      .filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number')
      .map((l) => [l.lat as number, l.lng as number] as [number, number]);
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 0);
  }, [map, listings]);
  return null;
}

type MePosition = { lat: number; lng: number; accuracy: number };

/** Renders the "you are here" marker and recenters the map — split from the
 * button itself since useMap only works inside the MapContainer tree. */
function MeLayer({ me }: { me: MePosition | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (me) map.setView([me.lat, me.lng], 15);
  }, [map, me]);

  if (!me) return null;
  return (
    <>
      <Marker position={[me.lat, me.lng]} icon={meIcon} zIndexOffset={1000}>
        <Popup>You are here</Popup>
      </Marker>
      {me.accuracy > 25 && (
        <Circle center={[me.lat, me.lng]} radius={me.accuracy} color="#2563eb" weight={1} fillOpacity={0.08} />
      )}
    </>
  );
}

export function MapPanel() {
  const { mode, snapshot, filters } = useAppContext();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [me, setMe] = React.useState<MePosition | null>(null);
  const [locateStatus, setLocateStatus] = React.useState('');

  const locate = () => {
    if (!navigator.geolocation) {
      setLocateStatus('This browser has no location support.');
      return;
    }
    setLocateStatus('Locating…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setMe({ lat: latitude, lng: longitude, accuracy });
        setLocateStatus(`Located to ±${Math.round(accuracy)}m.`);
      },
      (error) => {
        const reasons: Record<number, string> = {
          1: 'Permission denied — allow location for this site in your browser settings.',
          2: 'Position unavailable.',
          3: 'Timed out.',
        };
        setLocateStatus(reasons[error.code] || 'Could not get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'static' && snapshot) {
          const actions = loadLocalActions();
          const all = (snapshot.listings || []).map((row) => fromSnapshot(row, actions));
          if (!cancelled) setListings(filterAndSort(all, filters));
        } else if (mode === 'server') {
          const data = await fetchMapListingsServer(filters);
          if (!cancelled) setListings(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, snapshot, filters]);

  const located = listings.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
  const missing = listings.length - located.length;

  return (
    <div>
      <FilterBar collapsible defaultOpen={false} />

      <div className="flex items-center gap-2.5 mb-2 mt-1 flex-wrap">
        <Button variant="ghost" size="sm" onClick={locate}>
          <MapPin className="h-3.5 w-3.5" />
          My location
        </Button>
        {locateStatus && <span className="text-muted-foreground text-[13px]">{locateStatus}</span>}
      </div>
      <div className="relative">
        <MapContainer
          center={TEL_AVIV}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: 'calc(100vh - 210px)', minHeight: 320 }}
          className="rounded-lg border border-border z-0"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon} maxClusterRadius={50}>
          {located.map((listing) => {
            const place =
              [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ') ||
              [listing.neighborhood, listing.city].filter(Boolean).join(', ');
            const specs = [
              listing.rooms != null ? `${listing.rooms} rm` : null,
              listing.sizeSqm != null ? `${listing.sizeSqm} m²` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const url = safeUrl(listing.url);
            const wa = waLink(listing.contactPhone);
            return (
              <Marker key={listing.id} position={[listing.lat as number, listing.lng as number]} icon={scoreIcon(listing.score)}>
                <Popup>
                  <div className="popup-price">{shekels(listing.priceIls)}</div>
                  <p className="popup-title" dir="auto">
                    {listing.title}
                  </p>
                  <div className="popup-meta">
                    {specs}
                    {specs && place ? ' · ' : ''}
                    {place}
                  </div>
                  <div className="popup-links">
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Open listing
                      </a>
                    )}
                    {wa && (
                      <a className="wa" href={wa} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          </MarkerClusterGroup>
          <FitBounds listings={listings} />
          <MeLayer me={me} />
        </MapContainer>
      </div>
      <p className="text-muted-foreground mt-2.5">
        {error
          ? `Could not load the map: ${error}`
          : missing
            ? `${located.length} of ${listings.length} shown. ${missing} have no address yet — they are geocoded a batch at a time.`
            : `${located.length} listings shown.`}
      </p>
    </div>
  );
}
