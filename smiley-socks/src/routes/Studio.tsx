/*
 * The studio.
 *
 * Phone layout is the real layout: the sock stays pinned at the top while the
 * controls scroll underneath it, so the thing you are changing is never off
 * screen when you change it. The wide layout is the same two blocks side by
 * side — no second component tree, no desktop-only affordances.
 */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sock } from '../brand/Sock';
import { FaceEditor } from '../editor/FaceEditor';
import { faceSignature, type EyeShape, type Mark } from '../brand/face';
import { cloneFace, DEFAULT_TEMPLATE, templateById } from '../brand/templates';
import { ChoiceRow, SegmentedTabs } from '../components/Controls';
import { TemplateStrip } from '../components/TemplateStrip';
import { ImageDrop } from '../components/ImageDrop';
import {
  COLORWAYS,
  HEIGHTS,
  money,
  PLACEMENTS,
  printMm,
  priceOne,
  SIZES,
} from '../store/catalog';
import { CUFF_TEXT_MAX, DEFAULT_DESIGN, normaliseCuffText, pricedFrom, type Design } from '../store/design';
import { useCart } from '../store/cart';

const TABS = [
  { id: 'face', name: 'Face' },
  { id: 'sock', name: 'Sock' },
  { id: 'photo', name: 'Photo' },
  { id: 'text', name: 'Text' },
];

const EYE_SHAPES: { id: EyeShape; name: string }[] = [
  { id: 'bar', name: 'Bars' },
  { id: 'tick', name: 'Ticks' },
  { id: 'round', name: 'Dots' },
  { id: 'arc', name: 'Arcs' },
  { id: 'line', name: 'Lines' },
  { id: 'cross', name: 'Crosses' },
  { id: 'spiral', name: 'Spirals' },
];

/*
 * Outline presets. `gap` is the one face parameter with no drag handle — there
 * is nothing sensible to grab on a gap — so it gets chips instead. "No
 * outline" is the whole loop opened up: eyes and a mouth, floating, the way
 * anyone actually doodles a face.
 */
const OUTLINES = [
  { id: 'closed', name: 'Closed', blurb: 'A full, unbroken loop.', gap: 0 },
  { id: 'open', name: 'Open loop', blurb: 'The house gap, top right.', gap: 26 },
  { id: 'wide', name: 'Wide open', blurb: 'Barely a frame at all.', gap: 130 },
  { id: 'none', name: 'None', blurb: 'Just the features, floating.', gap: 360 },
];

function outlineIdFor(gap: number): string {
  return OUTLINES.reduce((best, o) =>
    Math.abs(o.gap - gap) < Math.abs(best.gap - gap) ? o : best,
  ).id;
}

const MARKS: { id: Mark; name: string }[] = [
  { id: 'tear', name: 'Tear' },
  { id: 'sweat', name: 'Sweat' },
  { id: 'blush', name: 'Blush' },
  { id: 'static', name: 'Static' },
  { id: 'zzz', name: 'Sleep' },
  { id: 'sparkle', name: 'Sparkle' },
  { id: 'wink', name: 'Wink' },
];

