/*
 * Reference art only stands in for a design whose face still matches the
 * template it came from — the moment someone drags a handle away from it,
 * the drawing stops being a picture of what's actually on the sock.
 */

import { describe, expect, it } from 'vitest';
import { cloneFace, templateArtFor, templateById, TEMPLATES, TEMPLATES_WITH_ART } from '../src/brand/templates';

describe('templateArtFor', () => {
  it('returns the art for a design whose face still matches its template exactly', () => {
    const template = templateById('starstruck')!;
    expect(templateArtFor({ templateId: 'starstruck', face: cloneFace(template.face) })).toBe(template.artUrl);
  });

  it('falls through once the face has been edited away from the template', () => {
    const template = templateById('starstruck')!;
    const edited = cloneFace(template.face);
    edited.mouth.curve = -1;
    expect(templateArtFor({ templateId: 'starstruck', face: edited })).toBeUndefined();
  });

  it('has nothing to fall back to when there is no template at all', () => {
    const template = templateById('starstruck')!;
    expect(templateArtFor({ templateId: null, face: cloneFace(template.face) })).toBeUndefined();
  });

  it('returns undefined for a template that carries no reference art', () => {
    const template = TEMPLATES.find((t) => !t.artUrl);
    expect(template, 'expected at least one template without art for this test to mean anything').toBeDefined();
    expect(templateArtFor({ templateId: template!.id, face: cloneFace(template!.face) })).toBeUndefined();
  });
});

describe('TEMPLATES_WITH_ART', () => {
  it('is exactly the subset of TEMPLATES that carries real reference art', () => {
    expect(TEMPLATES_WITH_ART.length).toBeGreaterThan(0);
    expect(TEMPLATES_WITH_ART.every((t) => !!t.artUrl)).toBe(true);
    expect(TEMPLATES_WITH_ART.length).toBeLessThanOrEqual(TEMPLATES.length);
    for (const t of TEMPLATES_WITH_ART) expect(TEMPLATES.some((full) => full.id === t.id)).toBe(true);
  });
});
