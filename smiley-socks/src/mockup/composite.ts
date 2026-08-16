/*
 * Putting the print onto a photograph of a real sock.
 *
 * Pasting artwork flat onto a photo always looks pasted: real fabric has folds,
 * and ink on fabric follows them and takes the shadow with it. Two operations
 * do most of the work of fixing that, and neither needs Photoshop:
 *
 *   1. Displacement. The photo's own luminance is a rough height map of the
 *      cloth. Sampling the artwork with an offset along the *gradient* of that
 *      map bends the print into the folds — the same trick a Photoshop
 *      displacement map performs, computed from the photo itself so there is no
 *      second file to keep in sync.
 *
 *   2. Multiply. Compositing the ink with multiply lets the photo's shadows
 *      show through the print, so the artwork sits in the weave rather than on
 *      top of it. Normal blend is offered too, for a rubbery plastisol look.
 *
 * Everything here is plain canvas work: no WebGL, no library, and it runs on
 * whatever photograph the user supplies.
 */

export interface PlaceOptions {
  /** Centre of the print, in photo pixels. */
  x: number;
  y: number;
  /** Print width, in photo pixels. */
  size: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** How far the fold map is allowed to bend the print, in pixels. */
  displace: number;
  opacity: number;
  blend: 'multiply' | 'normal';
}

export const DEFAULT_PLACE: PlaceOptions = {
  x: 0.5,
  y: 0.35,
  size: 0.22,
  rotation: 0,
  displace: 9,
  opacity: 0.92,
  blend: 'multiply',
};

/**
 * Luminance, box-blurred.
 *
 * Blurring matters: raw pixel noise would make the displacement jitter per
 * pixel and shred the artwork. A blur of a few pixels leaves the folds — which
 * are what we actually want to follow — and drops the grain.
 */
export function foldMap(data: ImageData, radius = 5): Float32Array {
  const { width: w, height: h, data: px } = data;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
  }
  if (radius <= 0) return lum;

  // Two separable passes — a box blur twice over is close enough to a Gaussian
  // for a height map, and orders of magnitude cheaper.
  const tmp = new Float32Array(lum.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    for (let a = 0; a < outer; a++) {
      let sum = 0;
      let count = 0;
      for (let b = -radius; b <= radius; b++) {
        const i = Math.min(inner - 1, Math.max(0, b));
        sum += src[horizontal ? a * w + i : i * w + a];
        count++;
      }
      for (let b = 0; b < inner; b++) {
        const idx = horizontal ? a * w + b : b * w + a;
        dst[idx] = sum / count;
        const outIdx = Math.min(inner - 1, Math.max(0, b - radius));
        const inIdx = Math.min(inner - 1, Math.max(0, b + radius + 1));
        sum += src[horizontal ? a * w + inIdx : inIdx * w + a];
        sum -= src[horizontal ? a * w + outIdx : outIdx * w + a];
      }
    }
  };
  pass(lum, tmp, true);
  pass(tmp, lum, false);
  return lum;
}

/** Where the print lands, in pixels, for a given photo size. */
export function printRect(place: PlaceOptions, w: number, h: number) {
  const size = place.size * w;
  return { cx: place.x * w, cy: place.y * h, size };
}

/**
 * Composite `art` (an RGBA canvas of the print, transparent around it) onto
 * `photo`, and return a new canvas. The original photo canvas is not touched,
 * so the caller can re-composite on every slider move.
 */
export function compositeOntoPhoto(
  photo: HTMLCanvasElement,
  art: HTMLCanvasElement,
  place: PlaceOptions,
): HTMLCanvasElement {
  const w = photo.width;
  const h = photo.height;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const pctx = photo.getContext('2d', { willReadFrequently: true });
  if (!octx || !pctx) return out;

  octx.drawImage(photo, 0, 0);

  // Lay the artwork out on its own full-size layer first, so the displacement
  // pass can work in photo coordinates.
  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  const lctx = layer.getContext('2d', { willReadFrequently: true });
  if (!lctx) return out;

  const { cx, cy, size } = printRect(place, w, h);
  const scale = size / art.width;
  lctx.save();
  lctx.translate(cx, cy);
  lctx.rotate((place.rotation * Math.PI) / 180);
  lctx.scale(scale, scale);
  lctx.drawImage(art, -art.width / 2, -art.height / 2);
  lctx.restore();

  if (place.displace > 0.01) {
    const fold = foldMap(pctx.getImageData(0, 0, w, h));
    const src = lctx.getImageData(0, 0, w, h);
    const dst = new ImageData(w, h);

    // Only walk the box the artwork could occupy — the rest is transparent and
    // the whole point is to keep this fast enough to drag a slider against.
    const reach = size * 0.85 + place.displace + 2;
    const x0 = Math.max(1, Math.floor(cx - reach));
    const x1 = Math.min(w - 2, Math.ceil(cx + reach));
    const y0 = Math.max(1, Math.floor(cy - reach));
    const y1 = Math.min(h - 2, Math.ceil(cy + reach));

    /*
     * Normalise the warp against this photo's own contrast.
     *
     * The gradient of a blurred luminance map is small — on a softly lit sock,
     * around 0.002 per pixel. Multiplying that by a slider in "pixels" moved
     * the artwork by a fraction of a pixel, so the control did nothing at all
     * on gentle photographs and would have been violent on harsh ones. Scaling
     * by the strongest slope actually present makes the number mean what the
     * label says: at 12, the deepest fold shifts the print by 12 pixels,
     * whatever the photo.
     */
    let strongest = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        const gx = fold[i + 1] - fold[i - 1];
        const gy = fold[i + w] - fold[i - w];
        strongest = Math.max(strongest, Math.hypot(gx, gy));
      }
    }
    const gain = strongest > 1e-4 ? place.displace / strongest : 0;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        // Gradient of the fold map: which way the cloth is sloping here.
        const gx = fold[i + 1] - fold[i - 1];
        const gy = fold[i + w] - fold[i - w];
        const sx = Math.round(x - gx * gain);
        const sy = Math.round(y - gy * gain);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const s = (sy * w + sx) * 4;
        const d = i * 4;
        dst.data[d] = src.data[s];
        dst.data[d + 1] = src.data[s + 1];
        dst.data[d + 2] = src.data[s + 2];
        dst.data[d + 3] = src.data[s + 3];
      }
    }
    lctx.putImageData(dst, 0, 0);
  }

  octx.globalAlpha = place.opacity;
  octx.globalCompositeOperation = place.blend === 'multiply' ? 'multiply' : 'source-over';
  octx.drawImage(layer, 0, 0);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';

  return out;
}

/** Fit an image into a working canvas, capped so the per-pixel pass stays quick. */
export function toWorkingCanvas(image: HTMLImageElement, maxEdge = 1400): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