export function Studio() {
  const [params] = useSearchParams();
  const startId = params.get('start');
  const start = (startId && templateById(startId)) || DEFAULT_TEMPLATE;

  const [design, setDesign] = useState<Design>(() => ({
    ...DEFAULT_DESIGN,
    templateId: start.id,
    label: start.name,
    face: cloneFace(start.face),
  }));
  const [tab, setTab] = useState('face');
  const [added, setAdded] = useState(false);
  const { add, count } = useCart();

  const template = design.templateId ? templateById(design.templateId) : undefined;
  const base = template?.face ?? DEFAULT_TEMPLATE.face;
  const edited = useMemo(() => faceSignature(design.face) !== faceSignature(base), [design.face, base]);

  const placement = PLACEMENTS.find((p) => p.id === design.placementId) ?? PLACEMENTS[0];
  const price = priceOne(pricedFrom(design));

  function update(patch: Partial<Design>) {
    setDesign((d) => ({ ...d, ...patch }));
    setAdded(false);
  }

  function pickTemplate(id: string) {
    const t = templateById(id);
    if (!t) return;
    update({ templateId: t.id, label: t.name, face: cloneFace(t.face) });
  }

  return (
    <div className="studio">
      <div className="studio__preview">
        <Sock design={design} className="studio__sock" />
        <p className="studio__scale">
          <strong>{placement.name}</strong> · {printMm(placement)} mm
          {placement.id === 'cuff' && ' — where Stance puts its logo'}
        </p>
      </div>

      <div className="studio__sheet">
        <div className="studio__sheethead">
          <h1 className="studio__title">
            {design.photo ? 'Your image' : design.label}
            {!design.photo && edited && <span className="studio__edited"> · edited</span>}
          </h1>
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} label="What to change" />
        </div>

        {tab === 'face' && (
          <section className="panel" id="panel-face" role="tabpanel" aria-labelledby="tab-face">
            {design.photo && (
              <p className="panel__notice">
                A photo is printing right now, so the face is hidden on the sock. Keep editing — removing the
                photo in the Photo tab brings it straight back.
              </p>
            )}

            <TemplateStrip value={edited ? null : (design.templateId ?? null)} onPick={pickTemplate} />

            <FaceEditor
              face={design.face}
              base={base}
              onChange={(face) => update({ face })}
            />

            <ChoiceRow
              label="Eyes"
              options={EYE_SHAPES}
              value={design.face.eyes.shape}
              onChange={(id) =>
                update({ face: { ...design.face, eyes: { ...design.face.eyes, shape: id as EyeShape } } })
              }
            />

            <ChoiceRow
              label="Outline"
              options={OUTLINES}
              value={outlineIdFor(design.face.gap)}
              onChange={(id) =>
                update({
                  face: { ...design.face, gap: OUTLINES.find((o) => o.id === id)?.gap ?? 26 },
                })
              }
              columns
            />

            <div className="choice">
              <div className="choice__head">
                <span className="choice__label">Extras</span>
                <span className="choice__blurb">Brows can be dragged once they're on.</span>
              </div>
              <div className="choice__row">
                <button
                  type="button"
                  aria-pressed={design.face.brows.on}
                  className={`chip${design.face.brows.on ? ' is-on' : ''}`}
                  onClick={() =>
                    update({ face: { ...design.face, brows: { ...design.face.brows, on: !design.face.brows.on } } })
                  }
                >
                  Brows
                </button>
                {MARKS.map((m) => {
                  const on = design.face.marks.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      className={`chip${on ? ' is-on' : ''}`}
                      onClick={() =>
                        update({
                          face: {
                            ...design.face,
                            marks: on
                              ? design.face.marks.filter((x) => x !== m.id)
                              : [...design.face.marks, m.id],
                          },
                        })
                      }
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {edited && (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => update({ face: cloneFace(base) })}
              >
                Back to {template?.name ?? 'the template'}
              </button>
            )}
          </section>
        )}

        {tab === 'sock' && (
          <section className="panel" id="panel-sock" role="tabpanel" aria-labelledby="tab-sock">
            <ChoiceRow
              label="Colourway"
              options={COLORWAYS}
              value={design.colorwayId}
              onChange={(id) => update({ colorwayId: id })}
              columns
              swatch={(o) => {
                const c = COLORWAYS.find((x) => x.id === o.id)!;
                return (
                  <span
                    className="swatch"
                    aria-hidden="true"
                    style={{ background: c.base, borderColor: c.accent, color: c.ink }}
                  >
                    <span className="swatch__ink" style={{ background: c.ink }} />
                  </span>
                );
              }}
            />
            <ChoiceRow
              label="Height"
              options={HEIGHTS.map((h) => ({ id: h.id, name: h.name, blurb: h.blurb }))}
              value={design.heightId}
              onChange={(id) => update({ heightId: id })}
            />
            <ChoiceRow
              label="Placement"
              options={PLACEMENTS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb }))}
              value={design.placementId}
              onChange={(id) => update({ placementId: id })}
              columns
            />
            <ChoiceRow
              label="Size"
              options={SIZES.map((s) => ({ id: s.id, name: s.name, blurb: s.fit }))}
              value={design.sizeId}
              onChange={(id) => update({ sizeId: id })}
            />
          </section>
        )}

        {tab === 'photo' && (
          <section className="panel" id="panel-photo" role="tabpanel" aria-labelledby="tab-photo">
            <ImageDrop photo={design.photo} onChange={(photo) => update({ photo })} />
          </section>
        )}

        {tab === 'text' && (
          <section className="panel" id="panel-text" role="tabpanel" aria-labelledby="tab-text">
            <label className="field">
              <span className="field__label">Knit a few words down the leg</span>
              <input
                className="field__input"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={CUFF_TEXT_MAX}
                value={design.cuffText}
                placeholder="OK TODAY"
                onChange={(e) => update({ cuffText: normaliseCuffText(e.target.value) })}
              />
            </label>
            <p className="panel__note">
              Up to {CUFF_TEXT_MAX} characters, knitted in Grinline — our own alphabet, the same one the logo is
              drawn in. Letters, numbers and a few marks; anything it can't knit is dropped as you type.
            </p>
          </section>
        )}
      </div>

      <div className="buybar">
        <div className="buybar__price">
          <span className="buybar__amount">{money(price)}</span>
          <span className="buybar__meta">{money(Math.round(price * 10) / 100)} to mental health</span>
        </div>
        {added ? (
          <Link className="btn btn--primary" to="/bag">
            In the bag ({count}) — view
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              add(design);
              setAdded(true);
            }}
          >
            Add to bag
          </button>
        )}
      </div>
    </div>
  );
}
