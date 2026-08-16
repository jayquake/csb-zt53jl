/*
 * The photo mockup tool.
 *
 * This is for the brand's own use — listing photos, ads, a lookbook — rather
 * than for shoppers: drop in a photograph of a real sock and the print is
 * warped into the fabric's folds and multiplied into its shadows.
 *
 * It deliberately ships with no photograph of its own. Every sock photo worth
 * using belongs to somebody: a mockup you licensed, a supplier's image you are
 * permitted to use, or one you shot yourself. The tool works with whichever of
 * those you bring, and the notes on the page say so.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaceSvg } from '../brand/Face';
import { TEMPLATES, templateById } from '../brand/templates';
import { paintFace } from '../three/texture';
import { COLORWAYS } from '../store/catalog';
import {
  compositeOntoPhoto,
  DEFAULT_PLACE,
  toWorkingCanvas,
  type PlaceOptions,
} from '../mockup/composite';

const ART = 512;

export function Mockup() {
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [faceId, setFaceId] = useState(TEMPLATES[0].id);
  const [ink, setInk] = useState('#191710');
  const [place, setPlace] = useState<PlaceOptions>(DEFAULT_PLACE);
  const [busy, setBusy] = useState(false);

  const view = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const face = useMemo(() => templateById(faceId) ?? TEMPLATES[0], [faceId]);

  /** The print on its own transparent canvas, ready to be warped. */
  const art = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = ART;
    canvas.height = ART;
    const ctx = canvas.getContext('2d');
    if (ctx) paintFace(ctx, face.face, ART / 2, ART / 2, ART * 0.86, ART * 0.86, ink);
    return canvas;
  }, [face, ink]);

  const render = useCallback(() => {
    const target = view.current;
    if (!target || !photo) return;
    const out = compositeOntoPhoto(photo, art, place);
    target.width = out.width;
    target.height = out.height;
    target.getContext('2d')?.drawImage(out, 0, 0);
  }, [art, photo, place]);

  useEffect(() => {
    render();
  }, [render]);

  async function accept(f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    setBusy(true);
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      setPhoto(toWorkingCanvas(img));
      setPhotoName(f.name);
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  function download() {
    const target = view.current;
    if (!target) return;
    const link = document.createElement('a');
    link.download = `smiley-socks-${face.id}.png`;
    link.href = target.toDataURL('image/png');
    link.click();
  }

  const slider = (
    label: string,
    key: keyof PlaceOptions,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="field" key={key}>
      <span className="field__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={place[key] as number}
        onChange={(e) => setPlace((p) => ({ ...p, [key]: Number(e.target.value) }))}
      />
    </label>
  );

  return (
    <div className="page mockup">
      <h1 className="page__title">Photo mockup</h1>
      <p className="page__lede">
        Put a face onto a photograph of a real sock. The print is bent into the fabric's folds and multiplied
        into its shadows, so it sits in the weave instead of on top of it.
      </p>

      <div className="mockup__stage">
        <div className="mockup__canvaswrap">
          {photo ? (
            <canvas ref={view} className="mockup__canvas" aria-label="The mockup" />
          ) : (
            <button type="button" className="photo__drop" onClick={() => file.current?.click()} disabled={busy}>
              <span className="photo__plus" aria-hidden="true">
                +
              </span>
              <span>{busy ? 'Reading that photo…' : 'Drop in a sock photo'}</span>
              <span className="photo__meta">JPEG or PNG. It stays on your device.</span>
            </button>
          )}
          <input
            ref={file}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(e) => {
              void accept(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <div className="mockup__controls">
          <div className="choice">
            <div className="choice__head">
              <span className="choice__label">Face</span>
              <span className="choice__blurb">{face.blurb}</span>
            </div>
            <div className="strip__scroll" role="radiogroup" aria-label="Face">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={faceId === t.id}
                  className={`strip__item${faceId === t.id ? ' is-on' : ''}`}
                  onClick={() => setFaceId(t.id)}
                >
                  <FaceSvg face={t.face} className="strip__face" title={t.name} />
                  <span className="strip__name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="choice">
            <div className="choice__head">
              <span className="choice__label">Ink</span>
            </div>
            <div className="choice__row">
              {[
                ['#191710', 'Ink'],
                ['#F5F0E4', 'Off-white'],
                // Named by id, not sliced by position: three more inks for hue
                // variety beyond black/off-white. A positional slice silently
                // points at different colours every time a colorway is added.
                ...(['clay', 'moss', 'bubblegum'] as const)
                  .map((id) => COLORWAYS.find((c) => c.id === id))
                  .filter((c): c is (typeof COLORWAYS)[number] => c !== undefined)
                  .map((c) => [c.ink, c.name] as [string, string]),
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={ink === value}
                  className={`chip chip--sm${ink === value ? ' is-on' : ''}`}
                  onClick={() => setInk(value)}
                >
                  <span className="swatch" aria-hidden="true" style={{ background: value, borderColor: value }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {slider('Across', 'x', 0, 1, 0.005)}
          {slider('Up / down', 'y', 0, 1, 0.005)}
          {slider('Size', 'size', 0.04, 0.7, 0.005)}
          {slider('Rotation', 'rotation', -45, 45, 1)}
          {slider('Follow the folds', 'displace', 0, 30, 0.5)}
          {slider('Opacity', 'opacity', 0.3, 1, 0.02)}

          <div className="choice">
            <div className="choice__head">
              <span className="choice__label">Blend</span>
              <span className="choice__blurb">
                Multiply lets the photo's shadows through — that is what sells it as printed.
              </span>
            </div>
            <div className="choice__row">
              {(['multiply', 'normal'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={place.blend === b}
                  className={`chip chip--sm${place.blend === b ? ' is-on' : ''}`}
                  onClick={() => setPlace((p) => ({ ...p, blend: b }))}
                >
                  {b === 'multiply' ? 'Multiply' : 'Solid'}
                </button>
              ))}
            </div>
          </div>

          <div className="mockup__actions">
            <button type="button" className="btn btn--primary" onClick={download} disabled={!photo}>
              Download PNG
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => file.current?.click()}>
              {photoName ? 'Swap photo' : 'Choose a photo'}
            </button>
          </div>
          {photoName && <p className="panel__note">Using {photoName}</p>}
        </div>
      </div>

      <section className="prose mockup__notes">
        <h2>Where to get the sock</h2>
        <p>
          This tool ships without a photograph on purpose — every sock photo worth using belongs to somebody.
          Three ways to get one you are actually allowed to use:
        </p>
        <ul>
          <li>
            <strong>A print-on-demand supplier.</strong> Printful, Printify and Gelato all make custom socks and
            give you mockups of their own blanks, licensed for your store. This is the only route that also
            gets you a real product and fulfilment. The catch: those socks are <em>printed</em>
            (dye-sublimation, usually all-over), so the small cuff hit this brand is built around is not
            normally on the menu.
          </li>
          <li>
            <strong>A licensed mockup file.</strong> Creative Market, Envato Elements and similar sell
            photographic sock mockups as layered PSDs. Check the licence covers commercial and product use
            before it goes near an ad.
          </li>
          <li>
            <strong>Your own photo.</strong> Buy blank socks, shoot them on a plain background in soft light,
            and use this tool. It costs an afternoon and the rights are unambiguously yours.
          </li>
        </ul>
        <p className="prose__placeholder">
          <strong>Two traps.</strong> A photo of someone else's branded sock cannot be used no matter how
          permissive the licence — the logo is a trademark. And the cuff hit at the size this brand uses is a
          knitted detail: a mill will do it properly, typically with a minimum order in the low hundreds of
          pairs, whereas print-on-demand will render it as ink on the surface.
        </p>
        <p>
          The <Link to="/studio">studio</Link> is still the accurate one for print size — it is drawn to scale.
          This page is for making pictures.
        </p>
      </section>
    </div>
  );
}
