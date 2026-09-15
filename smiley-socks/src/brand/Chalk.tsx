/*
 * The chalk finish — the SVG half of it.
 *
 * Soft charcoal, not a marker: edges blur outward instead of staying crisp,
 * and each stroke reads as a denser core inside a fainter halo — the way a
 * stick of charcoal or an airbrush lays down more pigment where it lingers
 * and less at the edge of the pass. All of it is SVG filter primitives, so
 * it costs no new asset — the same face geometry, softened on the way to
 * the screen.
 *
 *   feGaussianBlur (wide, faint)              → the halo
 *   feGaussianBlur (tight, capped short of black) → the core, merged over the halo
 *   feTurbulence + luminanceToAlpha, applied last → fine speckle in the fill,
 *     kept after the blur so it survives as grain instead of smoothing away
 *
 * The filters live once at the root of the app and every face points at one
 * by id, because a filter per face would mean a hundred noise fields on the
 * home page. Faces pick a variant from their own signature, so a grid of
 * them looks hand-drawn rather than stamped.
 *
 * The tuning numbers themselves live in finish.ts, shared with texture.ts's
 * canvas version of this same look — see that file for why.
 */

import {
  CHALK_CORE_ALPHA,
  CHALK_CORE_BLUR,
  CHALK_GRAIN_ALPHA_TABLE,
  CHALK_GRAIN_FREQUENCY,
  CHALK_HALO_ALPHA,
  CHALK_HALO_BLUR,
} from './finish';

const SEEDS = [7, 23, 41, 58, 76, 91];

export const CHALK_VARIANTS = SEEDS.length;

/** Pick a stable variant for a face, so the same face always looks the same. */
export function chalkVariant(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % CHALK_VARIANTS;
}

export function chalkFilterId(variant: number): string {
  return `chalk-${variant % CHALK_VARIANTS}`;
}

/**
 * Rendered once, near the root. It draws nothing — it only carries the filter
 * definitions every face refers to.
 */
export function ChalkDefs() {
  return (
    <svg className="chalkdefs" aria-hidden="true" focusable="false" width="0" height="0">
      <defs>
        {SEEDS.map((seed, i) => (
          <filter
            key={seed}
            id={chalkFilterId(i)}
            // Room for the blur to spread outside the artwork's own box
            // without clipping the halo.
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            {/* The halo: a wide, faint blur underneath. */}
            <feGaussianBlur in="SourceGraphic" stdDeviation={CHALK_HALO_BLUR} result="halo" />
            <feComponentTransfer in="halo" result="haloFaint">
              <feFuncA type="linear" slope={CHALK_HALO_ALPHA} />
            </feComponentTransfer>

            {/* The core: a light blur, capped short of solid black — charcoal
                grey, not ink. */}
            <feGaussianBlur in="SourceGraphic" stdDeviation={CHALK_CORE_BLUR} result="coreBlur" />
            <feComponentTransfer in="coreBlur" result="core">
              <feFuncA type="linear" slope={CHALK_CORE_ALPHA} />
            </feComponentTransfer>

            <feMerge result="merged">
              <feMergeNode in="haloFaint" />
              <feMergeNode in="core" />
            </feMerge>

            {/* Fine grain, applied after the blur so it survives as visible
                speckle in the fill instead of smoothing away with the edge. */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={CHALK_GRAIN_FREQUENCY}
              numOctaves="2"
              seed={seed}
              result="fineGrain"
            />
            <feColorMatrix in="fineGrain" type="luminanceToAlpha" result="fineGrainAlpha" />
            <feComponentTransfer in="fineGrainAlpha" result="fineGrainMask">
              <feFuncA type="table" tableValues={CHALK_GRAIN_ALPHA_TABLE} />
            </feComponentTransfer>
            <feComposite in="merged" in2="fineGrainMask" operator="in" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
