/*
 * The chalk finish.
 *
 * A hand-drawn chalk line does two things a vector stroke does not: its edge
 * wanders, and its body is patchy where the stick skipped the surface. Both
 * are SVG filter primitives, so we get the look without a single new asset —
 * the same face geometry, roughened on the way to the screen.
 *
 *   feTurbulence + feDisplacementMap  → the wandering edge
 *   feTurbulence + luminanceToAlpha   → the grain that eats into the stroke
 *
 * The filters live once at the root of the app and every face points at one by
 * id, because a filter per face would mean a hundred noise fields on the home
 * page. Faces pick a variant from their own signature, so a grid of them looks
 * hand-drawn rather than stamped.
 */

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
            // Room for the displacement to push strokes outside the artwork's
            // own box without clipping them.
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            {/* The wandering edge. Low frequency: long, lazy waves rather than
                a fuzzy outline. */}
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="4" seed={seed} result="warp" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="warp"
              scale="3.6"
              xChannelSelector="R"
              yChannelSelector="G"
              result="rough"
            />

            {/* The grain. High frequency noise turned into a patchy alpha mask,
                then used to eat into the stroke. */}
            <feTurbulence type="fractalNoise" baseFrequency="0.33" numOctaves="3" seed={seed + 5} result="grain" />
            <feColorMatrix in="grain" type="luminanceToAlpha" result="grainAlpha" />
            <feComponentTransfer in="grainAlpha" result="grainMask">
              {/*
                Biased hard towards solid. luminanceToAlpha on noise averages
                out near 0.5, and multiplying a stroke by that leaves it looking
                eaten rather than chalky — especially at chip size, where the
                grain is large relative to the line. This maps the whole range
                into 0.62–1, so the texture reads as tooth on paper while the
                line stays a line.
              */}
              <feFuncA type="table" tableValues="0.62 0.92 1 1" />
            </feComponentTransfer>
            <feComposite in="rough" in2="grainMask" operator="in" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
