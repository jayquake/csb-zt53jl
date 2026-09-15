/*
 * Three-packs.
 *
 * Socks in this category are sold in threes — Stance's Icon pack is the
 * reference — and the pack price already exists in catalog.ts. The problem was
 * that it only appeared once you had guessed your way to three pairs in the
 * bag. These are the same pricing rules, made visible as a product.
 *
 * A trio is three template ids and three colourways. Everything else about the
 * design (height, size, placement, finish) comes from the defaults, so a pack
 * is a shortcut into the studio's own data model rather than a parallel one.
 */

import { cloneFace } from '../brand/templates';
import { templateById } from '../brand/templates';
import { DEFAULT_DESIGN, type Design } from './design';
import { PRICE } from './catalog';

export interface Trio {
  id: string;
  name: string;
  blurb: string;
  /** Three template ids, in the order they are shown. */
  faces: [string, string, string];
  colorways: [string, string, string];
}

export const TRIOS: Trio[] = [
  {
    id: 'honest-week',
    name: 'The Honest Week',
    blurb: 'Good day, flat day, bad day. Most weeks have all three.',
    // Fuzzy and Heavy have no reference art yet — neither sheet drew them —
    // so the flat/bad days lean on Blank and Numb instead, which land close
    // enough on mood and are real drawings rather than a parametric guess.
    faces: ['sunny', 'blank', 'numb'],
    colorways: ['butter', 'bone', 'midnight'],
  },
  {
    id: 'running-hot',
    name: 'Running Hot',
    blurb: 'For the stretch where everything is due at once.',
    // Same reasoning: Wired, Determined and Drained have no art. Stressed,
    // Annoyed and Wiped are the closest-matching moods that do.
    faces: ['stressed', 'annoyed', 'wiped'],
    colorways: ['clay', 'moss', 'midnight'],
  },
  {
    id: 'soft-landing',
    name: 'Soft Landing',
    blurb: 'The gentle end of the shelf. No notes.',
    faces: ['tender', 'relieved', 'loved'],
    colorways: ['bubblegum', 'bone', 'butter'],
  },
];

/** The three designs a trio adds to the bag. */
export function trioDesigns(trio: Trio): Design[] {
  return trio.faces.map((id, i) => {
    const template = templateById(id);
    return {
      ...DEFAULT_DESIGN,
      templateId: template?.id ?? null,
      label: template?.name ?? 'Custom face',
      face: cloneFace(template?.face ?? DEFAULT_DESIGN.face),
      colorwayId: trio.colorways[i],
    };
  });
}

/**
 * What a trio costs on its own: three pairs at the three-pair rate. Adding one
 * to a bag that already has socks in it only ever makes each pair cheaper,
 * never more expensive, because the bag reprices at six.
 */
export function trioPrice(): number {
  return PRICE.three * 3;
}

export function trioById(id: string): Trio | undefined {
  return TRIOS.find((t) => t.id === id);
}
