import { describe, expect, it } from 'vitest';
import {
  DONATION_RATE,
  extrasFor,
  HEIGHTS,
  money,
  PLACEMENTS,
  PRICE,
  priceOne,
  printMm,
  totals,
  unitBase,
  type PricedDesign,
} from '../src/store/catalog';
import { printZones, sockOutline } from '../src/brand/Sock';
import { ANKLE_Y, LEG } from '../src/store/catalog';

const plain: PricedDesign = { heightId: 'crew', placementId: 'cuff', hasPhoto: false };

describe('pricing', () => {
  it('charges the single rate for one pair', () => {
    expect(priceOne(plain)).toBe(PRICE.single);
    expect(totals([{ design: plain, quantity: 1 }]).subtotal).toBe(PRICE.single);
  });

  it('reprices the whole bag once a pack threshold is crossed', () => {
    expect(unitBase(2)).toBe(PRICE.single);
    expect(unitBase(3)).toBe(PRICE.three);
    expect(unitBase(6)).toBe(PRICE.six);

    const three = totals([{ design: plain, quantity: 3 }]);
    expect(three.subtotal).toBe(PRICE.three * 3);
    expect(three.saved).toBe((PRICE.single - PRICE.three) * 3);
  });

  it('counts pairs across separate lines towards the pack price', () => {
    const split = totals([
      { design: plain, quantity: 2 },
      { design: plain, quantity: 1 },
    ]);
    expect(split.pairs).toBe(3);
    expect(split.subtotal).toBe(PRICE.three * 3);
  });

  it('adds the extras on top of the pack rate', () => {
    const fancy: PricedDesign = { heightId: 'knee', placementId: 'allover', hasPhoto: true };
    const extra = extrasFor(fancy);
    expect(extra).toBe(2 + 3 + PRICE.photoPrint);
    expect(priceOne(fancy)).toBe(PRICE.single + extra);
    expect(totals([{ design: fancy, quantity: 3 }]).subtotal).toBe((PRICE.three + extra) * 3);
  });

  it('donates ten percent of the subtotal, to the cent', () => {
    const t = totals([{ design: plain, quantity: 2 }]);
    expect(t.donation).toBe(Math.round(t.subtotal * DONATION_RATE * 100) / 100);
    expect(t.donation).toBe(3.6);
    expect(DONATION_RATE).toBe(0.1);
  });

  it('handles an empty bag', () => {
    const t = totals([]);
    expect(t).toEqual({ pairs: 0, subtotal: 0, donation: 0, saved: 0 });
  });

  it('formats money without trailing zeroes on whole dollars', () => {
    expect(money(18)).toBe('$18');
    expect(money(3.6)).toBe('$3.60');
  });
});

describe('sock geometry', () => {
  it('quotes the cuff hit at roughly the size of a Stance logo', () => {
    const cuff = PLACEMENTS.find((p) => p.id === 'cuff')!;
    expect(printMm(cuff)).toBeGreaterThanOrEqual(25);
    expect(printMm(cuff)).toBeLessThanOrEqual(33);
  });

  it('keeps every leg print on the leg, at every height', () => {
    for (const height of HEIGHTS) {
      for (const placement of PLACEMENTS.filter((p) => p.id !== 'allover')) {
        for (const zone of printZones(placement, height.legTop)) {
          const label = `${height.id}/${placement.id}`;
          expect(zone.y - zone.size / 2, label).toBeGreaterThanOrEqual(height.legTop);
          expect(zone.y + zone.size / 2, label).toBeLessThanOrEqual(ANKLE_Y);
          expect(zone.x, label).toBe(LEG.centre);
        }
      }
    }
  });

  it('fits fewer stacked hits on a shorter sock', () => {
    const stacked = PLACEMENTS.find((p) => p.id === 'stacked')!;
    const knee = printZones(stacked, HEIGHTS[2].legTop).length;
    const ankle = printZones(stacked, HEIGHTS[0].legTop).length;
    expect(knee).toBe(3);
    expect(ankle).toBeGreaterThanOrEqual(1);
    expect(ankle).toBeLessThan(knee);
  });

  it('draws a closed silhouette with no NaN at any height', () => {
    for (const h of HEIGHTS) {
      const d = sockOutline(h.legTop);
      expect(d).not.toMatch(/NaN|undefined/);
      expect(d.trim().endsWith('Z')).toBe(true);
    }
  });
});
