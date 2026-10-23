/*
 * The shop: a product listing page.
 *
 * Filters live in the URL rather than in component state, so a filtered shelf
 * can be linked, shared, bookmarked and survives the back button — the thing
 * that most separates a storefront from a page with a grid on it.
 */

import { Link, useSearchParams } from 'react-router-dom';
import { Sock } from '../brand/Sock';
import { SockPhoto, sockPhotoAvailable } from '../brand/SockPhoto';
import { templateArtFor } from '../brand/templates';
import { COLORWAYS, money, PRICE } from '../store/catalog';
import { filterProducts, PRODUCTS, productDesign, shelfColorways } from '../store/products';

export function Shop() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const colorwayId = params.get('colour') ?? '';

  const shown = filterProducts(PRODUCTS, { query, colorwayId: colorwayId || undefined });

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="page shop">
      <header className="shop__head">
        <h1 className="page__title">All socks</h1>
        <p className="page__lede">
          {PRODUCTS.length} {PRODUCTS.length === 1 ? 'face' : 'faces'}, ready to go. {money(PRICE.single)} a pair,{' '}
          {money(PRICE.three)} each in
          threes. Every one of them can be pulled around in the studio afterwards.
        </p>
      </header>

      <div className="shop__filters">
        <label className="shop__search">
          <span className="visually-hidden">Search the shelf</span>
          <input
            type="search"
            className="field__input"
            placeholder="Search a mood…"
            value={query}
            onChange={(e) => set('q', e.target.value)}
          />
        </label>

        <div className="shop__colours" role="radiogroup" aria-label="Colourway">
          <button
            type="button"
            role="radio"
            aria-checked={!colorwayId}
            className={`chip chip--sm${!colorwayId ? ' is-on' : ''}`}
            onClick={() => set('colour', '')}
          >
            All
          </button>
          {shelfColorways().map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={colorwayId === c.id}
              className={`chip chip--sm${colorwayId === c.id ? ' is-on' : ''}`}
              onClick={() => set('colour', c.id)}
            >
              <span className="swatch" aria-hidden="true" style={{ background: c.base, borderColor: c.accent }}>
                <span className="swatch__ink" style={{ background: c.ink }} />
              </span>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <p className="shop__count" aria-live="polite">
        {shown.length === PRODUCTS.length
          ? `${shown.length} ${shown.length === 1 ? 'pair' : 'pairs'}`
          : `${shown.length} of ${PRODUCTS.length} pairs`}
      </p>

      {shown.length === 0 ? (
        <p className="shop__empty">
          Nothing matches that. <button type="button" className="btn btn--quiet" onClick={() => setParams({})}>
            Clear the filters
          </button>
        </p>
      ) : (
        <ul className="shop__grid">
          {shown.map((product) => {
            const design = productDesign(product);
            const ink = COLORWAYS.find((c) => c.id === design.colorwayId)?.ink ?? '#191710';
            return (
              <li key={product.id}>
                <Link className="card" to={`/p/${product.id}`}>
                  <span className="card__art">
                    {sockPhotoAvailable(design.colorwayId) ? (
                      <SockPhoto
                        colorwayId={design.colorwayId}
                        face={design.face}
                        ink={ink}
                        finish={design.finish}
                        artUrl={templateArtFor(design)}
                        className="card__sock"
                      />
                    ) : (
                      <Sock design={design} className="card__sock" />
                    )}
                  </span>
                  <span className="card__name">{product.name}</span>
                  <span className="card__blurb">{product.blurb}</span>
                  <span className="card__price">{money(PRICE.single)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
