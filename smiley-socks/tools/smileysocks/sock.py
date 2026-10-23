"""
How long a sock is, how far around it goes, and where its landmarks sit.

Ported from the measuring half of ``src/three/sockMesh.ts``. The 3D viewer
needs a mesh; a print file needs only numbers — the centreline's true length,
the circumference of a mid-leg ring, and the three landmarks (end of the cuff
ribbing, heel centre, start of the toe) that placement is expressed against.

So this builds the sweep and measures it, but never triangulates it. That is
why there are no positions or indices here: the tens of thousands of vertices
the viewer needs would be computed and thrown away.

Units are centimetres, roughly a men's UK 9, so the millimetre print sizes in
``catalog`` map onto it directly.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

Vec3 = tuple[float, float, float]


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a: Vec3, s: float) -> Vec3:
    return (a[0] * s, a[1] * s, a[2] * s)


def _len(a: Vec3) -> float:
    return math.hypot(a[0], a[1], a[2])


def _norm(a: Vec3) -> Vec3:
    l = _len(a)
    return (0.0, 0.0, 1.0) if l < 1e-9 else _scale(a, 1 / l)


def _spline(points: list[Vec3], t: float) -> Vec3:
    """Centripetal Catmull-Rom through the control points."""
    n = len(points) - 1
    x = min(max(t, 0.0), 1.0) * n
    i = min(int(math.floor(x)), n - 1)
    f = x - i
    p0 = points[max(0, i - 1)]
    p1 = points[i]
    p2 = points[i + 1]
    p3 = points[min(n, i + 2)]

    f2 = f * f
    f3 = f2 * f
    out = []
    for k in range(3):
        out.append(
            0.5
            * (
                2 * p1[k]
                + (-p0[k] + p2[k]) * f
                + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2
                + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3
            )
        )
    return (out[0], out[1], out[2])


def _centreline(leg_length: float) -> list[Vec3]:
    """Down the leg, round the ankle, out to the toe."""
    ankle = 4.2
    return [
        (0, leg_length, -0.2),
        (0, leg_length * 0.72, -0.1),
        (0, leg_length * 0.4, 0),
        (0, ankle + 1.6, 0.5),
        (0, ankle - 0.4, 2.2),
        (0, 3.1, 4.4),
        (0, 2.9, 8),
        (0, 2.9, 12),
        (0, 3.0, 16),
        (0, 3.2, 19.2),
        (0, 3.3, 21),
    ]


def _bump(x: float, start: float, end: float) -> float:
    """Smoothstep, used for every fade in the profile."""
    t = min(1.0, max(0.0, (x - start) / (end - start)))
    return t * t * (3 - 2 * t)


@dataclass(frozen=True)
class Landmarks:
    """Positions along the sock, as fractions of its length."""

    cuff_end: float
    heel: float
    toe_start: float


@dataclass(frozen=True)
class SockMetrics:
    length_cm: float
    circumference_cm: float
    landmarks: Landmarks

    @property
    def wrap_width_mm(self) -> float:
        """A full wrap laid flat is the circumference, in millimetres."""
        return self.circumference_cm * 10

    @property
    def wrap_height_mm(self) -> float:
        return self.length_cm * 10


def sock_metrics(leg_length: float, around: int = 56, along: int = 190) -> SockMetrics:
    """Measure the sock the 3D viewer would build for this leg length."""
    control = _centreline(leg_length)

    # Resample by arc length. A spline's own parameter is not distance — the
    # control points crowd around the ankle — and everything downstream reads
    # v as "how far down the sock". Without this the cuff hit slides to the
    # ankle, on the model and in the print file alike.
    DENSE = 2000
    dense = [_spline(control, i / DENSE) for i in range(DENSE + 1)]
    cumulative = [0.0]
    for i in range(1, DENSE + 1):
        cumulative.append(cumulative[i - 1] + _len(_sub(dense[i], dense[i - 1])))
    total = cumulative[DENSE]

    def at(distance: float) -> Vec3:
        d = min(max(distance, 0.0), total)
        lo, hi = 0, DENSE
        while lo < hi:
            mid = (lo + hi) // 2
            if cumulative[mid] < d:
                lo = mid + 1
            else:
                hi = mid
        i = max(1, lo)
        span = cumulative[i] - cumulative[i - 1]
        f = (d - cumulative[i - 1]) / span if span > 1e-9 else 0.0
        return _add(dense[i - 1], _scale(_sub(dense[i], dense[i - 1]), f))

    pts = [at((i / along) * total) for i in range(along + 1)]

    # The ankle turn is wherever the centreline stops heading downwards.
    ankle_v = 0.5
    for i in range(1, along + 1):
        t = _norm(_sub(pts[i], pts[i - 1]))
        if t[2] > 0.82:
            ankle_v = i / along
            break

    cuff_end = min(0.2, 3.4 / total)
    heel = min(0.95, ankle_v + 0.02)
    toe_start = 1 - 4 / total

    # Circumference of a mid-leg ring. The cross-section is an ellipse in an
    # orthonormal frame, and an ellipse's perimeter does not depend on which
    # orthonormal basis you draw it in — so the rotation-minimising frames the
    # mesh needs to stop the print twisting are not needed to measure it.
    leg_sample = int(math.floor(along * min(0.3, ankle_v * 0.5)))
    v = leg_sample / along

    r = 3.05
    r += 0.28 * (1 - _bump(v, 0, cuff_end * 1.6))  # ribbed cuff sits proud
    r -= 0.42 * _bump(v, cuff_end, ankle_v) * (1 - _bump(v, ankle_v, ankle_v + 0.12))
    r += 0.55 * _bump(v, ankle_v, ankle_v + 0.25)
    toe = _bump(v, toe_start, 1)
    r *= math.sqrt(max(0.0, 1 - toe * toe)) * (1 - 0.12 * toe) + 0.001

    legness = 1 - _bump(v, ankle_v - 0.06, ankle_v + 0.14)
    rx = r * (1 + 0.1 * legness + 0.16 * (1 - legness))
    ry = r * (1 - 0.12 * legness - 0.3 * (1 - legness))

    heel_amt = _bump(v, ankle_v - 0.16, ankle_v) * (1 - _bump(v, ankle_v, ankle_v + 0.2))

    ring: list[tuple[float, float]] = []
    for j in range(around + 1):
        a = (j / around) * math.pi * 2
        ca, sa = math.cos(a), math.sin(a)
        heel_aim = max(0.0, -sa)
        swell = 1 + 0.42 * heel_amt * heel_aim**1.5
        ring.append((rx * ca * swell, ry * sa * swell))

    circumference = sum(
        math.hypot(ring[j][0] - ring[j + 1][0], ring[j][1] - ring[j + 1][1])
        for j in range(around)
    )

    return SockMetrics(
        length_cm=total,
        circumference_cm=circumference,
        landmarks=Landmarks(cuff_end=cuff_end, heel=heel, toe_start=toe_start),
    )
