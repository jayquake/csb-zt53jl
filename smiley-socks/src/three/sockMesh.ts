/*
 * The sock, as a mesh.
 *
 * Deliberately free of any three.js import: this module is arithmetic in and
 * float arrays out, so the shape can be unit-tested in Node and three only
 * ever has to wrap the result in a BufferGeometry. It also means the (large)
 * 3D library stays lazily loaded while the geometry itself costs nothing.
 *
 * The sock is a tube swept along a centreline that starts vertical at the cuff,
 * bends through the ankle and runs forward to the toe. Three things stop that
 * reading as a bent pipe:
 *
 *   - the cross-section is an ellipse, not a circle, and its flattening
 *     rotates from front-to-back on the leg to top-to-bottom on the foot;
 *   - the heel is a one-sided bulge, aimed backwards, fading in and out;
 *   - the toe closes with a rounded taper rather than stopping flat.
 *
 * Units are centimetres, roughly a men's UK 9, so the print sizes in
 * catalog.ts (which are in millimetres) map onto it directly.
 */

export interface SockMeshOptions {
  /** Height of the cuff opening above the sole. Crew ≈ 20, ankle ≈ 9, knee ≈ 38. */
  legLength: number;
  /** Rings around the tube. */
  around?: number;
  /** Rings along the centreline. */
  along?: number;
}

export interface MeshArrays {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** v of the cuff band's lower edge, the heel centre, and the toe start. */
  landmarks: { cuffEnd: number; heel: number; toeStart: number };
  /** Centreline length and leg circumference, in cm — the texture's scale. */
  metrics: { lengthCm: number; circumferenceCm: number };
}

type Vec3 = [number, number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, 1] : scale(a, 1 / l);
};

/** Centripetal Catmull-Rom through the control points. */
function spline(points: Vec3[], t: number): Vec3 {
  const n = points.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];

  const f2 = f * f;
  const f3 = f2 * f;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * f +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
  }
  return out;
}

/**
 * The centreline: down the leg, round the ankle, out to the toe.
 * The cuff sits at +y, the toe points at +z.
 */
function centreline(legLength: number): Vec3[] {
  const ankle = 4.2;
  return [
    [0, legLength, -0.2],
    [0, legLength * 0.72, -0.1],
    [0, legLength * 0.4, 0],
    [0, ankle + 1.6, 0.5],
    [0, ankle - 0.4, 2.2],
    [0, 3.1, 4.4],
    [0, 2.9, 8],
    [0, 2.9, 12],
    [0, 3.0, 16],
    [0, 3.2, 19.2],
    [0, 3.3, 21],
  ];
}

/**
 * Rotation-minimising frames (double reflection).
 *
 * Frenet frames spin wildly wherever the curve is straight — which is most of
 * a sock — and that twist would drag the print around the leg. This carries a
 * stable reference vector along the curve instead.
 */
function frames(points: Vec3[], tangents: Vec3[]): { normal: Vec3[]; binormal: Vec3[] } {
  const normal: Vec3[] = [];
  const binormal: Vec3[] = [];

  // Seed with the world x-axis: for a vertical leg that puts u=0 at the front.
  let ref: Vec3 = norm(sub([1, 0, 0], scale(tangents[0], dot([1, 0, 0], tangents[0]))));
  normal.push(ref);
  binormal.push(norm(cross(tangents[0], ref)));

  for (let i = 1; i < points.length; i++) {
    const v1 = sub(points[i], points[i - 1]);
    const c1 = dot(v1, v1);
    let rL = c1 > 1e-12 ? sub(ref, scale(v1, (2 / c1) * dot(v1, ref))) : ref;
    const tL = c1 > 1e-12 ? sub(tangents[i - 1], scale(v1, (2 / c1) * dot(v1, tangents[i - 1]))) : tangents[i - 1];
    const v2 = sub(tangents[i], tL);
    const c2 = dot(v2, v2);
    if (c2 > 1e-12) rL = sub(rL, scale(v2, (2 / c2) * dot(v2, rL)));
    ref = norm(rL);
    normal.push(ref);
    binormal.push(norm(cross(tangents[i], ref)));
  }
  return { normal, binormal };
}

