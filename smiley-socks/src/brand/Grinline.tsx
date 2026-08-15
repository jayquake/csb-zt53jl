/*
 * Grinline as React. Text set in the house display face is an <svg>, not a
 * styled <span> — which is why headline type is always accompanied by a real
 * aria-label and why body copy stays in system type where it belongs.
 */

import { layout } from './grinline';
import { FaceGlyph } from './Face';
import type { FaceParams } from './face';
import { TEMPLATES } from './templates';

export function Grinline({
  children,
  weight = 16,
  tracking = 12,
  className,
  label,
  decorative = false,
}: {
  children: string;
  weight?: number;
  tracking?: number;
  className?: string;
  label?: string;
  /** Set when the same words are already in the accessible name nearby. */
  decorative?: boolean;
}) {
  const { paths, width, height, top } = layout(children, tracking);
  const pad = weight / 2 + 2;
  return (
    <svg
      className={['grinline', className].filter(Boolean).join(' ')}
      viewBox={`${-pad} ${top - pad} ${width + pad * 2} ${height - top + pad * 2}`}
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : (label ?? children)}
      aria-hidden={decorative || undefined}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((p, i) => (
        <path key={`${p.d}-${i}`} d={p.d} transform={`translate(${p.x} 0)`} />
      ))}
    </svg>
  );
}

/** Grinline inside another SVG — the sock cuff print. */
export function GrinlineGroup({
  text,
  weight = 16,
  tracking = 12,
  transform,
}: {
  text: string;
  weight?: number;
  tracking?: number;
  transform?: string;
}) {
  const { paths } = layout(text, tracking);
  return (
    <g
      transform={transform}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((p, i) => (
        <path key={`${p.d}-${i}`} d={p.d} transform={`translate(${p.x} 0)`} />
      ))}
    </g>
  );
}

/*
 * The one face that keeps its outline.
 *
 * Faces are outline-less by default, which is right for a print and for the
 * mood shelf — but the logo is a mark, not a mood, and at 26px in the header a
 * bare face is two dots and a hairline. The loop gives it something to hold on
 * to at the size it is actually used.
 */
const MARK_FACE: FaceParams = {
  ...TEMPLATES.find((t) => t.id === 'steady')!.face,
  gap: 26,
};

/** The logo: the mark, then the name. */
export function Wordmark({
  face = MARK_FACE,
  compact = false,
}: {
  face?: FaceParams;
  compact?: boolean;
}) {
  return (
    <span className="wordmark" aria-label="Smiley Socks">
      <svg className="wordmark__mark" viewBox="-12 -12 224 224" role="presentation" focusable="false">
        <FaceGlyph face={face} />
      </svg>
      {!compact && (
        <span className="wordmark__type" aria-hidden="true">
          <Grinline weight={17} tracking={9} label="Smiley Socks">
            SMILEY SOCKS
          </Grinline>
        </span>
      )}
    </span>
  );
}
