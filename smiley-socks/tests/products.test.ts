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
import { templateById, TEMPLATES } from '../src/brand/templates';
import { COLORWAYS, priceOne, PRICE } from '../src/store/catalog';
import { pricedFrom } from '../src/store/design';

describe('the shelf', () => {
  it('lists every face exactly once, with a real colourway', () => {
    expect(PRODUCTS).toHaveLength(TEMPLATES.length);
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
    expect(filterProducts(PRODUCTS, { query: 'lonely' })).toHaveLength(1);
    // The blurb is searched too, so words people actually type still land.
    expect(filterProducts(PRODUCTS, { query: 'advice' }).length).toBeGreaterThan(0);
    expect(filterProducts(PRODUCTS, { query: 'zzzzz' })).toHaveLength(0);
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
    expect(productById(PRODUCTS[3].id)).toBeDefined();
    expect(productById('not-a-sock')).toBeUndefined();
  });
});
