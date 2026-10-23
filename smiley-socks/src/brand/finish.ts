/*
 * Shared tuning for the chalk finish.
 *
 * The look has to be built twice — SVG filter primitives for the flat
 * picture and the Studio/Home galleries, `ctx.filter` blur for the canvas
 * path (the 3D texture, and every real-photo composite via SockPhoto) —
 * because SVG filters have no canvas equivalent, so there is no way to
 * share the renderer itself. What *can* be shared, and is the actual
 * source of the two drifting apart, is the numbers: one halo radius, one
 * core radius, one pair of alphas. Both Chalk.tsx and texture.ts read them
 * from here, so tuning the look is one edit in one file, not two files
 * kept in sync by hand.
 *
 * Canvas's `ctx.filter = blur()` and SVG's `feGaussianBlur stdDeviation`
 * both operate in the current (already-scaled) coordinate space, so the
 * same numbers, written once in face-space units, come out proportionally
 * right in both — a 24px thumbnail and the full print use the same
 * constants and still look like the same face.
 */

/** Wide, faint blur under the stroke — the soft outer edge. */
export const CHALK_HALO_BLUR = 3.4;
export const CHALK_HALO_ALPHA = 0.32;

/** Tighter blur, capped short of solid ink — the stroke's visible body. */
export const CHALK_CORE_BLUR = 0.9;
export const CHALK_CORE_ALPHA = 0.8;

/**
 * Fine grain: SVG-only. `ctx.filter` has no noise primitive to match
 * feTurbulence, and the halo/core softness is what actually carries the
 * look on canvas — chasing exact grain parity there isn't worth it.
 */
export const CHALK_GRAIN_FREQUENCY = 0.9;
export const CHALK_GRAIN_ALPHA_TABLE = '0.55 0.85 1 0.92 0.65';
