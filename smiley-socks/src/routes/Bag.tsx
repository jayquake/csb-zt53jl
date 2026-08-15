import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sock } from '../brand/Sock';
import { Stepper } from '../components/Controls';
import { linePrice, useCart } from '../store/cart';
import {
  COLORWAYS,
  DONATION_RATE,
  HEIGHTS,
  money,
  PLACEMENTS,
  SIZES,
  unitBase,
  PRICE,
} from '../store/catalog';
import type { Design } from '../store/design';

const PERCENT = Math.round(DONATION_RATE * 100);

function describe(d: Design): string {
  const height = HEIGHTS.find((h) => h.id === d.heightId)?.name ?? '';
  const colour = COLORWAYS.find((c) => c.id === d.colorwayId)?.name ?? '';
  const size = SIZES.find((s) => s.id === d.sizeId)?.name ?? '';
  const placement = PLACEMENTS.find((p) => p.id === d.placementId)?.name ?? '';
  return `${height} · ${colour} · size ${size} · ${placement.toLowerCase()}`;
}

export function Bag() {
  const { items, totals, setQuantity, remove, clear, storageBlocked } = useCart();
  const [placed, setPlaced] = useState(false);
  const unit = unitBase(totals.pairs);

  if (placed) {
    return (
      <div className="page page--narrow">
        <h1 className="page__title">That's the demo</h1>
        <p className="page__lede">
          No payment was taken and nothing is on its way — this storefront has no checkout behind it. In a real
          build, this is where the order would go to the knitter and{' '}
          <strong>{money(totals.donation)}</strong> would be logged against the {PERCENT}% pledge.
        </p>
        <p>
          <Link className="btn btn--primary btn--big" to="/studio">
            Design another
          </Link>
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="page page--narrow">
        <h1 className="page__title">Your bag is empty</h1>
        <p className="page__lede">Nothing in here yet. Twelve moods are waiting to be pulled out of shape.</p>
        <p>
          <Link className="btn btn--primary btn--big" to="/studio">
            Open the studio
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page bag">
      <h1 className="page__title">Your bag</h1>

      {storageBlocked && (
        <p className="bag__warning" role="status">
          This browser won't let us save your bag (private mode, usually). Everything works, but a refresh will
          empty it.
        </p>
      )}

      <ul className="bag__list">
        {items.map((item) => (
          <li key={item.id} className="bagline">
            <div className="bagline__art">
              <Sock design={item.design} />
            </div>
            <div className="bagline__body">
              <h2 className="bagline__title">
                {item.design.photo ? 'Your image' : item.design.label}
                {item.design.cuffText && <span className="bagline__text"> — “{item.design.cuffText}”</span>}
              </h2>
              <p className="bagline__meta">{describe(item.design)}</p>
              <div className="bagline__controls">
                <Stepper
                  value={item.quantity}
                  label="pair"
                  onChange={(q) => setQuantity(item.id, q)}
                />
                <span className="bagline__price">{money(linePrice(item, unit))}</span>
                <button type="button" className="btn btn--quiet" onClick={() => remove(item.id)}>
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="bag__totals">
        <dl className="totals">
          <div className="totals__row">
            <dt>{totals.pairs === 1 ? '1 pair' : `${totals.pairs} pairs`}</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
          {totals.saved > 0 && (
            <div className="totals__row totals__row--good">
              <dt>Pack pricing ({money(unit)} a pair)</dt>
              <dd>−{money(totals.saved)}</dd>
            </div>
          )}
          {totals.pairs < 3 && (
            <div className="totals__row totals__row--hint">
              <dt>Add one more pair</dt>
              <dd>{money(PRICE.three)} each</dd>
            </div>
          )}
          <div className="totals__row totals__row--donation">
            <dt>{PERCENT}% to mental health support</dt>
            <dd>{money(totals.donation)}</dd>
          </div>
          <div className="totals__row totals__row--grand">
            <dt>Total</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
        </dl>

        <p className="bag__fineprint">
          The {PERCENT}% is included in the price, not added to it. Shipping and tax would be worked out at a
          real checkout — this demo has none.
        </p>

        <div className="bag__actions">
          <button type="button" className="btn btn--primary btn--big" onClick={() => setPlaced(true)}>
            Place demo order · {money(totals.subtotal)}
          </button>
          <button type="button" className="btn btn--quiet" onClick={clear}>
            Empty the bag
          </button>
        </div>
      </div>
    </div>
  );
}
