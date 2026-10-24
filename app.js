/* Apartment finder UI.
 *
 * Plain JS on purpose: this is a single-user tool served from a local box, and
 * a build step would be more machinery than the whole app needs.
 */

const PAGE_SIZE = 30;

const state = {
  tab: 'feed',
  offset: 0,
  total: 0,
  listings: [],
  /**
   * Static mode is what makes this page work on GitHub Pages, where there is
   * no server: the same UI reads a generated data.json instead of the API,
   * filters and sorts in the browser, and keeps Save/Hide in localStorage.
   * Detected at boot rather than configured, so one build serves both.
   */
  static: false,
  snapshot: null,
  areas: null,
};

const $ = (sel) => document.querySelector(sel);

/* ---------- helpers ---------- */

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function shekels(n) {
  return n == null ? '—' : `₪${n.toLocaleString('en-US')}`;
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

/** Escapes user/scraped text before it goes near innerHTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** Only http(s) URLs are allowed to become links — manual:// entries are not. */
function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : null;
}

/* ---------- static mode ---------- */

const LOCAL_ACTIONS_KEY = 'apartment-finder:actions';

function loadLocalActions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ACTIONS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalAction(id, status) {
  const actions = loadLocalActions();
  if (status) actions[id] = status;
  else delete actions[id];
  try {
    localStorage.setItem(LOCAL_ACTIONS_KEY, JSON.stringify(actions));
  } catch {
    /* private browsing or a full quota — the feed still works, just unsaved */
  }
}

