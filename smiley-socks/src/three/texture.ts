/*
 * The design, painted flat for the 3D sock to wear.
 *
 * The reuse that makes this cheap: the face engine and Grinline both emit SVG
 * path strings, and Canvas2D's Path2D parses exactly that syntax. So the face
 * on the 3D sock is not a re-drawing or a rasterised copy — it is the same
 * geometry, stroked by a different renderer. Change a curve in face.ts and it
 * changes in the SVG proof, on the 3D model, and on the sock in the bag.
 *
 * Layout is UV space: u runs around the sock (0.5 is the outer side of the
 * leg, 0.75 the back and the heel), v runs from the cuff opening to the toe.
 */

import { buildFace, STROKE, type FaceParams } from '../brand/face';
import { layout } from '../brand/grinline';
import { COLORWAYS, HEIGHTS, PLACEMENTS, type Colorway } from '../store/catalog';
import type { Design } from '../store/design';

export interface PaintOptions {
  width: number;
  height: number;
  landmarks: { cuffEnd: number; heel: number; toeStart: number };
  /** Texture pixels per centimetre, around and along. They differ. */
  pxPerCmU: number;
  pxPerCmV: number;
}

/** Where each print sits in UV space, and how big it is on the real sock. */
export interface PrintSpot {
  u: number;
  v: number;
  /** Print diameter in centimetres. */
  cm: number;
}

export function printSpots(design: Design, landmarks: PaintOptions['landmarks']): PrintSpot[] {
  const placement = PLACEMENTS.find((p) => p.id === design.placementId) ?? PLACEMENTS[0];
  const cm = (placement.size * 0.85) / 10;
  // Outer side of the leg, just below the ribbed cuff — the Stance spot.
  const top = landmarks.cuffEnd + 0.035;
  const legRoom = Math.max(0.04, landmarks.heel - 0.12 - top);

  switch (placement.id) {
    case 'cuff':
      return [{ u: 0.5, v: top + 0.02, cm }];
    case 'leg':
      return [{ u: 0.5, v: top + legRoom * 0.42, cm }];
    case 'stacked':
      return [0, 1, 2].map((i) => ({ u: 0.5, v: top + 0.02 + (legRoom * i) / 2.6, cm }));
    case 'allover': {
      const spots: PrintSpot[] = [];
      const stepV = 0.052;
      let row = 0;
      for (let v = landmarks.cuffEnd + 0.02; v < 0.97; v += stepV) {
        for (let u = row % 2 ? 0.1 : 0; u < 1; u += 0.2) spots.push({ u, v, cm });
        row++;
      }
      return spots;
    }
    default:
      return [{ u: 0.5, v: top + 0.02, cm }];
  }
}

function facePaths(face: FaceParams) {
  const g = buildFace(face);
  return { g };
}

/**
 * Draw one face, centred on (x, y), scaled so the art spans `size` pixels.
 * Exported because the photo mockup tool paints the same face onto a
 * photograph — one face renderer, three surfaces (SVG, 3D texture, mockup).
 */
