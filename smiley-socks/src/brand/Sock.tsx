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
import { templateArtFor } from './templates';
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
  artUrl,
  clipId,
  index,
  finish,
}: {
  zone: Zone;
  face: FaceParams;
  photo: Design['photo'];
  /** The actual reference-sheet drawing for this design, if one still applies. */
  artUrl?: string;
  clipId: string;
  index: number;
  finish: Design['finish'];
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

  if (artUrl) {
    // The reference drawing, centred in the same footprint the parametric
    // face fills — aspect-preserved, since it's a real drawing, not a square
    // asset to be stretched to fit. The 0.8 factor matches paintFace's own
    // effective ink fill (its 200-unit box only draws ~160 units of it) —
    // see the identical note in SockPhoto.tsx.
    const box = zone.size * 0.92 * 0.8;
    return (
      <image
        href={artUrl}
        x={zone.x - box / 2}
        y={zone.y - box / 2}
        width={box}
        height={box}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  const scale = zone.size / PRINT_SPAN;
  return (
    <g
      transform={`translate(${zone.x - (PRINT_SPAN * scale) / 2} ${zone.y - (PRINT_SPAN * scale) / 2}) scale(${scale}) translate(-20 -20)`}
    >
      <FaceGlyph face={face} finish={finish} variantKey={`${clipId}-${index}`} />
    </g>
  );
}

export function Sock({ design, className }: { design: Design; className?: string }) {
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

  // Ids have to be unique per instance: several socks share a page and an
  // id collision would have them all sampling the first one's fills.
  const knit = `knit-${uid}`;
  const rib = `rib-${uid}`;
  const legShade = `legshade-${uid}`;
  const footShade = `footshade-${uid}`;

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

        {/* Knit. A jersey stitch is a row of little Vs, and at this scale one
            stitch is about 5 units across — small enough to read as fabric
            rather than as a pattern. */}
        <pattern id={knit} width={5} height={6} patternUnits="userSpaceOnUse">
          <path
            d="M0.6,6 L2.5,2.7 L4.4,6"
            fill="none"
            stroke={colorway.ink}
            strokeOpacity={0.16}
            strokeWidth={0.9}
            strokeLinecap="round"
          />
        </pattern>

        {/* Rib: the cuff is knitted in columns, so it catches light in stripes
            rather than lying flat. */}
        <pattern id={rib} width={9} height={6} patternUnits="userSpaceOnUse">
          <rect x={0} y={0} width={4.5} height={6} fill={colorway.ink} opacity={0.13} />
          <rect x={4.5} y={0} width={4.5} height={6} fill="#ffffff" opacity={0.07} />
        </pattern>

        {/* Roundness. A sock is a tube: the sides fall away from the light and
            the sole sits in shadow. Two gradients do most of the work of
            making a flat drawing look like an object. */}
        <linearGradient id={legShade} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colorway.ink} stopOpacity={0.24} />
          <stop offset="20%" stopColor={colorway.ink} stopOpacity={0.04} />
          <stop offset="42%" stopColor="#ffffff" stopOpacity={0.12} />
          <stop offset="72%" stopColor={colorway.ink} stopOpacity={0.05} />
          <stop offset="100%" stopColor={colorway.ink} stopOpacity={0.26} />
        </linearGradient>
        <linearGradient id={footShade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorway.ink} stopOpacity={0.16} />
          <stop offset="34%" stopColor="#ffffff" stopOpacity={0.1} />
          <stop offset="100%" stopColor={colorway.ink} stopOpacity={0.24} />
        </linearGradient>
      </defs>

      {/* Body */}
      <path d={outline} fill={colorway.base} />

      <g clipPath={`url(#${clip})`}>
        {/* Heel and toe, in the accent. Real socks reinforce both, and the
            curved edge comes from the shape itself so no seam looks ruled. */}
        <ellipse cx={104} cy={414} rx={54} ry={56} fill={colorway.accent} />
        <ellipse cx={302} cy={414} rx={64} ry={46} fill={colorway.accent} />

        {/* Ribbed cuff, knitted in columns. */}
        <rect x={LEG.left} y={legTop} width={LEG.right - LEG.left} height={CUFF_BAND} fill={colorway.accent} />
        <rect x={LEG.left} y={legTop} width={LEG.right - LEG.left} height={CUFF_BAND} fill={`url(#${rib})`} />

        {/* The stitch, over every block of colour so the whole sock is one
            fabric rather than flat panels with a texture on top of some. */}
        <rect x={0} y={0} width={SOCK_BOX.w} height={SOCK_BOX.h} fill={`url(#${knit})`} />

        {/* Form. */}
        <rect x={LEG.left - 8} y={legTop} width={LEG.right - LEG.left + 16} height={ANKLE_Y + 70 - legTop} fill={`url(#${legShade})`} />
        <rect x={40} y={330} width={300} height={140} fill={`url(#${footShade})`} />

        {/* Stitched seams where the reinforced panels meet the body, and the
            toe closure every knitted sock has. */}
        <g fill="none" stroke={colorway.ink} strokeOpacity={0.2} strokeWidth={1.4} strokeDasharray="3 4">
          <ellipse cx={104} cy={414} rx={54} ry={56} />
          <ellipse cx={302} cy={414} rx={64} ry={46} />
          <path d="M292,372 C300,392 300,436 292,456" />
        </g>

        {/* The print */}
        <g style={{ color: colorway.ink }}>
          {zones.map((zone, i) => (
            <Print
              key={`${zone.x}-${zone.y}`}
              zone={zone}
              face={design.face}
              photo={design.photo}
              artUrl={templateArtFor(design)}
              clipId={clip}
              index={i}
              finish={design.finish}
            />
          ))}
        </g>

        {/*
          No brand name knitted on the cuff. Real socks in this category carry
          a small woven mark at most, and printing "SMILEY SOCKS 10%" across
          the rib made the product look like a sample. The face is the brand;
          the 10% belongs on the site, not on the leg.
        */}

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
