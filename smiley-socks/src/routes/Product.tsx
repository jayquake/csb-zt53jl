/*
 * A product page.
 *
 * The variant selectors are the same catalog the studio uses, and the price
 * updates as they change — height and placement genuinely cost different
 * amounts, so a product page that quoted one number would be lying by the time
 * you got to the bag.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sock } from '../brand/Sock';
import { SockPhoto, sockPhotoMatches } from '../brand/SockPhoto';
import { SockThree } from '../three/SockThree';
import { ChoiceRow } from '../components/Controls';
import { useCart } from '../store/cart';
import {
  COLORWAYS,
  DONATION_RATE,
  HEIGHTS,
  money,
  PLACEMENTS,
  PRICE,
  printMm,
  priceOne,
  SIZES,
} from '../store/catalog';
import { pricedFrom, type Design } from '../store/design';
import { productById, productDesign, SPEC } from '../store/products';

export function Product() {
  const { id = '' } = useParams();
  const product = productById(id);
  const navigate = useNavigate();
  const { add } = useCart();

  const [design, setDesign] = useState<Design | null>(() => (product ? productDesign(product) : null));
  const [view, setView] = useState<'flat' | '3d' | 'photo'>(() =>
    product && sockPhotoMatches(productDesign(product)) ? 'photo' : 'flat',
  );
  const [added, setAdded] = useState(false);

  const price = useMemo(() => (design ? priceOne(pricedFrom(design)) : 0), [design]);
  const photoReady = design ? sockPhotoMatches(design) : false;

  // Photo replaces flat rather than sitting next to it — a drawing of the
  // sock has no reason to exist once a real photograph of it does. "Flat"
  // only reappears as a fallback for the variants nobody has photographed
  // yet. The two effects below keep "flat" and "photo" mutually exclusive as
  // the shopper changes height/colourway/placement: drop out of photo the
  // moment it stops being honest, and pick it back up the moment it's
  // available again, without disturbing anyone actively looking at 3D.
  useEffect(() => {
    if (view === 'photo' && !photoReady) setView('flat');
  }, [view, photoReady]);
  useEffect(() => {
    if (view === 'flat' && photoReady) setView('photo');
  }, [view, photoReady]);

  if (!product || !design) {
    return (
      <div className="page page--narrow">
        <h1 className="page__title">We don't have that one</h1>
        <p className="page__lede">That pair isn't on the shelf. It may have been renamed.</p>
        <Link className="btn btn--primary btn--big" to="/shop">
          Back to the shop
        </Link>
      </div>
    );
  }

  const placement = PLACEMENTS.find((p) => p.id === design.placementId) ?? PLACEMENTS[0];
  const colorway = COLORWAYS.find((c) => c.id === design.colorwayId) ?? COLORWAYS[0];
  const height = HEIGHTS.find((h) => h.id === design.heightId) ?? HEIGHTS[1];
  const update = (patch: Partial<Design>) => {
    setDesign((d) => (d ? { ...d, ...patch } : d));
    setAdded(false);
  };

  return (
    <div className="pdp">
      <nav className="pdp__crumbs" aria-label="Breadcrumb">
        <Link to="/shop">All socks</Link> <span aria-hidden="true">/</span> <span>{product.name}</span>
      </nav>

      <div className="pdp__gallery">
        {view === 'photo' && photoReady ? (
          <SockPhoto
            colorwayId={design.colorwayId}
            face={design.face}
            ink={colorway.ink}
            finish={design.finish}
            className="pdp__sock"
          />
        ) : view === 'flat' ? (
          <Sock design={design} className="pdp__sock" />
        ) : (
          <SockThree design={design} />
        )}
        <div className="viewtoggle" role="radiogroup" aria-label="How to view the sock">
          {/* Photo replaces flat wherever it's available — offering both would
              make "flat" look like a deliberate second choice rather than the
              fallback it is for the variants nobody has photographed. */}
          {(photoReady ? (['photo', '3d'] as const) : (['flat', '3d'] as const)).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              className={`viewtoggle__btn${view === v ? ' is-on' : ''}`}
              onClick={() => setView(v)}
            >
              {v === 'flat' ? 'Flat' : v === 'photo' ? 'Photo' : '3D'}
            </button>
          ))}
        </div>
        {photoReady && view === 'photo' && (
          <p className="pdp__phototag">
            The actual sock, photographed — {colorway.name}, {height.name.toLowerCase()}, cuff hit.
          </p>
        )}
      </div>

      <div className="pdp__buy">
        <h1 className="pdp__title">{product.name}</h1>
        <p className="pdp__blurb">{product.blurb}</p>

        <p className="pdp__price">
          <strong>{money(price)}</strong>
          <span className="pdp__pack">or {money(PRICE.three)} each in threes</span>
        </p>
        <p className="pdp__donation">
          {money(Math.round(price * DONATION_RATE * 100) / 100)} of this goes to mental health support
        </p>

        <ChoiceRow
          label="Height"
          options={HEIGHTS.map((h) => ({ id: h.id, name: h.name, blurb: h.blurb }))}
          value={design.heightId}
          onChange={(heightId) => update({ heightId })}
        />
        <ChoiceRow
          label="Size"
          options={SIZES.map((s) => ({ id: s.id, name: s.name, blurb: s.fit }))}
          value={design.sizeId}
          onChange={(sizeId) => update({ sizeId })}
        />
        <ChoiceRow
          label="Colourway"
          options={COLORWAYS}
          value={design.colorwayId}
          onChange={(colorwayId) => update({ colorwayId })}
          columns
          swatch={(o) => {
            const c = COLORWAYS.find((x) => x.id === o.id)!;
            return (
              <span className="swatch" aria-hidden="true" style={{ background: c.base, borderColor: c.accent }}>
                <span className="swatch__ink" style={{ background: c.ink }} />
              </span>
            );
          }}
        />
        <ChoiceRow
          label="Print"
          options={PLACEMENTS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb }))}
          value={design.placementId}
          onChange={(placementId) => update({ placementId })}
          columns
        />

        <div className="pdp__actions">
          {added ? (
            <Link className="btn btn--primary btn--big" to="/bag">
              In the bag — view
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={() => {
                add(design);
                setAdded(true);
              }}
            >
              Add to bag · {money(price)}
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--big"
            onClick={() => navigate(`/studio?start=${product.templateId}`)}
          >
            Change the face
          </button>
        </div>

        <dl className="pdp__spec">
          <div className="pdp__specrow">
            <dt>Print</dt>
            <dd>
              {placement.name}, {printMm(placement)} mm, in {colorway.ink === '#F5F0E4' ? 'off-white' : 'ink'} on{' '}
              {colorway.name}
            </dd>
          </div>
          {SPEC.map(([label, value]) => (
            <div className="pdp__specrow" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <p className="pdp__note">
          Demo spec — nothing has been knitted yet, and no payment is taken at checkout. A real shop would
          carry the mill's own figures here.
        </p>
      </div>
    </div>
  );
}
