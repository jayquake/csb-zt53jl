/*
 * A design is everything that makes one pair of socks: the face, the sock it
 * prints on, and the extras. It is the unit the studio edits, the bag stores
 * and (in a real build) the factory would receive.
 */

import { clampFace, type FaceParams, type Finish } from '../brand/face';
import { cloneFace, DEFAULT_TEMPLATE, templateById } from '../brand/templates';
import { COLORWAYS, HEIGHTS, PLACEMENTS, SIZES, type PricedDesign } from './catalog';
import { supports } from '../brand/grinline';

export interface Photo {
  /** A downscaled data URL — see ImageDrop for why it is never the original. */
  src: string;
  scale: number;
  x: number;
  y: number;
}

export interface Design {
  templateId: string | null;
  /** What the wearer called it, or the template it started from. */
  label: string;
  face: FaceParams;
  heightId: string;
  sizeId: string;
  colorwayId: string;
  placementId: string;
  photo: Photo | null;
  cuffText: string;
  /** How the line is printed: chalky and hand-drawn, or a clean vector. */
  finish: Finish;
}

export const CUFF_TEXT_MAX = 10;

export const DEFAULT_DESIGN: Design = {
  templateId: DEFAULT_TEMPLATE.id,
  label: DEFAULT_TEMPLATE.name,
  face: cloneFace(DEFAULT_TEMPLATE.face),
  heightId: 'crew',
  sizeId: 'm',
  colorwayId: 'bone',
  placementId: 'cuff',
  photo: null,
  cuffText: '',
  finish: 'chalk',
};

export function pricedFrom(d: Design): PricedDesign {
  return {
    heightId: (HEIGHTS.find((h) => h.id === d.heightId) ?? HEIGHTS[1]).id,
    placementId: (PLACEMENTS.find((p) => p.id === d.placementId) ?? PLACEMENTS[0]).id,
    hasPhoto: d.photo !== null,
  };
}

/** Cuff text is knitted, not typeset — only characters Grinline can draw. */
export function normaliseCuffText(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((ch) => supports(ch))
    .slice(0, CUFF_TEXT_MAX)
    .join('');
}

/**
 * Rebuild a Design from whatever came out of localStorage.
 *
 * Anything stored can come back edited, truncated or from an older release, so
 * every field is checked against the catalog and every number re-clamped. A
 * bad restore should cost you your customisation, never a crash on load.
 */
export function sanitiseDesign(input: unknown): Design {
  const raw = (input ?? {}) as Partial<Design>;
  const template = raw.templateId ? templateById(raw.templateId) : undefined;
  const face =
    raw.face && typeof raw.face === 'object'
      ? clampFace({ ...cloneFace(DEFAULT_DESIGN.face), ...(raw.face as FaceParams) })
      : cloneFace(template?.face ?? DEFAULT_DESIGN.face);

  const photo =
    raw.photo && typeof raw.photo.src === 'string' && raw.photo.src.startsWith('data:image/')
      ? {
          src: raw.photo.src,
          scale: numberIn(raw.photo.scale, 0.4, 2.6, 1),
          x: numberIn(raw.photo.x, -60, 60, 0),
          y: numberIn(raw.photo.y, -60, 60, 0),
        }
      : null;

  return {
    templateId: template?.id ?? null,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.slice(0, 32) : 'Custom face',
    face,
    heightId: oneOf(raw.heightId, HEIGHTS.map((h) => h.id), DEFAULT_DESIGN.heightId),
    sizeId: oneOf(raw.sizeId, SIZES.map((s) => s.id), DEFAULT_DESIGN.sizeId),
    colorwayId: oneOf(raw.colorwayId, COLORWAYS.map((c) => c.id), DEFAULT_DESIGN.colorwayId),
    placementId: oneOf(raw.placementId, PLACEMENTS.map((p) => p.id), DEFAULT_DESIGN.placementId),
    photo,
    cuffText: normaliseCuffText(typeof raw.cuffText === 'string' ? raw.cuffText : ''),
    finish: raw.finish === 'clean' ? 'clean' : 'chalk',
  };
}

function oneOf(value: unknown, allowed: string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function numberIn(value: unknown, lo: number, hi: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
}

export function cloneDesign(d: Design): Design {
  return { ...d, face: cloneFace(d.face), photo: d.photo ? { ...d.photo } : null };
}
