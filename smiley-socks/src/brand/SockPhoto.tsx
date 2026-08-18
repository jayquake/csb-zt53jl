/*
 * The real sock, photographed — not drawn.
 *
 * The flat SVG and the 3D mesh are both procedural, and no amount of shading
 * or knit texture on top of geometry makes it read as a photograph. This
 * component sidesteps that: it takes an actual product photo of a blank
 * sock and warps the current face onto it with the same fold-following,
 * multiply-blend compositor the photo mockup tool uses, so the print sits in
 * real fabric and real light instead of a drawing of them.
 *
 * It only applies to garments someone actually photographed. Each entry in
 * PHOTOS is one real, physical sock — a specific colourway shot at a
 * specific height — with its own placement calibrated to that photograph's
 * pixels (they're separate photo shoots, not recolours of one shot, so a
 * shared placement would drift). Claiming this for a colourway, height or
 * placement nobody has photographed would be a fabricated view, not a real
 * one, so callers gate on `sockPhotoMatches` before offering it.
 */

import { useEffect, useRef, useState } from 'react';
import type { FaceParams, Finish } from './face';
import { paintFace } from '../three/texture';
import { compositeOntoPhoto, foldMap, toWorkingCanvas, type PlaceOptions } from '../mockup/composite';
import type { Height } from '../store/catalog';
import fogUrl from '../assets/sock-photo-fog.png';
import boneUrl from '../assets/sock-photo-bone.png';
import butterUrl from '../assets/sock-photo-butter.png';
import oatmealUrl from '../assets/sock-photo-oatmeal.png';
import bubblegumUrl from '../assets/sock-photo-bubblegum.png';
import midnightUrl from '../assets/sock-photo-midnight.png';
import mossUrl from '../assets/sock-photo-moss.png';
import clayUrl from '../assets/sock-photo-clay.png';

const ART = 512;

interface PhotoEntry {
  url: string;
  /** The one height this specific photograph shows. */
  height: Height['id'];
  /** Where the cuff-hit print sits on this specific photograph. */
  place: PlaceOptions;
}

const PHOTOS: Record<string, PhotoEntry> = {
  fog: {
    url: fogUrl,
    height: 'knee',
    place: { x: 0.468, y: 0.358, size: 0.125, rotation: 0, displace: 5, opacity: 0.94, blend: 'multiply' },
  },
  bone: {
    url: boneUrl,
    height: 'knee',
    place: { x: 0.395, y: 0.315, size: 0.182, rotation: 0, displace: 5, opacity: 0.94, blend: 'multiply' },
  },
  butter: {
    url: butterUrl,
    height: 'knee',
    place: { x: 0.404, y: 0.364, size: 0.167, rotation: 0, displace: 5, opacity: 0.94, blend: 'multiply' },
  },
  oatmeal: {
    url: oatmealUrl,
    height: 'knee',
    place: { x: 0.406, y: 0.315, size: 0.171, rotation: 0, displace: 5, opacity: 0.94, blend: 'multiply' },
  },
  bubblegum: {
    url: bubblegumUrl,
    height: 'crew',
    place: { x: 0.577, y: 0.374, size: 0.164, rotation: 0, displace: 5, opacity: 0.94, blend: 'multiply' },
  },
  midnight: {
    url: midnightUrl,
    height: 'knee',
    // Multiply can only darken. Midnight prints in a light ink on a dark
    // sock (contrast the other way round from the rest of the range), so
    // multiply would blend it straight back into the navy — normal blend is
    // the one that actually shows a light mark on a dark fabric.
    place: { x: 0.427, y: 0.33, size: 0.158, rotation: 0, displace: 5, opacity: 0.94, blend: 'normal' },
  },
  moss: {
    url: mossUrl,
    height: 'knee',
    // Same reason as Midnight: light ink on a dark sock.
    place: { x: 0.468, y: 0.335, size: 0.157, rotation: 0, displace: 5, opacity: 0.94, blend: 'normal' },
  },
  clay: {
    url: clayUrl,
    height: 'knee',
    // Terracotta base is mid-toned, not light — Clay's cream ink (#FBEFE2)
    // multiplied onto it would barely move, the same failure mode as
    // Midnight and Moss, so normal blend again.
    place: { x: 0.401, y: 0.301, size: 0.21, rotation: 0, displace: 5, opacity: 0.94, blend: 'normal' },
  },
};