export function paintFace(
  ctx: CanvasRenderingContext2D,
  face: FaceParams,
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
  ink: string,
) {
  const { g } = facePaths(face);
  const SPAN = 160; // the face art spans ~160 of its 200 box, stroke included

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sizeX / SPAN, sizeY / SPAN);
  ctx.rotate((g.tilt * Math.PI) / 180);
  ctx.translate(-100, -100); // face-space centre

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const draw = (prim: (typeof g.rest)[number]) => {
    ctx.globalAlpha = prim.opacity ?? 1;
    if (prim.kind === 'stroke') {
      ctx.lineWidth = prim.w ?? STROKE;
      ctx.stroke(new Path2D(prim.d));
    } else if (prim.kind === 'fill') {
      ctx.fill(new Path2D(prim.d));
    } else {
      ctx.beginPath();
      ctx.ellipse(prim.cx, prim.cy, prim.rx, prim.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  if (g.outline) draw(g.outline);
  for (const [eyes, spin] of [
    [g.eyesLeft, g.eyeRotation.left],
    [g.eyesRight, g.eyeRotation.right],
  ] as const) {
    ctx.save();
    ctx.translate(spin.cx, spin.cy);
    ctx.rotate((spin.deg * Math.PI) / 180);
    ctx.translate(-spin.cx, -spin.cy);
    eyes.forEach(draw);
    ctx.restore();
  }
  g.rest.forEach(draw);
  ctx.restore();
}

/** Grinline, stroked onto the canvas at a given cap height. */
function paintWord(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  capPx: number,
  ink: string,
  tracking = 10,
  align: 'left' | 'centre' = 'left',
) {
  const { paths, width } = layout(text, tracking);
  const s = capPx / 140;
  ctx.save();
  ctx.translate(align === 'centre' ? x - (width * s) / 2 : x, y);
  ctx.scale(s, s);
  ctx.translate(0, -140); // baseline
  ctx.strokeStyle = ink;
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of paths) {
    ctx.save();
    ctx.translate(p.x, 0);
    ctx.stroke(new Path2D(p.d));
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Paint the whole sock texture.
 *
 * Prints are drawn with different pixel sizes across u and v, because the
 * texture is not square on the sock: a circle in texture space would come out
 * an oval on the mesh. The centimetre figures come from the same catalog the
 * flat proof quotes millimetres from.
 */
export function paintSockTexture(ctx: CanvasRenderingContext2D, design: Design, opts: PaintOptions) {
  const { width: W, height: H, landmarks, pxPerCmU, pxPerCmV } = opts;
  const colorway: Colorway = COLORWAYS.find((c) => c.id === design.colorwayId) ?? COLORWAYS[0];
  const height = HEIGHTS.find((h) => h.id === design.heightId) ?? HEIGHTS[1];

  // Body
  ctx.fillStyle = colorway.base;
  ctx.fillRect(0, 0, W, H);

  // Ribbed cuff
  const cuffPx = landmarks.cuffEnd * H;
  ctx.fillStyle = colorway.accent;
  ctx.fillRect(0, 0, W, cuffPx);
  ctx.strokeStyle = colorway.base;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = Math.max(1, W / 320);
  for (let x = 0; x < W; x += W / 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cuffPx);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Heel and toe. The heel is centred on the back of the ankle (u = 0.75),
  // which is where the mesh puts its bulge.
  ctx.fillStyle = colorway.accent;
  ctx.beginPath();
  ctx.ellipse(0.75 * W, landmarks.heel * H, W * 0.3, H * 0.052, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(0, landmarks.toeStart * H, W, H - landmarks.toeStart * H);

  // No brand name on the cuff — see the note in Sock.tsx. The rib above is
  // the only thing the cuff carries.

  // The knit, over every block of colour: a jersey stitch is a row of little
  // Vs, sized here from the sock's real circumference so the stitch gauge is
  // the same on the model as it is on the flat drawing.
  const stitch = Math.max(3, pxPerCmU / 9);
  ctx.strokeStyle = colorway.ink;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = Math.max(0.8, stitch * 0.18);
  ctx.lineCap = 'round';
  for (let y = 0; y < H; y += stitch * 1.2) {
    ctx.beginPath();
    for (let x = 0; x < W; x += stitch) {
      ctx.moveTo(x, y + stitch * 1.2);
      ctx.lineTo(x + stitch / 2, y + stitch * 0.45);
      ctx.lineTo(x + stitch, y + stitch * 1.2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // The print.
  for (const spot of printSpots(design, landmarks)) {
    const x = spot.u * W;
    const y = spot.v * H;
    const sizeX = spot.cm * pxPerCmU;
    const sizeY = spot.cm * pxPerCmV;

    if (design.photo) {
      // Photos are drawn by the caller (they need an <img> that has loaded);
      // the spot list is shared so both paths agree on placement.
      continue;
    }
    paintFace(ctx, design.face, x, y, sizeX, sizeY, colorway.ink);
  }

  // The wearer's own text, down the outer leg under the print.
  if (design.cuffText) {
    const spots = printSpots(design, landmarks);
    const last = spots[spots.length - 1];
    const capPx = Math.min(0.7 * pxPerCmU, (0.42 * W) / Math.max(1, design.cuffText.length));
    paintWord(
      ctx,
      design.cuffText,
      0.5 * W,
      Math.min((last?.v ?? 0.3) * H + capPx * 3.4, landmarks.heel * H - capPx),
      capPx,
      colorway.ink,
      12,
      'centre',
    );
  }

  return { colorway, height };
}
