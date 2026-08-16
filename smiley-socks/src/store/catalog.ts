/*
 * What we sell, what it costs, and how the 10% is worked out.
 *
 * Sock geometry lives here too, because placement is a product fact, not a
 * styling choice: the cuff hit is where Stance puts its mark and at Stance's
 * footprint, and the preview is drawn to that scale so what you see on screen
 * is the size that gets knitted.
 */

// The sock is drawn in a 380x480 box. One unit ≈ 0.85 mm on a real sock, from
// a leg panel 100 units wide ≈ 85 mm laid flat, which is a standard adult
// crew. Every print size below is derived from this, so quoted millimetres are
// honest rather than decorative.
export const MM_PER_UNIT = 0.85;
export const SOCK_BOX = { w: 380, h: 480 } as const;
export const LEG = { left: 96, right: 196, centre: 146 } as const;
export const ANKLE_Y = 290;
export const CUFF_BAND = 40;

export interface Height {
  id: 'ankle' | 'crew' | 'knee';
  name: string;
  blurb: string;
  /** y of the cuff opening; smaller means a longer leg. */
  legTop: number;
  /**
   * Cuff opening above the sole, in centimetres — the real measurement the 3D
   * mesh is swept from and the production export sizes its print file by. It
   * lives here rather than next to either renderer so there is exactly one
   * answer to "how long is a crew sock", in millimetres, shared by the proof,
   * the model and the factory file.
   */
  legCm: number;
  priceDelta: number;
}

export const HEIGHTS: Height[] = [
  { id: 'ankle', name: 'Ankle', blurb: 'Just the face, peeking.', legTop: 196, legCm: 11, priceDelta: 0 },
  { id: 'crew', name: 'Crew', blurb: 'The standard. Face sits above the shoe.', legTop: 96, legCm: 21, priceDelta: 0 },
  {
    id: 'knee',
    name: 'Knee-high',
    blurb: 'Unmissable, which is sometimes the point.',
    legTop: 14,
    legCm: 38,
    priceDelta: 2,
  },
];

export interface Size {
  id: string;
  name: string;
  fit: string;
}

export const SIZES: Size[] = [
  { id: 's', name: 'S', fit: 'US W 5–7.5 / M 4–6.5' },
  { id: 'm', name: 'M', fit: 'US W 8–10.5 / M 7–9.5' },
  { id: 'l', name: 'L', fit: 'US W 11–13 / M 10–12.5' },
  { id: 'xl', name: 'XL', fit: 'US M 13–15' },
];

export interface Colorway {
  id: string;
  name: string;
  /** Sock body. */
  base: string;
  /** Cuff band, heel and toe. */
  accent: string;
  /** The print. */
  ink: string;
}

export const COLORWAYS: Colorway[] = [
  { id: 'bone', name: 'Bone', base: '#F0EADE', accent: '#DED5C4', ink: '#191710' },
  { id: 'oatmeal', name: 'Oatmeal', base: '#CDC2B3', accent: '#7E7871', ink: '#211C16' },
  { id: 'fog', name: 'Fog', base: '#F1F1EF', accent: '#B3B3B0', ink: '#1C1C1A' },
  { id: 'midnight', name: 'Midnight', base: '#1E2542', accent: '#2E3A63', ink: '#F5F0E4' },
  { id: 'clay', name: 'Clay', base: '#C4553B', accent: '#9E3F2A', ink: '#FBEFE2' },
  { id: 'moss', name: 'Moss', base: '#3D5A44', accent: '#2C4433', ink: '#F0EEDC' },
  { id: 'bubblegum', name: 'Bubblegum', base: '#EFA3BD', accent: '#DE6E8E', ink: '#2B1220' },
  { id: 'butter', name: 'Butter', base: '#F0C258', accent: '#DCA636', ink: '#2A2110' },
];

export interface Placement {
  id: 'cuff' | 'leg' | 'stacked' | 'allover';
  name: string;
  blurb: string;
  /** Print diameter in sock units. */
  size: number;
  priceDelta: number;
}

export const PLACEMENTS: Placement[] = [
  {
    id: 'cuff',
    name: 'Cuff hit',
    blurb: 'Outer cuff, ~29 mm — the spot and the size Stance uses.',
    size: 34,
    priceDelta: 0,
  },
  { id: 'leg', name: 'Big leg hit', blurb: 'Mid-leg, ~49 mm. Read from across the room.', size: 58, priceDelta: 0 },
  { id: 'stacked', name: 'Stacked', blurb: 'The same face, three times up the leg.', size: 32, priceDelta: 1 },
  { id: 'allover', name: 'All-over', blurb: 'Tiled across the whole sock.', size: 22, priceDelta: 3 },
];

export function printMm(placement: Placement): number {
  return Math.round(placement.size * MM_PER_UNIT);
}

// --- Pricing ---------------------------------------------------------------

export const PRICE = {
  /** One pair. */
  single: 18,
  /** Per pair from three. */
  three: 16,
  /** Per pair from six. */
  six: 15,
  photoPrint: 3,
} as const;

export const DONATION_RATE = 0.1;

/** Pack pricing is automatic — no codes, no "bundle" SKU to pick. */
export function unitBase(totalPairs: number): number {
  if (totalPairs >= 6) return PRICE.six;
  if (totalPairs >= 3) return PRICE.three;
  return PRICE.single;
}

export interface PricedDesign {
  heightId: Height['id'];
  placementId: Placement['id'];
  hasPhoto: boolean;
}

/** What one pair adds on top of the pack unit price. */
export function extrasFor(d: PricedDesign): number {
  const height = HEIGHTS.find((h) => h.id === d.heightId)?.priceDelta ?? 0;
  const placement = PLACEMENTS.find((p) => p.id === d.placementId)?.priceDelta ?? 0;
  return height + placement + (d.hasPhoto ? PRICE.photoPrint : 0);
}

/** Price of a single pair on its own, for the studio's buy bar. */
export function priceOne(d: PricedDesign): number {
  return PRICE.single + extrasFor(d);
}

export interface Totals {
  pairs: number;
  subtotal: number;
  donation: number;
  /** What the pack pricing already took off, so the bag can show it. */
  saved: number;
}

export function totals(items: { design: PricedDesign; quantity: number }[]): Totals {
  const pairs = items.reduce((n, i) => n + i.quantity, 0);
  const unit = unitBase(pairs);
  const subtotal = items.reduce((sum, i) => sum + (unit + extrasFor(i.design)) * i.quantity, 0);
  const atSingle = items.reduce((sum, i) => sum + (PRICE.single + extrasFor(i.design)) * i.quantity, 0);
  return {
    pairs,
    subtotal,
    // Rounded to the cent it would actually be donated in.
    donation: Math.round(subtotal * DONATION_RATE * 100) / 100,
    saved: atSingle - subtotal,
  };
}

export function money(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, '')}`;
}