/** The one design each photograph can honestly stand in for. */
export function sockPhotoMatches(design: {
  colorwayId: string;
  heightId: string;
  placementId: string;
  photo?: unknown;
}): boolean {
  const entry = PHOTOS[design.colorwayId];
  // A customer's own uploaded cuff print (design.photo) is a different image
  // entirely — SockPhoto only knows how to composite the parametric face, so
  // it would silently show the wrong print rather than what they uploaded.
  return !!entry && entry.height === design.heightId && design.placementId === 'cuff' && !design.photo;
}

/**
 * Whether a colourway has a real photo at all, independent of height or
 * placement — for a shop-grid thumbnail, which is a "here's this face for
 * real" preview rather than the exact configuration being sold, so it isn't
 * worth gating on the height/placement a shopper hasn't chosen yet.
 */
export function sockPhotoAvailable(colorwayId: string): boolean {
  return colorwayId in PHOTOS;
}

export function SockPhoto({
  colorwayId,
  face,
  ink,
  finish,
  artUrl,
  className,
}: {
  colorwayId: string;
  face: FaceParams;
  ink: string;
  finish: Finish;
  /** The actual reference-sheet drawing for this design, if one still applies. */
  artUrl?: string;
  className?: string;
}) {
  const entry = PHOTOS[colorwayId];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  // The fold map is a full-image blur of the photo alone — it never depends
  // on the face, so it's computed once per photo load and reused on every
  // recomposite rather than redone on every render. That's what makes this
  // cheap enough to sit under a continuously animating face (the home hero)
  // and not just a one-off static view.
  const [fold, setFold] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = toWorkingCanvas(img);
      setPhoto(canvas);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      setFold(ctx ? foldMap(ctx.getImageData(0, 0, canvas.width, canvas.height)) : null);
    };
    img.src = entry.url;
    return () => {
      cancelled = true;
    };
  }, [entry]);

  // The print art itself: either the reference drawing, loaded and centred,
  // or the parametric face painted fresh. Either way it lands in the same
  // ART x ART canvas so the compositor downstream never has to know which.
  const [art, setArt] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = ART;
    canvas.height = ART;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (artUrl) {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        // Centred, aspect-preserved — it's a real drawing, not a square
        // asset to stretch to fit. The 0.8 factor matters: a parametric
        // face's ink only spans ~160 of its 200-unit box (see SPAN in
        // texture.ts), so paintFace's own effective fill is nowhere near
        // the full ART*0.86 it's scaled to — there's built-in headroom. A
        // tightly-cropped reference drawing has no such margin (its ink
        // reaches close to its own edges), so scaling it to the same 0.86
        // as the parametric box reads oversized and crowds the cuff rib.
        // Matching the same *effective* fill keeps every template the same
        // visual size regardless of which renderer drew it.
        const box = ART * 0.86 * 0.8;
        const scale = Math.min(box / img.width, box / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, ART / 2 - w / 2, ART / 2 - h / 2, w, h);
        setArt(canvas);
      };
      img.src = artUrl;
      return () => {
        cancelled = true;
      };
    }

    paintFace(ctx, face, ART / 2, ART / 2, ART * 0.86, ART * 0.86, ink, finish);
    setArt(canvas);
    return () => {
      cancelled = true;
    };
  }, [face, ink, finish, artUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo || !art || !entry) return;
    const out = compositeOntoPhoto(photo, art, entry.place, fold ?? undefined);
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d')?.drawImage(out, 0, 0);
  }, [art, photo, fold, entry]);

  if (!entry) return null;

  return <canvas ref={canvasRef} className={className} aria-label="Photograph of the real sock" />;
}
