/*
 * The real sock, photographed — not drawn.
 *
 * The flat SVG and the 3D mesh are both procedural, and no amount of shading
 * or knit texture on top of geometry makes it read as a photograph. This
 * component sidesteps that: it takes an actual product photo of a blank Fog
 * sock and warps the current face onto it with the same fold-following,
 * multiply-blend compositor the photo mockup tool uses, so the print sits in
 * real fabric and real light instead of a drawing of them.
 *
 * It only applies to the one photograph we actually have — a Fog knee-high,
 * shot flat with a plain cuff-hit print. Claiming this for a colourway or
 * placement nobody has photographed would be a fabricated view, not a real
 * one, so callers gate on `sockPhotoMatches` before offering it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FaceParams } from './face';
import type { Finish } from './face';
import { paintFace } from '../three/texture';
import { compositeOntoPhoto, toWorkingCanvas, type PlaceOptions } from '../mockup/composite';
import sockPhotoUrl from '../assets/sock-photo-fog.png';

const ART = 512;

/** Where the cuff-hit print actually sits on this specific photograph. */
const PLACE: PlaceOptions = {
  x: 0.468,
  y: 0.358,
  size: 0.125,
  rotation: 0,
  displace: 5,
  opacity: 0.94,
  blend: 'multiply',
};

/** The one design this photograph can honestly stand in for. */
export function sockPhotoMatches(design: { colorwayId: string; heightId: string; placementId: string }): boolean {
  return design.colorwayId === 'fog' && design.heightId === 'knee' && design.placementId === 'cuff';
}

export function SockPhoto({
  face,
  ink,
  finish,
  className,
}: {
  face: FaceParams;
  ink: string;
  finish: Finish;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setPhoto(toWorkingCanvas(img));
    };
    img.src = sockPhotoUrl;
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!canvas || !photo) return;
    const out = compositeOntoPhoto(photo, art, PLACE);
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext('2d')?.drawImage(out, 0, 0);
  }, [art, photo]);

  return <canvas ref={canvasRef} className={className} aria-label="Photograph of the real sock" />;
}