/** Reshapes a snapshot listing into the same object the API returns. */
function fromSnapshot(row, actions) {
  const parseArray = (value) => {
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  return {
    ...row,
    imageUrls: parseArray(row.imageUrls),
    scoreReasons: parseArray(row.scoreReasons),
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

/**
 * Amenity chips in the filter bar, mapped to the field each checkbox reads
 * on a listing's `amenities` object (server API and static mode both use it).
 */
const AMENITY_FIELDS = [
  ['#filter-elevator', 'elevator'],
  ['#filter-parking', 'parking'],
  ['#filter-balcony', 'balcony'],
  ['#filter-saferoom', 'safeRoom'],
  ['#filter-furnished', 'furnished'],
];

/** Applies the feed filters client-side, mirroring the API's semantics. */
function filterAndSort(listings) {
  const q = $('#filter-q').value.trim().toLowerCase();
  const minPrice = Number($('#filter-min-price').value) || null;
  const maxPrice = Number($('#filter-max-price').value) || null;
  const poster = $('#filter-poster').value;
  const source = $('#filter-source').value;
  const area = $('#filter-area').value;
  const sort = $('#filter-sort').value;
  const amenities = AMENITY_FIELDS.filter(([sel]) => $(sel).checked).map(([, key]) => key);

  let out = listings.filter((l) => {
    if (l.status === 'HIDDEN') return false;
    if (minPrice != null && (l.priceIls == null || l.priceIls < minPrice)) return false;
    if (maxPrice != null && (l.priceIls == null || l.priceIls > maxPrice)) return false;
    // Unknown provenance counts as "not a realtor", matching the server.
    if (poster === 'private' && l.isAgency === true) return false;
    if (poster === 'agency' && l.isAgency !== true) return false;
    if (source && l.source !== source) return false;
    if (area && l.neighborhood !== area) return false;
    // A checked amenity must be a *confirmed* true — undefined means the
    // listing never said, which "must have" cannot count as satisfying.
    if (amenities.some((key) => l.amenities[key] !== true)) return false;
    if (q) {
      const hay = `${l.title} ${l.description || ''} ${l.neighborhood || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const num = (v) => (v == null ? -Infinity : v);
  const cmp = {
    score: (a, b) => b.score - a.score,
    price: (a, b) => num(a.priceIls) - num(b.priceIls),
    price_desc: (a, b) => num(b.priceIls) - num(a.priceIls),
    size: (a, b) => num(b.sizeSqm) - num(a.sizeSqm),
    rooms: (a, b) => num(b.rooms) - num(a.rooms),
    newest: (a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt),
    oldest: (a, b) => new Date(a.firstSeenAt) - new Date(b.firstSeenAt),
    updated: (a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt),
  };
  return out.sort(cmp[sort] || cmp.score);
}

/* ---------- rendering ---------- */

function sparkline(history) {
  if (!history || history.length < 2) return '';
  const prices = history.map((h) => h.priceIls);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 260;
  const height = 34;

  const points = prices
    .map((price, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - 4 - ((price - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const dropped = prices[prices.length - 1] < prices[0];
  const color = dropped ? 'var(--good)' : 'var(--muted)';

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
    aria-label="Price history: ${shekels(prices[0])} to ${shekels(prices[prices.length - 1])}">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}

function listingCard(listing) {
  const image = listing.imageUrls && listing.imageUrls[0];
  const history = listing.priceHistory || [];
  const firstPrice = history.length > 1 ? history[0].priceIls : null;
  const isDrop = firstPrice != null && listing.priceIls != null && listing.priceIls < firstPrice;

  const specs = [
    listing.rooms != null ? `${listing.rooms} rm` : null,
    listing.sizeSqm != null ? `${listing.sizeSqm} m²` : null,
    listing.floor != null ? (listing.floor === 0 ? 'ground floor' : `floor ${listing.floor}`) : null,
  ].filter(Boolean).join(' · ');

  // English first for skimming, Hebrew kept because that is what you paste
  // into Waze or quote to a landlord.
  const placeHe = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  const placeEn = [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ');
  const place = placeEn || placeHe;

  // Only a confirmed agent post is badged. `null` means the listing never said,
  // and labelling that "private" would be a claim the data does not support.
  const posterBadge =
    listing.isAgency === true ? '<span class="badge warn">Realtor</span>'
    : listing.isAgency === false ? '<span class="badge ok">Owner</span>'
    : '';

  // The mamad is deliberately not just another pill. Most Tel Aviv stock
  // predates the 1992 rule that made safe rooms mandatory, so a flat that has
  // one is the rare exception — it gets its own shield and colour so it is
  // findable by eye in a long, otherwise identical list.
  const mamadBadge =
    listing.amenities.safeRoom === true ? '<span class="badge mamad">🛡️ Mamad</span>' : '';

  const amenityBadges = Object.entries({
    Elevator: listing.amenities.elevator,
    Parking: listing.amenities.parking,
    Balcony: listing.amenities.balcony,
    Furnished: listing.amenities.furnished,
  })
    // Only badge a confirmed amenity. null/undefined means the listing never
    // said, which is not the same as not having one.
    .filter(([, on]) => on === true)
    .map(([label]) => `<span class="badge">${label}</span>`)
    .join('');

  const url = safeUrl(listing.url);
  const titleHtml = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(listing.title)}</a>`
    : esc(listing.title);

  const reasons = (listing.scoreReasons || []).slice(0, 2).join(' · ');

  return `
    <article class="card listing ${image ? '' : 'no-image'}" data-id="${esc(listing.id)}">
      ${image ? `<img class="thumb" src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}
      <div>
        <p class="listing-title" dir="auto">${titleHtml}</p>
        <div class="price ${isDrop ? 'is-drop' : ''}">
          ${shekels(listing.priceIls)}
          ${isDrop ? `<span class="old">${shekels(firstPrice)}</span>` : ''}
        </div>
        <div class="meta">${esc(specs)}${specs && place ? ' · ' : ''}${esc(place)}</div>
        ${placeEn && placeHe ? `<div class="meta he" dir="rtl">${esc(placeHe)}</div>` : ''}
        ${reasons ? `<div class="meta">✨ ${esc(reasons)}</div>` : ''}
        <div class="badges">
          <span class="badge score">${listing.score}</span>
          ${mamadBadge}
          <span class="badge src">${esc(listing.source)}</span>
          ${posterBadge}
          ${amenityBadges}
        </div>
        ${sparkline(history)}
        ${contactRow(listing)}
        <div class="actions">
          <button class="btn btn-ghost" data-action="SAVED">${listing.status === 'SAVED' ? '★ Saved' : '☆ Save'}</button>
          <button class="btn btn-ghost" data-action="HIDDEN">Hide</button>
          <button class="btn btn-ghost" data-action="CONTACTED">${listing.status === 'CONTACTED' ? '✓ Contacted' : 'Contacted'}</button>
        </div>
      </div>
    </article>`;
}

/** Local display form for an E.164 Israeli number: +972501234567 -> 050-123-4567. */
function localPhone(phone) {
  if (!phone || !phone.startsWith('+972')) return phone || '';
  const local = '0' + phone.slice(4);
  return local.length === 10
    ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
    : local;
}

/** Chat and call links, shown only when the poster published a number. */
function contactRow(listing) {
  const phone = listing.contactPhone;
  if (!phone || !/^\+\d{8,15}$/.test(phone)) return '';
  const wa = `https://wa.me/${phone.slice(1)}`;
  return `
    <div class="contact">
      <a class="btn btn-wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a class="btn btn-ghost" href="tel:${esc(phone)}">${esc(localPhone(phone))}</a>
    </div>`;
}

function renderList(container, listings, emptyMessage) {
  if (!listings.length) {
    container.innerHTML = `<p class="empty">${esc(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = listings.map(listingCard).join('');

  // Listing sites expire their image URLs and some block hotlinking, so a
  // broken thumbnail is routine. Drop it and reflow the card to the no-image
  // layout rather than leaving an empty grey box occupying the column.
  container.querySelectorAll('img.thumb').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const card = img.closest('.listing');
        if (card) card.classList.add('no-image');
        img.remove();
      },
      { once: true }
    );
  });
}

/* ---------- areas ---------- */

/**
 * Builds the area lists from the listings themselves rather than a fixed
 * catalogue, so the options are always ones that currently have results —
 * offering a neighbourhood with nothing in it is just a dead end.
 *
 * The value is the Hebrew name (that is what the criteria and the sources
 * match on); the label is English where a translation exists.
 */
function areaOptions() {
  // In server mode the authoritative list comes from /api/areas, which covers
  // every listing rather than just the page currently rendered.
  if (!state.static && state.areas) return state.areas;

  const source = state.static ? state.snapshot?.listings || [] : state.listings;
  const areas = new Map(); // hebrew -> { label, count }
  for (const listing of source) {
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

function fillAreaFilter() {
  const select = $('#filter-area');
  if (!select) return;
  const previous = select.value;
  const options = areaOptions();

  select.innerHTML =
    '<option value="">All areas</option>' +
    options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)} (${o.count})</option>`).join('');

  // Keep the selection across refreshes, unless that area no longer exists.
  if (previous && options.some((o) => o.value === previous)) select.value = previous;
}

/** Populates the two criteria multi-selects, preserving what is already chosen. */
function fillAreaSelects(selectedAreas = [], favouriteAreas = []) {
  const options = areaOptions();
  const render = (id, selected) => {
    const select = $(id);
    if (!select) return;
    // Anything already saved but absent from the current data must still show,
    // or saving the form would silently drop it.
    const values = new Set(options.map((o) => o.value));
    const extras = selected.filter((v) => !values.has(v)).map((v) => ({ value: v, label: v, count: 0 }));
    select.innerHTML = [...options, ...extras]
      .map((o) => {
        const on = selected.includes(o.value) ? ' selected' : '';
        const suffix = o.count ? ` (${o.count})` : '';
        return `<option value="${esc(o.value)}"${on}>${esc(o.label)}${suffix}</option>`;
      })
      .join('');
  };
  render('#c-neighborhoods', selectedAreas);
  render('#c-favAreas', favouriteAreas);
}

function selectedValues(id) {
  const select = $(id);
  return select ? [...select.selectedOptions].map((o) => o.value) : [];
}

/* ---------- map ---------- */

let map = null;
let markerLayer = null;

/**
 * Renders the currently filtered listings as pins.
 *
 * Built lazily on first view: Leaflet measures its container at init, and a
 * hidden panel has zero height, so initialising it up front produces a map
 * that never renders until something forces a resize.
 */
function renderMap(listings) {
  if (typeof L === 'undefined') {
    $('#map-note').textContent = 'Map library failed to load.';
    return;
  }

  if (!map) {
    // Centred on Tel Aviv until the pins tell us better.
    map = L.map('map', { scrollWheelZoom: false }).setView([32.0761, 34.7783], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  markerLayer.clearLayers();

  const located = listings.filter((l) => typeof l.lat === 'number' && typeof l.lng === 'number');
  const bounds = [];

  for (const listing of located) {
    const tier = listing.score >= 70 ? 'high' : listing.score >= 50 ? 'mid' : 'low';
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin pin-${tier}"><span>${listing.score}</span></div>`,
      iconSize: [0, 0],
    });

    const place = [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ')
      || [listing.neighborhood, listing.city].filter(Boolean).join(', ');
    const specs = [
      listing.rooms != null ? `${listing.rooms} rm` : null,
      listing.sizeSqm != null ? `${listing.sizeSqm} m²` : null,
    ].filter(Boolean).join(' · ');

    const url = safeUrl(listing.url);
    const wa = listing.contactPhone && /^\+\d{8,15}$/.test(listing.contactPhone)
      ? `https://wa.me/${listing.contactPhone.slice(1)}`
      : null;

    const popup = `
      <div class="popup-price">${shekels(listing.priceIls)}${
        listing.amenities?.safeRoom === true ? ' <span class="popup-mamad">🛡️ Mamad</span>' : ''
      }</div>
      <p class="popup-title" dir="auto">${esc(listing.title)}</p>
      <div class="popup-meta">${esc(specs)}${specs && place ? ' · ' : ''}${esc(place)}</div>
      <div class="popup-links">
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open listing</a>` : ''}
        ${wa ? `<a class="wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
      </div>`;

    L.marker([listing.lat, listing.lng], { icon }).bindPopup(popup).addTo(markerLayer);
    bounds.push([listing.lat, listing.lng]);
  }

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });

  // Be explicit about coverage rather than quietly showing a partial map —
  // a listing with no pin is easy to assume does not exist.
  const missing = listings.length - located.length;
  $('#map-note').textContent = missing
    ? `${located.length} of ${listings.length} shown. ${missing} have no address yet — they are geocoded a batch at a time.`
    : `${located.length} listings shown.`;

  // The container had no size while the panel was hidden.
  setTimeout(() => map.invalidateSize(), 0);
}

let meLayer = null;

/**
 * Centres the map on the browser's reported position.
 *
 * Geolocation needs a secure context, so this works on the published HTTPS
 * page and on localhost, but not over plain HTTP on a LAN address — worth
 * knowing before concluding it is broken.
 */
function locateMe() {
  const status = $('#locate-status');

  if (!navigator.geolocation) {
    status.textContent = 'This browser has no location support.';
    return;
  }
  if (!map) {
    status.textContent = 'Open the map first.';
    return;
  }

  status.textContent = 'Locating…';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      if (!meLayer) meLayer = L.layerGroup().addTo(map);
      meLayer.clearLayers();

      L.marker([latitude, longitude], {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [0, 0] }),
        zIndexOffset: 1000,
      })
        .bindPopup('You are here')
        .addTo(meLayer);

      // The accuracy circle is the honest part: a 2km fix rendered as a precise
      // dot would imply a certainty the browser never claimed.
      if (accuracy && accuracy > 25) {
        L.circle([latitude, longitude], {
          radius: accuracy,
          color: '#2563eb',
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(meLayer);
      }

      map.setView([latitude, longitude], 15);
      status.textContent = `Located to ±${Math.round(accuracy)}m.`;
    },
    (error) => {
      const reasons = {
        1: 'Permission denied — allow location for this site in your browser settings.',
        2: 'Position unavailable.',
        3: 'Timed out.',
      };
      status.textContent = reasons[error.code] || 'Could not get your location.';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/** Loads every match (not just the current page) so the map is complete. */
async function loadMap() {
  try {
    if (state.static) {
      const actions = loadLocalActions();
      const all = (state.snapshot.listings || []).map((row) => fromSnapshot(row, actions));
      renderMap(filterAndSort(all));
      return;
    }
    const params = new URLSearchParams(feedQuery(0));
    params.set('limit', '500');
    params.set('offset', '0');
    const data = await api(`/listings?${params.toString()}`);
    renderMap(data.listings);
  } catch (err) {
    $('#map-note').textContent = `Could not load the map: ${err.message}`;
  }
}

/* ---------- data loading ---------- */

const FILTER_FIELDS = [
  ['#filter-q', 'q'],
  ['#filter-min-price', 'minPrice'],
  ['#filter-max-price', 'maxPrice'],
  ['#filter-poster', 'poster'],
  ['#filter-source', 'source'],
  ['#filter-area', 'area'],
];

function feedQuery(offset) {
  const params = new URLSearchParams({
    sort: $('#filter-sort').value,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  for (const [sel, key] of FILTER_FIELDS) {
    const value = $(sel).value.trim();
    if (value) params.set(key, value);
  }
  for (const [sel, key] of AMENITY_FIELDS) {
    if ($(sel).checked) params.set(key, 'true');
  }
  return params.toString();
}

async function loadFeed(append = false) {
  const offset = append ? state.offset + PAGE_SIZE : 0;
  try {
    const data = state.static ? staticFeed(offset) : await api(`/listings?${feedQuery(offset)}`);
    state.offset = offset;
    state.total = data.total;
    state.listings = append ? state.listings.concat(data.listings) : data.listings;
    fillAreaFilter();
    renderList($('#feed-list'), state.listings, 'No listings match. Try widening the filters, or tap "Scan now".');
    $('#result-count').textContent =
      data.total === 0 ? '' : `${state.listings.length} of ${data.total}`;
    $('#load-more').hidden = state.listings.length >= state.total;
  } catch (err) {
    $('#feed-list').innerHTML = `<p class="empty">Failed to load: ${esc(err.message)}</p>`;
  }
}

/** The static equivalent of GET /listings: filter, sort and page in-browser. */
function staticFeed(offset) {
  const actions = loadLocalActions();
  const all = (state.snapshot.listings || []).map((row) => fromSnapshot(row, actions));
  const matched = filterAndSort(all);
  return { total: matched.length, listings: matched.slice(offset, offset + PAGE_SIZE) };
}

async function loadSaved() {
  try {
    if (state.static) {
      const actions = loadLocalActions();
      const saved = (state.snapshot.listings || [])
        .map((row) => fromSnapshot(row, actions))
        .filter((l) => l.status === 'SAVED');
      renderList($('#saved-list'), saved, 'Nothing saved yet.');
      return;
    }
    const data = await api('/listings?status=SAVED&limit=200');
    renderList($('#saved-list'), data.listings, 'Nothing saved yet.');
  } catch (err) {
    $('#saved-list').innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

/** Server mode only: the complete area list, refreshed after each scan. */
async function loadAreas() {
  if (state.static) return;
  try {
    const data = await api('/areas');
    state.areas = data.areas;
  } catch {
    state.areas = null; // fall back to deriving from the visible page
  }
}

async function loadStatus() {
  try {
    const s = state.static ? staticStatus() : await api('/status');
    const last = s.lastRun;
    const parts = [`${s.counts.active} active`, `${s.counts.saved} saved`];
    if (last) {
      const when = new Date(last.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      parts.push(`last scan ${when} · ${last.new} new`);
      if (last.errors && last.errors.length) parts.push(`⚠️ ${last.errors.length} source errors`);
    }
    if (s.scanning) parts.push('scanning now…');
    if (state.static) parts.push('read-only');
    $('#status-line').textContent = parts.join(' · ');
    $('#scan-btn').disabled = s.scanning;
    return s;
  } catch {
    $('#status-line').textContent = 'Cannot reach the server';
    return null;
  }
}

/** Rebuilds the /status shape from the snapshot's metadata. */
function staticStatus() {
  const snap = state.snapshot || {};
  const saved = Object.values(loadLocalActions()).filter((v) => v === 'SAVED').length;
  return {
    scanning: false,
    counts: { active: snap.counts?.active ?? 0, saved },
    lastRun: snap.lastRun,
    generatedAt: snap.generatedAt,
  };
}

async function loadCriteria() {
  if (state.static) {
    const c = state.snapshot?.criteria;
    if (!c) return;
    renderCriteria(c);
    return;
  }
  const { criteria: c } = await api('/criteria');
  renderCriteria(c);
}

function renderCriteria(c) {
  const set = (id, value) => {
    const el = $(id);
    if (el) el.value = value ?? '';
  };
  set('#c-minPrice', c.minPriceIls);
  set('#c-maxPrice', c.maxPriceIls);
  set('#c-minRooms', c.minRooms);
  set('#c-maxRooms', c.maxRooms);
  set('#c-minSize', c.minSizeSqm);
  set('#c-idealPrice', c.preferences.idealMaxPriceIls);
  set('#c-cities', (c.cities || []).join(', '));
  fillAreaSelects(c.neighborhoods || [], c.preferences.favoriteNeighborhoods || []);
  set('#c-exclude', (c.excludeKeywords || []).join(', '));
  set('#c-minScore', c.minScoreToAlert);
  set('#c-minDrop', c.minPriceDropPercent);
  const posterSelect = $('#c-posterType');
  if (posterSelect) posterSelect.value = c.posterType || 'any';
  $('#c-strictPoster').checked = !!c.strictPosterFilter;
  $('#c-reqElevator').checked = !!c.requireElevator;
  $('#c-reqParking').checked = !!c.requireParking;
  $('#c-reqBalcony').checked = !!c.requireBalcony;
  $('#c-reqSafeRoom').checked = !!c.requireSafeRoom;
}

/* ---------- events ---------- */

function numberOrUndefined(id) {
  const raw = $(id).value.trim();
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function csv(id) {
  return $(id).value.split(',').map((s) => s.trim()).filter(Boolean);
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    state.tab = tab.dataset.tab;
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('is-active', p.id === `panel-${state.tab}`);
    });

    if (state.tab === 'saved') loadSaved();
    if (state.tab === 'map') loadMap();
    if (state.tab === 'settings') loadCriteria().catch((e) => toast(e.message));
  });
});

// Delegated so the handler survives re-renders.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const card = button.closest('[data-id]');
  if (!card) return;

  const id = card.dataset.id;
  const listing = state.listings.find((l) => l.id === id);
  const requested = button.dataset.action;
  // Tapping the active status clears it, so the same button un-saves.
  const status = listing && listing.status === requested ? null : requested;

  try {
    if (state.static) saveLocalAction(id, status);
    else await api(`/listings/${id}/action`, { method: 'POST', body: { status } });
    if (listing) listing.status = status;

    if (status === 'HIDDEN') {
      card.remove();
      toast('Hidden');
    } else {
      toast(status ? 'Updated' : 'Cleared');
      if (state.tab === 'saved') loadSaved();
    if (state.tab === 'map') loadMap();
      else renderList($('#feed-list'), state.listings, '');
    }
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
});

$('#scan-btn').addEventListener('click', async () => {
  $('#scan-btn').disabled = true;
  try {
    await api('/scan', { method: 'POST', body: {} });
    toast('Scan started — this takes a few minutes');
    // Poll until the run finishes, then refresh the feed.
    const poll = setInterval(async () => {
      const s = await loadStatus();
      if (s && !s.scanning) {
        clearInterval(poll);
        loadFeed();
      }
    }, 5000);
  } catch (err) {
    toast(`Error: ${err.message}`);
    $('#scan-btn').disabled = false;
  }
});

$('#manual-submit').addEventListener('click', async () => {
  const box = $('#manual-result');
  const text = $('#manual-text').value.trim();
  if (text.length < 20) {
    box.hidden = false;
    box.className = 'result err';
    box.textContent = 'That text is too short.';
    return;
  }

  try {
    const result = await api('/ingest/manual', {
      method: 'POST',
      body: { text, url: $('#manual-url').value.trim() || undefined },
    });
    const p = result.parsed;
    box.hidden = false;
    box.className = 'result ok';
    box.textContent = result.note
      ? `Parsed ${shekels(p.priceIls)} · ${p.rooms ?? '?'} rooms — but it does not match your criteria.`
      : `Added: ${shekels(p.priceIls)} · ${p.rooms ?? '?'} rooms · ${p.city || 'city not detected'}`;
    $('#manual-text').value = '';
    $('#manual-url').value = '';
    loadFeed();
  } catch (err) {
    box.hidden = false;
    box.className = 'result err';
    box.textContent = `Error: ${err.message}`;
  }
});

$('#criteria-save').addEventListener('click', async () => {
  const box = $('#criteria-result');
  try {
    await api('/criteria', {
      method: 'PUT',
      body: {
        minPriceIls: numberOrUndefined('#c-minPrice'),
        maxPriceIls: numberOrUndefined('#c-maxPrice'),
        minRooms: numberOrUndefined('#c-minRooms'),
        maxRooms: numberOrUndefined('#c-maxRooms'),
        minSizeSqm: numberOrUndefined('#c-minSize'),
        cities: csv('#c-cities'),
        neighborhoods: selectedValues('#c-neighborhoods'),
        excludeKeywords: csv('#c-exclude'),
        minScoreToAlert: numberOrUndefined('#c-minScore') ?? 55,
        minPriceDropPercent: numberOrUndefined('#c-minDrop') ?? 3,
        posterType: $('#c-posterType').value,
        strictPosterFilter: $('#c-strictPoster').checked,
        requireElevator: $('#c-reqElevator').checked,
        requireParking: $('#c-reqParking').checked,
        requireBalcony: $('#c-reqBalcony').checked,
        requireSafeRoom: $('#c-reqSafeRoom').checked,
        preferences: {
          idealMaxPriceIls: numberOrUndefined('#c-idealPrice'),
          favoriteNeighborhoods: selectedValues('#c-favAreas'),
        },
      },
    });
    box.hidden = false;
    box.className = 'result ok';
    box.textContent = 'Saved. The next scan will use these criteria.';
  } catch (err) {
    box.hidden = false;
    box.className = 'result err';
    box.textContent = `Error: ${err.message}`;
  }
});

let debounce;
['#filter-q', '#filter-min-price', '#filter-max-price'].forEach((sel) => {
  $(sel).addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadFeed(), 350);
  });
});
['#filter-sort', '#filter-poster', '#filter-source', '#filter-area'].forEach((sel) => {
  $(sel).addEventListener('change', () => loadFeed());
});
AMENITY_FIELDS.forEach(([sel]) => {
  $(sel).addEventListener('change', () => loadFeed());
});

// The map reflects the same filters as the feed, so re-render it when they
// change and it is the visible tab.
const originalLoadFeed = loadFeed;
loadFeed = async function (append = false) {
  await originalLoadFeed(append);
  if (state.tab === 'map') loadMap();
};

$('#locate-btn').addEventListener('click', locateMe);

$('#filter-reset').addEventListener('click', () => {
  ['#filter-q', '#filter-min-price', '#filter-max-price', '#filter-poster', '#filter-source', '#filter-area'].forEach((sel) => {
    $(sel).value = '';
  });
  $('#filter-sort').value = 'score';
  AMENITY_FIELDS.forEach(([sel]) => { $(sel).checked = false; });
  loadFeed();
});
$('#load-more').addEventListener('click', () => loadFeed(true));

/* ---------- boot ---------- */

async function boot() {
  // Probe the API. On GitHub Pages there is no server, so this 404s (or
  // returns the HTML shell) and the page falls back to the generated data.
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('no api');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('not json');
    state.static = false;
  } catch {
    state.static = true;
  }

  if (state.static) {
    document.body.classList.add('is-static');
    try {
      // Relative, so the page works from a project-Pages subpath as well as a
      // domain root.
      const response = await fetch('data.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.snapshot = await response.json();
    } catch (err) {
      $('#status-line').textContent = `Could not load data.json: ${err.message}`;
      $('#feed-list').innerHTML = '<p class="empty">No data file found. The scheduled scan may not have run yet.</p>';
      return;
    }
  }

  await loadAreas();
  loadStatus();
  loadFeed();
}

boot();
