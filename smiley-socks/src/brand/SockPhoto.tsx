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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FaceParams, Finish } from './face';
import { paintFace } from '../three/texture';
import { compositeOntoPhoto, toWorkingCanvas, type PlaceOptions } from '../mockup/composite';
import type { Height } from '../store/catalog';
import fogUrl from '../assets/sock-photo-fog.png';
import boneUrl from '../assets/sock-photo-bone.png';
import butterUrl from '../assets/sock-photo-butter.png';
import oatmealUrl from '../assets/sock-photo-oatmeal.png';
import bubblegumUrl from '../assets/sock-photo-bubblegum.png';
import midnightUrl from '../assets/sock-photo-midnight.png';
import mossUrl from '../assets/sock-photo-moss.png';

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
};

/** The one design each photograph can honestly stand in for. */
export function sockPhotoMatches(design: { colorwayId: string; heightId: string; placementId: string }): boolean {
  const entry = PHOTOS[design.colorwayId];
  return !!entry && entry.height === design.heightId && design.placementId === 'cuff';
}

export function SockPhoto({
  colorwayId,
  face,
  ink,
  finish,
  className,
}: {
  colorwayId: string;
  face: FaceParams;
  ink: string;
  finish: Finish;
  className?: string;
}) {
  const entry = PHOTOS[colorwayId];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setPhoto(toWorkingCanvas(img));
    };
    img.src = entry.url;
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const art = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = ART;
    canvas.height = ART;
    const ctx = canvas.getContext('2d');
    if (ctx) paintFace(ctx, face, ART / 2, ART / 2, ART * 0.86, ART * 0.86, ink, finish);
    return canvas;
  }, [face, ink, finish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo || !entry) return;
    const out = compositeOntoPhoto(photo, art, entry.place);
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d')?.drawImage(out, 0, 0);
  }, [art, photo, entry]);

  if (!entry) return null;

  return <canvas ref={canvasRef} className={className} aria-label="Photograph of the real sock" />;
}
