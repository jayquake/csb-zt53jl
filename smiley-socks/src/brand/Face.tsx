/*
 * Face renderer. Turns primitives into SVG and nothing else — every decision
 * about what the face looks like lives in face.ts.
 */

import { buildFace, FACE_BOX, STROKE, type FaceParams, type Prim } from './face';

function Primitive({ prim }: { prim: Prim }) {
  switch (prim.kind) {
    case 'stroke':
      return (
        <path
          d={prim.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={prim.w ?? STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={prim.opacity}
        />
      );
    case 'fill':
      return <path d={prim.d} fill="currentColor" stroke="none" opacity={prim.opacity} />;
    case 'dot':
      return (
        <ellipse
          cx={prim.cx}
          cy={prim.cy}
          rx={prim.rx}
          ry={prim.ry}
          fill="currentColor"
          opacity={prim.opacity}
        />
      );
  }
}

/**
 * The face as a bare <g>, for dropping into a bigger SVG (the sock).
 * Colour comes from `currentColor`, so the sock decides the ink.
 */
export function FaceGlyph({ face }: { face: FaceParams }) {
  const g = buildFace(face);
  return (
    <g transform={`rotate(${g.tilt} 100 100)`}>
      {g.outline && <Primitive prim={g.outline} />}
      <g transform={g.eyeRotation.left}>
        {g.eyesLeft.map((p) => (
          <Primitive key={p.key} prim={p} />
        ))}
      </g>
      <g transform={g.eyeRotation.right}>
        {g.eyesRight.map((p) => (
          <Primitive key={p.key} prim={p} />
        ))}
      </g>
      {g.rest.map((p) => (
        <Primitive key={p.key} prim={p} />
      ))}
    </g>
  );
}

/** Standalone face, for template chips and anywhere a face stands alone. */
export function FaceSvg({
  face,
  title,
  className,
  padding = 14,
}: {
  face: FaceParams;
  title?: string;
  className?: string;
  padding?: number;
}) {
  const box = FACE_BOX;
  return (
    <svg
      className={className}
      viewBox={`${-padding} ${-padding} ${box + padding * 2} ${box + padding * 2}`}
      role="img"
      aria-label={title ?? 'A Smiley Socks face'}
      focusable="false"
    >
      <FaceGlyph face={face} />
    </svg>
  );
}
