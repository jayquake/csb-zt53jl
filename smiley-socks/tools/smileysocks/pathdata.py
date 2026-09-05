"""
SVG path data: parsing, transforming, flattening, and turning strokes into
fillable outlines.

The face engine emits SVG path strings, and the browser has three renderers
that already understand them (SVG, ``Path2D`` on canvas, and the 3D texture).
Out here there is no browser, so this module is the fourth: enough of the path
grammar to read what face.ts writes, and enough geometry to hand a rasteriser
polygons.

Only the commands the brand actually produces are supported — M, L, H, V, C, Q,
Z, in both cases — because a half-finished arc implementation that silently
draws the wrong thing is worse than one that refuses.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable, Sequence

Pt = tuple[float, float]

_TOKEN = re.compile(r"[MmLlHhVvCcQqZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?")


@dataclass(frozen=True)
class Transform:
    """A 2x3 affine, in the order SVG applies them."""

    a: float = 1.0
    b: float = 0.0
    c: float = 0.0
    d: float = 1.0
    e: float = 0.0
    f: float = 0.0

    def apply(self, p: Pt) -> Pt:
        return (self.a * p[0] + self.c * p[1] + self.e, self.b * p[0] + self.d * p[1] + self.f)

    def then(self, other: "Transform") -> "Transform":
        """``other`` applied after ``self``."""
        return Transform(
            a=other.a * self.a + other.c * self.b,
            b=other.b * self.a + other.d * self.b,
            c=other.a * self.c + other.c * self.d,
            d=other.b * self.c + other.d * self.d,
            e=other.a * self.e + other.c * self.f + other.e,
            f=other.b * self.e + other.d * self.f + other.f,
        )

    @property
    def scale(self) -> float:
        """Mean linear scale — what a stroke width gets multiplied by."""
        return math.sqrt(abs(self.a * self.d - self.b * self.c)) or 1.0

    @staticmethod
    def translate(x: float, y: float) -> "Transform":
        return Transform(e=x, f=y)

    @staticmethod
    def scaled(sx: float, sy: float | None = None) -> "Transform":
        return Transform(a=sx, d=sx if sy is None else sy)

    @staticmethod
    def rotate(deg: float, cx: float = 0.0, cy: float = 0.0) -> "Transform":
        t = deg * math.pi / 180
        cos, sin = math.cos(t), math.sin(t)
        return Transform(
            a=cos,
            b=sin,
            c=-sin,
            d=cos,
            e=cx - cos * cx + sin * cy,
            f=cy - sin * cx - cos * cy,
        )


@dataclass
class SubPath:
    """One pen-down-to-pen-up run. Segments are absolute and already reduced to
    lines and cubics — quadratics are raised on the way in, because every
    consumer downstream (rasteriser, PDF) wants cubics anyway."""

    start: Pt
    #: ('L', p) or ('C', c1, c2, p)
    segments: list[tuple]
    closed: bool = False

    def points(self) -> list[Pt]:
        out = [self.start]
        for seg in self.segments:
            out.append(seg[-1])
        return out


def parse_path(d: str) -> list[SubPath]:
    tokens = _TOKEN.findall(d or "")
    subpaths: list[SubPath] = []
    current: SubPath | None = None
    cursor: Pt = (0.0, 0.0)
    start: Pt = (0.0, 0.0)
    i = 0
    op = ""

    def number() -> float:
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    while i < len(tokens):
        token = tokens[i]
        if token.isalpha():
            op = token
            i += 1
            if op in "Zz":
                if current is not None:
                    current.closed = True
                    cursor = current.start
                current = None
                continue
        elif op in ("M", "m"):
            # A repeated coordinate pair after a moveto is an implicit lineto.
            op = "L" if op == "M" else "l"

        if i >= len(tokens):
            break
        relative = op.islower()
        code = op.upper()

        if code == "M":
            x, y = number(), number()
            cursor = (cursor[0] + x, cursor[1] + y) if relative else (x, y)
            start = cursor
            current = SubPath(start=cursor, segments=[])
            subpaths.append(current)
            continue

        if current is None:
            # A path that draws before it moves starts wherever the pen is.
            current = SubPath(start=cursor, segments=[])
            subpaths.append(current)

        if code == "L":
            x, y = number(), number()
            cursor = (cursor[0] + x, cursor[1] + y) if relative else (x, y)
            current.segments.append(("L", cursor))
        elif code == "H":
            x = number()
            cursor = (cursor[0] + x, cursor[1]) if relative else (x, cursor[1])
            current.segments.append(("L", cursor))
        elif code == "V":
            y = number()
            cursor = (cursor[0], cursor[1] + y) if relative else (cursor[0], y)
            current.segments.append(("L", cursor))
        elif code == "C":
            pts = [(number(), number()) for _ in range(3)]
            if relative:
                pts = [(cursor[0] + p[0], cursor[1] + p[1]) for p in pts]
            current.segments.append(("C", pts[0], pts[1], pts[2]))
            cursor = pts[2]
        elif code == "Q":
            pts = [(number(), number()) for _ in range(2)]
            if relative:
                pts = [(cursor[0] + p[0], cursor[1] + p[1]) for p in pts]
            control, end = pts
            # Raise to a cubic: the control points sit two thirds of the way
            # from each endpoint towards the quadratic's single control.
            c1 = (cursor[0] + 2 / 3 * (control[0] - cursor[0]), cursor[1] + 2 / 3 * (control[1] - cursor[1]))
            c2 = (end[0] + 2 / 3 * (control[0] - end[0]), end[1] + 2 / 3 * (control[1] - end[1]))
            current.segments.append(("C", c1, c2, end))
            cursor = end
        else:
            raise ValueError(f"unsupported path command {op!r} in {d[:60]!r}")

    return [s for s in subpaths if s.segments or s.closed]


def transform_subpaths(subpaths: Sequence[SubPath], t: Transform) -> list[SubPath]:
    out: list[SubPath] = []
    for sp in subpaths:
        segments: list[tuple] = []
        for seg in sp.segments:
            segments.append((seg[0], *[t.apply(p) for p in seg[1:]]))
        out.append(SubPath(start=t.apply(sp.start), segments=segments, closed=sp.closed))
    return out


def _cubic_steps(p0: Pt, c1: Pt, c2: Pt, p3: Pt, tolerance: float) -> int:
    # Flatness from the control polygon: subdividing into n chords leaves an
    # error on the order of L/(8n^2), so n follows from the tolerance.
    length = (
        math.dist(p0, c1) + math.dist(c1, c2) + math.dist(c2, p3)
    )
    if length <= 0:
        return 1
    n = math.ceil(math.sqrt(length / (8 * max(tolerance, 1e-6))))
    return int(min(120, max(1, n)))


def flatten(subpaths: Iterable[SubPath], tolerance: float = 0.12) -> list[list[Pt]]:
    """Polylines, in the same units as the input. ``tolerance`` is the largest
    accepted deviation — set it in device pixels and curves stay smooth at
    whatever resolution the file is being written at."""
    polys: list[list[Pt]] = []
    for sp in subpaths:
        pts: list[Pt] = [sp.start]
        cursor = sp.start
        for seg in sp.segments:
            if seg[0] == "L":
                pts.append(seg[1])
                cursor = seg[1]
            else:
                _, c1, c2, end = seg
                steps = _cubic_steps(cursor, c1, c2, end, tolerance)
                for k in range(1, steps + 1):
                    t = k / steps
                    u = 1 - t
                    pts.append(
                        (
                            u**3 * cursor[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * end[0],
                            u**3 * cursor[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * end[1],
                        )
                    )
                cursor = end
        if sp.closed and pts[0] != pts[-1]:
            pts.append(pts[0])
        if len(pts) > 1:
            polys.append(pts)
    return polys


# ---------------------------------------------------------------------------
# Strokes as outlines
# ---------------------------------------------------------------------------


def _orient(poly: list[Pt]) -> list[Pt]:
    """Wind every polygon the same way.

    A stroke is rasterised as the union of one quad per segment and one disc
    per joint. Under the nonzero fill rule, consistently-wound overlapping
    shapes union for free — inconsistent ones punch holes in each other,
    which shows up as pale gaps exactly at the joints.
    """
    area = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        area += x0 * y1 - x1 * y0
    return poly if area <= 0 else poly[::-1]


def _disc(centre: Pt, radius: float, sides: int) -> list[Pt]:
    return [
        (
            centre[0] + radius * math.cos(2 * math.pi * i / sides),
            centre[1] + radius * math.sin(2 * math.pi * i / sides),
        )
        for i in range(sides)
    ]


def stroke_to_polygons(
    polylines: Sequence[Sequence[Pt]], width: float, round_caps: bool = True
) -> list[list[Pt]]:
    """Round-capped, round-joined stroke, expressed as polygons to fill.

    Round joins and caps are the brand's: every path in face.ts and Grinline is
    drawn with ``stroke-linecap="round"``, and a mono-line alphabet with mitred
    ends is a different typeface.
    """
    half = max(width, 0.0) / 2
    if half <= 0:
        return []
    # Enough sides that the cap is round rather than obviously polygonal, but
    # scaled to the radius so a hairline does not cost 32 edges.
    sides = int(min(48, max(8, math.ceil(half * 2.2))))
    out: list[list[Pt]] = []

    for line in polylines:
        pts = [line[0]]
        for p in line[1:]:
            if math.dist(p, pts[-1]) > 1e-9:
                pts.append(p)

        if len(pts) == 1:
            if round_caps:
                out.append(_orient(_disc(pts[0], half, sides)))
            continue

        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            dx, dy = x1 - x0, y1 - y0
            length = math.hypot(dx, dy)
            nx, ny = -dy / length * half, dx / length * half
            out.append(
                _orient([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])
            )

        # A disc at every vertex: interior ones are the joins, the two ends are
        # the caps. Cheaper to state than to special-case, and identical output.
        joints = pts if round_caps else pts[1:-1]
        for p in joints:
            out.append(_orient(_disc(p, half, sides)))

    return out


def ellipse_polygon(cx: float, cy: float, rx: float, ry: float, sides: int = 64) -> list[Pt]:
    return _orient(
        [
            (cx + rx * math.cos(2 * math.pi * i / sides), cy + ry * math.sin(2 * math.pi * i / sides))
            for i in range(sides)
        ]
    )


def bounds(polys: Iterable[Sequence[Pt]]) -> tuple[float, float, float, float] | None:
    xs: list[float] = []
    ys: list[float] = []
    for poly in polys:
        for x, y in poly:
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))
