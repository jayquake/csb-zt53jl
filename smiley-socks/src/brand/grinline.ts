/*
 * Grinline — the Smiley Socks display face.
 *
 * A house-drawn geometric alphabet. Every glyph is a single-weight mono-line
 * stroke on a 140-unit cap height with round caps and joins, so it prints the
 * same way it renders: one continuous line, exactly like the faces.
 *
 * Signature: round shapes (O, Q, 0, 8) carry the "open loop" — a gap in the
 * top-right of the counter, the same gap the faces have. Feelings aren't
 * closed shapes, and neither are the letters.
 *
 * These are stroke paths, not filled outlines, so the face is *drawn* rather
 * than installed: no font file to load, no webfont request, no fallback that
 * could ever render instead. The wordmark on the sock cuff is the same
 * geometry as the wordmark in the header.
 */

const CAP = 140; // baseline at y=140, cap line at y=8
const ASC = 8;

/** [advance width, ...stroke paths] */
type Glyph = [number, ...string[]];

const GLYPHS: Record<string, Glyph> = {
  A: [104, 'M10,140 L52,8 L94,140', 'M27,96 L77,96'],
  B: [98, 'M18,8 L18,140', 'M18,8 L54,8 A33,33 0 0 1 54,74 L18,74', 'M18,74 L58,74 A33,33 0 0 1 58,140 L18,140'],
  C: [100, 'M81,32 A40,66 0 1 0 81,116'],
  D: [102, 'M18,8 L18,140', 'M18,8 L44,8 A44,66 0 0 1 44,140 L18,140'],
  E: [88, 'M78,8 L18,8 L18,140 L78,140', 'M18,74 L68,74'],
  F: [84, 'M80,8 L18,8 L18,140', 'M18,74 L66,74'],
  G: [106, 'M83,32 A40,66 0 1 0 83,112 L83,84 L56,84'],
  H: [102, 'M18,8 L18,140', 'M84,8 L84,140', 'M18,74 L84,74'],
  I: [44, 'M22,8 L22,140'],
  J: [86, 'M68,8 L68,106 A29,32 0 0 1 10,106'],
  K: [98, 'M18,8 L18,140', 'M86,8 L18,80', 'M44,60 L88,140'],
  L: [84, 'M18,8 L18,140 L78,140'],
  M: [124, 'M16,140 L16,8 L62,88 L108,8 L108,140'],
  N: [110, 'M18,140 L18,8 L92,140 L92,8'],
  O: [110, 'M74,16 A42,66 0 1 0 92,44'],
  P: [96, 'M18,8 L18,140', 'M18,8 L50,8 A37,37 0 0 1 50,82 L18,82'],
  Q: [112, 'M54,8 A42,66 0 1 0 54,140 A42,66 0 1 0 54,8', 'M68,102 L98,142'],
  R: [100, 'M18,8 L18,140', 'M18,8 L50,8 A37,37 0 0 1 50,82 L18,82', 'M54,82 L90,140'],
  S: [94, 'M82,32 C82,12 62,6 48,6 C28,6 14,20 14,40 C14,62 40,70 52,75 C70,81 84,91 84,109 C84,129 66,142 46,142 C30,142 16,133 12,116'],
  T: [96, 'M8,8 L88,8', 'M48,8 L48,140'],
  U: [106, 'M16,8 L16,98 A36,44 0 0 0 88,98 L88,8'],
  V: [104, 'M12,8 L52,140 L92,8'],
  W: [144, 'M12,8 L42,140 L72,36 L102,140 L132,8'],
  X: [100, 'M16,8 L84,140', 'M84,8 L16,140'],
  Y: [100, 'M14,8 L50,74 L86,8', 'M50,74 L50,140'],
  Z: [96, 'M14,8 L84,8 L14,140 L84,140'],

  0: [102, 'M51,8 A38,66 0 1 0 51,140 A38,66 0 1 0 51,8'],
  1: [62, 'M12,38 L38,8 L38,140'],
  2: [96, 'M14,40 A34,34 0 1 1 82,46 C82,72 22,102 14,140 L84,140'],
  3: [96, 'M16,34 C20,14 36,6 50,6 C70,6 84,18 84,38 C84,58 66,72 48,72 C68,72 88,86 88,108 C88,128 70,142 50,142 C32,142 18,132 14,114'],
  4: [102, 'M66,140 L66,8 L10,100 L92,100'],
  5: [94, 'M80,8 L26,8 L20,64 C34,56 44,54 54,54 C76,54 88,72 88,97 C88,122 70,142 46,142 C30,142 18,134 12,122'],
  6: [98, 'M76,22 C68,11 58,6 48,6 C26,6 14,32 14,78 C14,112 30,142 52,142 C72,142 86,126 86,104 C86,82 70,68 50,68 C32,68 18,80 14,96'],
  7: [92, 'M10,8 L82,8 L38,140'],
  8: [100, 'M50,6 A30,32 0 1 0 50,70 A30,32 0 1 0 50,6', 'M50,70 A37,36 0 1 0 50,142 A37,36 0 1 0 50,70'],
  9: [98, 'M22,126 C30,137 40,142 50,142 C72,142 84,116 84,70 C84,36 68,6 46,6 C26,6 12,22 12,44 C12,66 28,80 48,80 C66,80 80,68 84,52'],

  '%': [118, 'M24,10 A17,17 0 1 0 24,44 A17,17 0 1 0 24,10', 'M94,104 A17,17 0 1 0 94,138 A17,17 0 1 0 94,104', 'M96,12 L22,136'],
  '!': [40, 'M20,8 L20,100', 'M20,133 L20,134'],
  '?': [88, 'M14,38 A31,31 0 1 1 46,74 L46,98', 'M46,133 L46,134'],
  '.': [40, 'M20,133 L20,134'],
  ',': [42, 'M24,128 L14,152'],
  "'": [36, 'M18,8 L18,44'],
  '-': [70, 'M14,78 L56,78'],
  '+': [84, 'M42,42 L42,110', 'M8,76 L76,76'],
  '/': [64, 'M50,8 L14,140'],
  '&': [112, 'M96,140 L36,20 A22,22 0 1 1 20,54 C20,76 92,86 92,116 A26,26 0 0 1 42,124'],
  ':': [40, 'M20,60 L20,61', 'M20,116 L20,117'],
  ' ': [54],
};

export const SUPPORTED: string[] = Object.keys(GLYPHS);

export interface PlacedGlyph {
  d: string;
  x: number;
}

export interface Layout {
  paths: PlacedGlyph[];
  width: number;
  height: number;
  /** y of the cap line, so callers can align a box to the letterforms. */
  top: number;
}

/**
 * Lay a string out in Grinline. Coordinates are in glyph space (cap height
 * 140); callers scale by viewBox rather than by font-size.
 */
export function layout(text: string, tracking = 12): Layout {
  const paths: PlacedGlyph[] = [];
  let x = 0;
  for (const ch of String(text).toUpperCase()) {
    const glyph: Glyph = GLYPHS[ch] ?? GLYPHS['?'];
    const [advance, ...strokes] = glyph;
    for (const d of strokes) paths.push({ d, x });
    x += advance + tracking;
  }
  return { paths, width: Math.max(0, x - tracking), height: CAP + ASC, top: ASC };
}

/** Width in glyph units — used to fit type into a fixed box (the sock cuff). */
export function measure(text: string, tracking = 12): number {
  return layout(text, tracking).width;
}

/** Every character Grinline can draw; anything else falls back to "?". */
export function supports(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS;
}
