import { describe, expect, it } from 'vitest';
import { layout, measure, SUPPORTED, supports } from '../src/brand/grinline';
import { TEMPLATES } from '../src/brand/templates';

/** Everything the UI ever sets in Grinline rather than in system type. */
const SET_IN_GRINLINE = [
  'SMILEY SOCKS',
  '10%',
  'WEAR HOW',
  'YOU FEEL',
  'THE 10%',
  ...TEMPLATES.map((t) => t.name),
];

describe('Grinline', () => {
  it('has a glyph for every character the site sets in it', () => {
    for (const phrase of SET_IN_GRINLINE) {
      for (const ch of phrase.toUpperCase()) {
        expect(supports(ch), `missing glyph: ${JSON.stringify(ch)} in ${phrase}`).toBe(true);
      }
    }
  });

  it('covers A-Z and 0-9', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(SUPPORTED, ch).toContain(ch);
    }
  });

  it('advances left to right and reports a matching width', () => {
    const { paths, width } = layout('AB');
    expect(paths.length).toBeGreaterThan(1);
    expect(paths[paths.length - 1].x).toBeGreaterThan(0);
    expect(width).toBeGreaterThan(paths[paths.length - 1].x);
  });

  it('is case-insensitive', () => {
    expect(measure('smiley')).toBe(measure('SMILEY'));
  });

  it('grows with tracking and with length', () => {
    expect(measure('AA', 24)).toBeGreaterThan(measure('AA', 0));
    expect(measure('AAA')).toBeGreaterThan(measure('AA'));
    expect(measure('')).toBe(0);
  });

  it('falls back to a question mark instead of dropping unknown characters', () => {
    // Cuff text is filtered before it gets here, but a stray character must
    // still render as something rather than silently vanishing.
    expect(layout('€').paths.length).toBeGreaterThan(0);
  });

  it('keeps the open loop in the round glyphs', () => {
    // O, Q, 0 and 8 carry the brand's signature gap or closed counters by
    // design — O is drawn as a single open arc, so it has exactly one path.
    expect(layout('O').paths.length).toBe(1);
    expect(layout('O').paths[0].d).not.toMatch(/Z/);
  });

  it('emits no NaN in any glyph', () => {
    for (const ch of SUPPORTED) {
      for (const p of layout(ch).paths) {
        expect(p.d, ch).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
