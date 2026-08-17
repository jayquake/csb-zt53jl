/*
 * The shelf.
 *
 * Until now the only way to buy anything was to design it. That is the point
 * of the brand, but it is not a shop: a storefront needs things that already
 * exist, with names and prices, that you can browse and filter and land on
 * from a link.
 *
 * A product is a face plus a colourway — a made-up pair we have "already
 * knitted". Height, size and placement stay variants chosen on the product
 * page, exactly as they are in the studio, so a product is a starting point in
 * the same data model rather than a separate kind of thing. Anything on the
 * shelf can still be opened in the studio and pulled around.
 */

import { cloneFace, TEMPLATES, templateById } from '../brand/templates';
import { COLORWAYS } from './catalog';
import { DEFAULT_DESIGN, type Design } from './design';

export interface Product {
  id: string;
  templateId: string;
  colorwayId: string;
  name: string;
  blurb: string;
}

/**
 * Colourways are assigned so neighbours in the grid never repeat, and so the
 * darker moods land on the darker bodies.
 */
const COLOUR_FOR: Record<string, string> = {
  sunny: 'butter',
  smitten: 'oatmeal',
  flirty: 'bubblegum',
  steady: 'bone',
  fuzzy: 'fog',
  wired: 'clay',
  heavy: 'midnight',
  static: 'oatmeal',
  tender: 'bubblegum',
  fierce: 'clay',
  drained: 'moss',
  hopeful: 'butter',
  loved: 'bubblegum',
  sly: 'moss',
  proud: 'butter',
  bored: 'bone',
  shy: 'bubblegum',
  smug: 'moss',
  queasy: 'moss',
  relieved: 'bone',
  silly: 'bubblegum',
  lonely: 'midnight',
  determined: 'clay',
  curious: 'butter',
  crushed: 'midnight',
  rattled: 'fog',
  goofy: 'clay',
  starstruck: 'midnight',
  melancholy: 'fog',
  sobbing: 'midnight',
  unbothered: 'oatmeal',
  blank: 'bone',
};

export const PRODUCTS: Product[] = TEMPLATES.map((template) => ({
  id: template.id,
  templateId: template.id,
  colorwayId: COLOUR_FOR[template.id] ?? 'bone',
  name: `${template.name} Crew`,
  blurb: template.blurb,
}));

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** The design a product starts as. Variants are chosen on the product page. */
export function productDesign(product: Product): Design {
  const template = templateById(product.templateId);
  return {
    ...DEFAULT_DESIGN,
    templateId: template?.id ?? null,
    label: template?.name ?? product.name,
    face: cloneFace(template?.face ?? DEFAULT_DESIGN.face),
    colorwayId: product.colorwayId,
  };
}

export interface ShopFilter {
  /** Free text over the name and the blurb. */
  query?: string;
  colorwayId?: string;
}

export function filterProducts(products: Product[], filter: ShopFilter): Product[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  return products.filter((p) => {
    if (filter.colorwayId && p.colorwayId !== filter.colorwayId) return false;
    if (!q) return true;
    return `${p.name} ${p.blurb}`.toLowerCase().includes(q);
  });
}

/** Colourways that actually have something on the shelf, for the filter row. */
export function shelfColorways() {
  const used = new Set(PRODUCTS.map((p) => p.colorwayId));
  return COLORWAYS.filter((c) => used.has(c.id));
}

/**
 * What the product page claims about the sock itself.
 *
 * Marked as a demo spec on the page: nothing here has been knitted, and a real
 * shop would carry the mill's actual figures.
 */
export const SPEC = [
  ['Composition', '80% combed cotton, 17% polyamide, 3% elastane'],
  ['Knit', '200-needle, cushioned footbed, ribbed cuff'],
  ['Care', 'Machine wash cold, tumble dry low, no bleach'],
  ['Made for', 'Everyday wear — not a technical sport sock'],
] as const;
