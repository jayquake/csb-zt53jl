/*
 * The sock.
 *
 * Drawn to scale rather than to taste: the silhouette is a real adult crew in
 * a 380x480 box where one unit ≈ 0.85 mm, and the print sizes come from
 * catalog.ts in those same units. That is what lets the studio claim a 29 mm
 * cuff hit and mean it.
 *
 * Everything is one SVG with a single clip path — cuff band, heel, toe and
 * every print are clipped to the silhouette, so nothing can spill past the
 * edge of the sock no matter how far a photo is dragged.
 */

import { useId } from 'react';
import { FaceGlyph } from './Face';
import { GrinlineGroup } from './Grinline';
import { measure } from './grinline';
import type { FaceParams } from './face';
import {
  ANKLE_Y,
  COLORWAYS,
  CUFF_BAND,
  HEIGHTS,
  LEG,
  PLACEMENTS,
  SOCK_BOX,
  type Colorway,
  type Placement,
} from '../store/catalog';
import type { Design } from '../store/design';

/** Face art spans ~160 units of its 200 box once the stroke is counted. */
const PRINT_SPAN = 160;

export function sockOutline(legTop: number): string {
  return (
    `M${LEG.left},${legTop} ` +
    `L${LEG.left},${ANKLE_Y} ` +
    `C${LEG.left},352 74,368 78,404 ` + // back of the ankle into the heel
    `C82,440 110,452 146,452 ` + // heel
    `L246,452 ` + // sole
    `C286,452 302,434 302,412 ` + // toe
    `C302,390 282,378 246,378 ` +
    `L192,378 ` + // instep
    `C182,352 ${LEG.right},330 ${LEG.right},${ANKLE_Y} ` +
    `L${LEG.right},${legTop} Z`
  );
}

export interface Zone {
  x: number;
  y: number;
  size: number;
}

/**
 * Where the print goes. Zones are clamped to the leg panel that actually
 * exists, so an ankle sock quietly fits fewer stacked hits instead of printing
 * a face onto the heel.
 */
export function printZones(placement: Placement, legTop: number): Zone[] {
  const top = legTop + CUFF_BAND + 8;
  const bottom = ANKLE_Y - 8;
  const { centre } = LEG;

  switch (placement.id) {
    case 'cuff': {
      const y = Math.min(top + placement.size / 2 + 10, bottom - placement.size / 2);
      return [{ x: centre, y, size: placement.size }];
    }
    case 'leg': {
      const y = Math.min(top + placement.size / 2 + 28, bottom - placement.size / 2);
      return [{ x: centre, y, size: placement.size }];
    }
    case 'stacked': {
      const step = placement.size + 20;
      const room = bottom - top;
      const count = Math.max(1, Math.min(3, Math.floor(room / step)));
      const block = (count - 1) * step;
      const first = top + (room - block) / 2;
      return Array.from({ length: count }, (_, i) => ({
        x: centre,
        y: first + i * step,
        size: placement.size,
      }));
    }
    case 'allover': {
      const step = placement.size + 16;
      const zones: Zone[] = [];
      let row = 0;
      for (let y = legTop + 16; y < 452; y += step) {
        const stagger = row % 2 ? step / 2 : 0;
        for (let x = 60 + stagger; x < 316; x += step) {
          zones.push({ x, y, size: placement.size });
        }
        row++;
      }
      return zones;
    }
  }
}

function Print({
  zone,
  face,
  photo,
  clipId,
  index,
}: {
  zone: Zone;
  face: FaceParams;
  photo: Design['photo'];
  clipId: string;
  index: number;
}) {
  if (photo) {
    // The photo is masked to a circular patch the size of the print zone, the
    // way a woven or printed patch actually lands on a sock.
    const r = zone.size / 2;
    const box = zone.size * photo.scale;
    return (
      <>
        <clipPath id={`${clipId}-photo-${index}`}>
          <circle cx={zone.x} cy={zone.y} r={r} />
        </clipPath>
        <g clipPath={`url(#${clipId}-photo-${index})`}>
          <image
            href={photo.src}
            x={zone.x - box / 2 + (photo.x / 100) * r}
            y={zone.y - box / 2 + (photo.y / 100) * r}
            width={box}
            height={box}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
        <circle cx={zone.x} cy={zone.y} r={r} fill="none" stroke="currentColor" strokeWidth={1.6} opacity={0.5} />
      </>
    );
  }

  const scale = zone.size / PRINT_SPAN;
  return (
    <g
      transform={`translate(${zone.x - (PRINT_SPAN * scale) / 2} ${zone.y - (PRINT_SPAN * scale) / 2}) scale(${scale}) translate(-20 -20)`}
    >
      <FaceGlyph face={face} />
    </g>
  );
}

