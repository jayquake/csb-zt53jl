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
import { ANKLE_Y, COLORWAYS, LEG } from '../src/store/catalog';
import { TRIOS, trioDesigns, trioPrice } from '../src/store/packs';
import { templateById } from '../src/brand/templates';
import { pricedFrom } from '../src/store/design';

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

describe('three-packs', () => {
  it('names three real templates and three real colourways per trio', () => {
    for (const trio of TRIOS) {
      expect(trio.faces).toHaveLength(3);
      expect(trio.colorways).toHaveLength(3);
      for (const id of trio.faces) expect(templateById(id), id).toBeDefined();
      for (const id of trio.colorways) expect(COLORWAYS.some((c) => c.id === id), id).toBe(true);
    }
  });

  it('charges exactly the bag would for the same three pairs', () => {
    // The pack is not a separate price list — if these ever disagree, the
    // shelf is advertising something the checkout will not honour.
    const designs = trioDesigns(TRIOS[0]);
    const bag = totals(designs.map((d) => ({ design: pricedFrom(d), quantity: 1 })));
    expect(bag.subtotal).toBe(trioPrice());
    expect(bag.pairs).toBe(3);
  });

  it('never gets more expensive by being added to a fuller bag', () => {
    const designs = trioDesigns(TRIOS[1]);
    const alone = totals(designs.map((d) => ({ design: pricedFrom(d), quantity: 1 })));
    const withMore = totals([
      ...designs.map((d) => ({ design: pricedFrom(d), quantity: 1 })),
      { design: pricedFrom(trioDesigns(TRIOS[2])[0]), quantity: 3 },
    ]);
    const perPairAlone = alone.subtotal / alone.pairs;
    const perPairTogether = withMore.subtotal / withMore.pairs;
    expect(perPairTogether).toBeLessThanOrEqual(perPairAlone);
  });

  it('gives each design in a trio its own face object', () => {
    const [a, b] = trioDesigns(TRIOS[0]);
    a.face.eyes.x = 47;
    expect(b.face.eyes.x).not.toBe(47);
    expect(templateById(TRIOS[0].faces[0])!.face.eyes.x).not.toBe(47);
  });
});
