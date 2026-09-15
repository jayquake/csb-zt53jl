/*
 * The photo path: pick an image, get it onto the sock.
 *
 * The file is downscaled to 512px and re-encoded *before* it becomes part of a
 * design. That is not an optimisation — a bag is stored in localStorage, whose
 * quota is around 5MB, and one modern phone photo as a data URL is bigger than
 * that on its own. Downscaling on the way in is what keeps "add to bag,
 * refresh, still there" true.
 */

import { useRef, useState } from 'react';
import type { Photo } from '../store/design';

const MAX_EDGE = 512;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give us a canvas to resize with.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNG keeps transparency, which matters for logos and cut-outs; everything
  // else is far smaller as a JPEG.
  return file.type === 'image/png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', 0.82);
}

export function ImageDrop({
  photo,
  onChange,
}: {
  photo: Photo | null;
  onChange(next: Photo | null): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('That needs to be an image file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That image is enormous — try one under 20MB.');
      return;
    }
    setBusy(true);
    try {
      const src = await downscaleToDataUrl(file);
      onChange({ src, scale: 1, x: 0, y: 0 });
    } catch {
      setError("This browser couldn't read that image. A JPEG or PNG works best.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo">
      {photo ? (
        <>
          <div className="photo__preview">
            <img src={photo.src} alt="Your artwork, as it will be printed" />
          </div>

          <label className="field">
            <span className="field__label">Size</span>
            <input
              type="range"
              min={0.6}
              max={2.4}
              step={0.02}
              value={photo.scale}
              onChange={(e) => onChange({ ...photo, scale: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Across</span>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={photo.x}
              onChange={(e) => onChange({ ...photo, x: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span className="field__label">Up / down</span>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={photo.y}
              onChange={(e) => onChange({ ...photo, y: Number(e.target.value) })}
            />
          </label>

          <div className="photo__actions">
            <button type="button" className="btn btn--quiet" onClick={() => input.current?.click()}>
              Swap image
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => onChange(null)}>
              Remove, print the face
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="photo__drop" onClick={() => input.current?.click()} disabled={busy}>
          <span className="photo__plus" aria-hidden="true">
            +
          </span>
          <span>{busy ? 'Reading that image…' : 'Add your own image'}</span>
          <span className="photo__meta">It prints in place of the face, in the same spot.</span>
        </button>
      )}

      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          // Let the same file be picked again after a remove.
          e.target.value = '';
        }}
      />

      {error && (
        <p className="photo__error" role="alert">
          {error}
        </p>
      )}
      <p className="photo__note">
        Images stay on your device — they're resized in the browser and never uploaded anywhere.
      </p>
    </div>
  );
}