/** Smoothstep, used for every fade in the profile. */
function bump(x: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function buildSockMesh({ legLength, around = 56, along = 190 }: SockMeshOptions): MeshArrays {
  const control = centreline(legLength);

  /*
   * Resample the centreline by arc length.
   *
   * A spline's own parameter is not distance: these control points are packed
   * more tightly around the ankle, so an evenly-parameterised sweep spends as
   * much of v on the last 3cm of shin as on the first 7cm. Everything
   * downstream reads v as "how far down the sock" — the texture's centimetre
   * scale, the landmarks, where the print lands — so v has to *be* distance.
   * Without this the cuff hit slides down to the ankle.
   */
  const dense: Vec3[] = [];
  const DENSE = 2000;
  for (let i = 0; i <= DENSE; i++) dense.push(spline(control, i / DENSE));

  const cumulative: number[] = [0];
  for (let i = 1; i <= DENSE; i++) cumulative.push(cumulative[i - 1] + len(sub(dense[i], dense[i - 1])));
  const total = cumulative[DENSE];

  const at = (distance: number): Vec3 => {
    const d = Math.min(Math.max(distance, 0), total);
    let lo = 0;
    let hi = DENSE;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const span = cumulative[i] - cumulative[i - 1];
    const f = span > 1e-9 ? (d - cumulative[i - 1]) / span : 0;
    return add(dense[i - 1], scale(sub(dense[i], dense[i - 1]), f));
  };

  const pts: Vec3[] = [];
  for (let i = 0; i <= along; i++) pts.push(at((i / along) * total));

  const tangents: Vec3[] = pts.map((_, i) =>
    norm(sub(pts[Math.min(along, i + 1)], pts[Math.max(0, i - 1)])),
  );
  const { normal, binormal } = frames(pts, tangents);

  // Landmarks as fractions of the real length: the cuff is 3.4cm of ribbing,
  // the ankle turn is wherever the centreline stops heading downwards, and the
  // toe is the last 4cm.
  let ankleV = 0.5;
  for (let i = 1; i <= along; i++) {
    const t = norm(sub(pts[i], pts[i - 1]));
    if (t[2] > 0.82) {
      ankleV = i / along;
      break;
    }
  }
  const cuffEnd = Math.min(0.2, 3.4 / total);
  const heel = Math.min(0.95, ankleV + 0.02);
  const toeStart = 1 - 4 / total;

  const positions = new Float32Array((along + 1) * (around + 1) * 3);
  const uvs = new Float32Array((along + 1) * (around + 1) * 2);
  let p = 0;
  let q = 0;

  for (let i = 0; i <= along; i++) {
    const v = i / along;
    const centre = pts[i];
    const N = normal[i];
    const B = binormal[i];

    // Girth: a little wider at the cuff, narrowest at the ankle, fuller across
    // the ball of the foot, then closing to the toe.
    let r = 3.05;
    r += 0.28 * (1 - bump(v, 0, cuffEnd * 1.6)); // ribbed cuff sits proud
    r -= 0.42 * bump(v, cuffEnd, ankleV) * (1 - bump(v, ankleV, ankleV + 0.12));
    r += 0.55 * bump(v, ankleV, ankleV + 0.25);
    const toe = bump(v, toeStart, 1);
    r *= Math.sqrt(Math.max(0, 1 - toe * toe)) * (1 - 0.12 * toe) + 0.001;

    // Flattening: a leg is flatter front-to-back, a foot is flatter
    // top-to-bottom, and the axis swaps through the ankle.
    const legness = 1 - bump(v, ankleV - 0.06, ankleV + 0.14);
    const rx = r * (1 + 0.1 * legness + 0.16 * (1 - legness));
    const ry = r * (1 - 0.12 * legness - 0.3 * (1 - legness));

    for (let j = 0; j <= around; j++) {
      const u = j / around;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // The heel: a bulge on the back of the ankle only, aimed along -z, which
      // in frame terms is roughly -binormal through the bend.
      const heelAim = Math.max(0, -sa);
      const heelAmt = bump(v, ankleV - 0.16, ankleV) * (1 - bump(v, ankleV, ankleV + 0.2));
      const swell = 1 + 0.42 * heelAmt * heelAim ** 1.5;

      const offset = add(scale(N, rx * ca * swell), scale(B, ry * sa * swell));
      const pos = add(centre, offset);

      positions[p++] = pos[0];
      positions[p++] = pos[1];
      positions[p++] = pos[2];
      uvs[q++] = u;
      uvs[q++] = v;
    }
  }

  // Triangles.
  const indices = new Uint32Array(along * around * 6);
  let k = 0;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = a + 1;
      indices[k++] = b;
      indices[k++] = b + 1;
      indices[k++] = a + 1;
    }
  }

  // Circumference of a mid-leg ring, for the texture's horizontal scale.
  const legSample = Math.floor(along * Math.min(0.3, ankleV * 0.5));
  let circumference = 0;
  {
    const base = legSample * (around + 1) * 3;
    for (let j = 0; j < around; j++) {
      const a = base + j * 3;
      const b = a + 3;
      circumference += Math.hypot(
        positions[a] - positions[b],
        positions[a + 1] - positions[b + 1],
        positions[a + 2] - positions[b + 2],
      );
    }
  }

  return {
    positions,
    uvs,
    indices,
    landmarks: { cuffEnd, heel, toeStart },
    metrics: { lengthCm: total, circumferenceCm: circumference },
  };
}

/** Bounding box, handy for framing the camera and for tests. */
export function meshBounds(positions: Float32Array): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}
