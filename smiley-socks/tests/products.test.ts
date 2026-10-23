/*
 * The shelf. A storefront's listing and its product pages have to agree with
 * the pricing rules the bag uses, or the shop advertises something checkout
 * will not honour.
 */

import { describe, expect, it } from 'vitest';
import {
  filterProducts,
  PRODUCTS,
  productById,
  productDesign,
  shelfColorways,
} from '../src/store/products';
import { templateById, TEMPLATES_WITH_ART } from '../src/brand/templates';
import { COLORWAYS, priceOne, PRICE } from '../src/store/catalog';
import { pricedFrom } from '../src/store/design';

describe('the shelf', () => {
  it('lists every art-backed face exactly once, with a real colourway', () => {
    // The shop is filtered to templates that carry real reference art (see
    // TEMPLATES_WITH_ART) while art coverage is still partial, so it should
    // track that list, not the full template count.
    expect(PRODUCTS).toHaveLength(TEMPLATES_WITH_ART.length);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(templateById(p.templateId), p.id).toBeDefined();
      expect(COLORWAYS.some((c) => c.id === p.colorwayId), `${p.id}: ${p.colorwayId}`).toBe(true);
      expect(p.name.length).toBeGreaterThan(3);
    }
  });

  it('starts a product at the plain single price', () => {
    for (const p of PRODUCTS) {
      expect(priceOne(pricedFrom(productDesign(p))), p.id).toBe(PRICE.single);
    }
  });

  it('gives each product page its own face to edit', () => {
    const a = productDesign(PRODUCTS[0]);
    a.face.mouth.curve = -1;
    expect(productDesign(PRODUCTS[0]).face.mouth.curve).not.toBe(-1);
    expect(templateById(PRODUCTS[0].templateId)!.face.mouth.curve).not.toBe(-1);
  });

  it('finds products by name and by mood text', () => {
    expect(filterProducts(PRODUCTS, { query: PRODUCTS[0].name })).toHaveLength(1);
    // The blurb is searched too, so words people actually type still land —
    // pull a distinctive word straight from a real blurb rather than assume
    // which moods are on the shelf.
    const blurbWord = PRODUCTS[0].blurb.split(/\s+/).find((w) => w.length > 4) ?? PRODUCTS[0].blurb;
    expect(filterProducts(PRODUCTS, { query: blurbWord }).length).toBeGreaterThan(0);
    expect(filterProducts(PRODUCTS, { query: 'zzzzz-not-a-real-mood' })).toHaveLength(0);
    expect(filterProducts(PRODUCTS, { query: '  ' })).toHaveLength(PRODUCTS.length);
  });

  it('filters by colourway, and combines with the search', () => {
    const midnight = filterProducts(PRODUCTS, { colorwayId: 'midnight' });
    expect(midnight.length).toBeGreaterThan(0);
    for (const p of midnight) expect(p.colorwayId).toBe('midnight');

    const both = filterProducts(PRODUCTS, { colorwayId: 'midnight', query: 'heavy' });
    expect(both.every((p) => p.colorwayId === 'midnight')).toBe(true);
    expect(both.length).toBeLessThanOrEqual(midnight.length);
  });

  it('only offers filter chips for colourways something is actually in', () => {
    const used = new Set(PRODUCTS.map((p) => p.colorwayId));
    for (const c of shelfColorways()) expect(used.has(c.id)).toBe(true);
  });

  it('resolves a product by id and nothing by a bad one', () => {
    expect(productById(PRODUCTS[0].id)).toBeDefined();
    expect(productById('not-a-sock')).toBeUndefined();
  });

  it('never puts two of the same colourway next to each other in the grid', () => {
    // Colourways are assigned so neighbours in the grid never repeat (see
    // products.ts's COLOUR_FOR comment) — this has broken silently twice
    // now, once when the shelf was reordered and once from a plain gap in
    // COLOUR_FOR, so it gets an actual test rather than relying on someone
    // eyeballing the grid again.
    for (let i = 1; i < PRODUCTS.length; i++) {
      expect(PRODUCTS[i].colorwayId, `${PRODUCTS[i - 1].id} -> ${PRODUCTS[i].id}`).not.toBe(
        PRODUCTS[i - 1].colorwayId,
      );
    }
  });
});