export function Sock({
  design,
  className,
  showBrand = true,
}: {
  design: Design;
  className?: string;
  showBrand?: boolean;
}) {
  // React's useId contains colons, which are legal in an id but awkward inside
  // url(#...) references — strip them rather than debug it later.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clip = `sock-${uid}`;

  const height = HEIGHTS.find((h) => h.id === design.heightId) ?? HEIGHTS[1];
  const colorway: Colorway = COLORWAYS.find((c) => c.id === design.colorwayId) ?? COLORWAYS[0];
  const placement = PLACEMENTS.find((p) => p.id === design.placementId) ?? PLACEMENTS[0];
  const legTop = height.legTop;
  const outline = sockOutline(legTop);
  const zones = printZones(placement, legTop);

  // Custom text sits under the print, above the ankle — the low-on-the-leg
  // spot, and clamped so it never rides down onto the heel.
  const lastZone = zones[zones.length - 1];
  const textY = Math.min((lastZone ? lastZone.y + lastZone.size / 2 : legTop + 90) + 20, ANKLE_Y - 4);
  const cuffTextScale = design.cuffText
    ? Math.min(9, (76 / measure(design.cuffText, 12)) * 140) / 140
    : 0;

  const brandScale = 6.5 / 140;
  const brandWidth = measure('SMILEY SOCKS', 10) * brandScale;

  return (
    <svg
      className={['sock', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${SOCK_BOX.w} ${SOCK_BOX.h}`}
      role="img"
      aria-label={`${height.name} sock in ${colorway.name}, ${placement.name.toLowerCase()} print`}
      focusable="false"
    >
      <defs>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>

      {/* Body */}
      <path d={outline} fill={colorway.base} />

      <g clipPath={`url(#${clip})`}>
        {/* Heel and toe blocks, in the accent — curved edges come from the
            ellipses themselves, so no seam line ever looks ruled. */}
        <ellipse cx={104} cy={414} rx={54} ry={56} fill={colorway.accent} />
        <ellipse cx={302} cy={414} rx={64} ry={46} fill={colorway.accent} />

        {/* Ribbed cuff */}
        <rect x={LEG.left} y={legTop} width={LEG.right - LEG.left} height={CUFF_BAND} fill={colorway.accent} />
        <g stroke={colorway.base} strokeWidth={1.6} opacity={0.45}>
          {Array.from({ length: 13 }, (_, i) => LEG.left + 4 + i * 8).map((x) => (
            <line key={x} x1={x} y1={legTop + 2} x2={x} y2={legTop + CUFF_BAND - 2} />
          ))}
        </g>

        {/* Knit shading down the back of the leg and under the arch. */}
        <path d={outline} fill="none" stroke={colorway.ink} strokeWidth={10} opacity={0.07} />

        {/* The print */}
        <g style={{ color: colorway.ink }}>
          {zones.map((zone, i) => (
            <Print key={`${zone.x}-${zone.y}`} zone={zone} face={design.face} photo={design.photo} clipId={clip} index={i} />
          ))}
        </g>

        {/* Brand hit on the cuff: the wordmark left, the 10% right. Small on
            purpose — the face is the product, this is just the label. */}
        {showBrand && (
          <g style={{ color: colorway.ink }} opacity={0.85}>
            <GrinlineGroup
              text="SMILEY SOCKS"
              weight={13}
              tracking={10}
              transform={`translate(${LEG.left + 8} ${legTop + 16}) scale(${brandScale}) translate(0 -8)`}
            />
            <GrinlineGroup
              text="10%"
              weight={15}
              tracking={10}
              transform={`translate(${LEG.left + 8 + brandWidth + 8} ${legTop + 16}) scale(${brandScale}) translate(0 -8)`}
            />
          </g>
        )}

        {/* The wearer's own cuff text */}
        {design.cuffText && (
          <g style={{ color: colorway.ink }}>
            <GrinlineGroup
            text={design.cuffText}
            weight={16}
            tracking={12}
              transform={`translate(${LEG.centre - (measure(design.cuffText, 12) * cuffTextScale) / 2} ${textY}) scale(${cuffTextScale}) translate(0 -140)`}
            />
          </g>
        )}
      </g>

      {/* Edge last, so it sits over every block of colour. */}
      <path d={outline} fill="none" stroke={colorway.ink} strokeWidth={2.5} opacity={0.55} />
      <line
        x1={LEG.left}
        y1={legTop + CUFF_BAND}
        x2={LEG.right}
        y2={legTop + CUFF_BAND}
        stroke={colorway.ink}
        strokeWidth={1.6}
        opacity={0.3}
      />
    </svg>
  );
}
