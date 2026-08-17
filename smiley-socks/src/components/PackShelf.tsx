/*
 * The three-pack shelf.
 *
 * Three socks, one price, one tap. The pack rate is not a discount code or a
 * separate SKU — it is the same per-pair pricing the bag already applies, put
 * where someone can see it before they have added anything.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sock } from '../brand/Sock';
import { SockPhoto, sockPhotoAvailable } from '../brand/SockPhoto';
import { COLORWAYS, money, PRICE } from '../store/catalog';
import { TRIOS, trioDesigns, trioPrice } from '../store/packs';
import { useCart } from '../store/cart';

export function PackShelf() {
  const { add } = useCart();
  const [added, setAdded] = useState<string | null>(null);

  return (
    <section className="packs">
      <h2 className="section__title">Sold in threes</h2>
      <p className="section__lede">
        Nobody has one mood. Three pairs for {money(trioPrice())} — {money(PRICE.three)} each instead of{' '}
        {money(PRICE.single)}, applied automatically. Change any face afterwards in the studio.
      </p>

      <ul className="packs__grid">
        {TRIOS.map((trio) => {
          const designs = trioDesigns(trio);
          return (
            <li key={trio.id} className="pack">
              <div className="pack__socks">
                {designs.map((design, i) =>
                  sockPhotoAvailable(design.colorwayId) ? (
                    <SockPhoto
                      key={`${trio.id}-${i}`}
                      colorwayId={design.colorwayId}
                      face={design.face}
                      ink={COLORWAYS.find((c) => c.id === design.colorwayId)?.ink ?? '#191710'}
                      finish={design.finish}
                      className="pack__sock"
                    />
                  ) : (
                    <Sock key={`${trio.id}-${i}`} design={design} className="pack__sock" />
                  ),
                )}
              </div>

              <h3 className="pack__name">{trio.name}</h3>
              <p className="pack__blurb">{trio.blurb}</p>
              <p className="pack__faces">{designs.map((d) => d.label).join(' · ')}</p>

              <div className="pack__buy">
                <span className="pack__price">{money(trioPrice())}</span>
                {added === trio.id ? (
                  <Link className="btn btn--ghost" to="/bag">
                    In the bag — view
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      designs.forEach(add);
                      setAdded(trio.id);
                    }}
                  >
                    Add all three
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="packs__note">
        Prefer your own three? Design one in the studio and the price drops to {money(PRICE.three)} a pair as
        soon as the third one lands in the bag.
      </p>
    </section>
  );
}
