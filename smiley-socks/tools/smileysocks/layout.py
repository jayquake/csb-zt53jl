"""
Laying a design out on a print canvas, in millimetres.

This is the module that decides where anything goes, and it is the only one.
The UV coordinates the 3D preview paints with (u around the sock, v along it)
map onto a flat wrap by multiplication, which is the useful consequence of the
sock being a swept tube: unwrapped, it is a rectangle whose width is the
circumference and whose height is the centreline length.

The print therefore lands at the same place on the file as it does on the model
the customer turned around on their phone — not approximately, but from the
same two numbers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from . import pathdata as pd
from .catalog import PrintSpot, colorway_by_id, height_by_id, placement_by_id, print_mm, print_spots
from .design import Design
from .face import STROKE, build_face
from .render import Op, ellipse_path, rect_path
from .sock import SockMetrics, sock_metrics
from .template import PrintTemplate

#: The face art spans about 160 of its 200-unit box, stroke included. The same
#: constant the canvas texture painter uses, for the same reason: it is what
#: makes a "29 mm print" measure 29 mm rather than 36.
FACE_SPAN = 160.0


@dataclass(frozen=True)
class Layout:
    """Everything a caller needs to describe the file it just received."""

    width_mm: float
    height_mm: float
    dpi: int
    bleed_mm: float
    metrics: SockMetrics
    spots: tuple[PrintSpot, ...]
    print_mm: float
    #: Where each print centre ended up on the canvas, in millimetres.
    centres: tuple[tuple[float, float], ...]
    background: str | None
    ink: str
    #: Where cuff text goes, as boxes. Proof only — see `_cuff_text_ops`.
    text_guides: tuple[Op, ...] = ()

    @property
    def width_px(self) -> int:
        return max(1, round(self.width_mm * self.dpi / 25.4))

    @property
    def height_px(self) -> int:
        return max(1, round(self.height_mm * self.dpi / 25.4))


def face_ops(
    design: Design, cx: float, cy: float, size_mm: float, ink: str
) -> list[Op]:
    """One face, centred on (cx, cy), spanning ``size_mm``."""
    # The design's own finish choice — chalk is the shelf default, so a
    # design exported without one still gets the hand-drawn wobble the
    # customer saw on the flat proof, not a mathematically clean line.
    geometry = build_face(design.face, design.finish)
    scale = size_mm / FACE_SPAN

    # Face space is 200 units centred on (100, 100): move that centre to the
    # origin, spin it, scale it to millimetres, then put it where it goes.
    base = (
        pd.Transform.translate(-100, -100)
        .then(pd.Transform.rotate(geometry.tilt))
        .then(pd.Transform.scaled(scale))
        .then(pd.Transform.translate(cx, cy))
    )

    ops: list[Op] = []

    def emit(prim, transform: pd.Transform) -> None:
        opacity = 1.0 if prim.opacity is None else prim.opacity
        if prim.kind == "dot":
            d = ellipse_path(prim.cx, prim.cy, prim.rx, prim.ry)
        else:
            d = prim.d
        subpaths = pd.transform_subpaths(pd.parse_path(d), transform)
        d_mm = _to_path_string(subpaths)
        if prim.kind == "stroke":
            ops.append(
                Op(
                    d=d_mm,
                    stroke=ink,
                    width=(prim.w if prim.w is not None else STROKE) * transform.scale,
                    opacity=opacity,
                )
            )
        else:
            ops.append(Op(d=d_mm, fill=ink, opacity=opacity))

    if geometry.outline:
        emit(geometry.outline, base)
    for eyes, spin in zip(
        (geometry.eyes_left, geometry.eyes_right), geometry.eye_rotation
    ):
        spun = pd.Transform.rotate(spin.deg, spin.cx, spin.cy).then(base)
        for prim in eyes:
            emit(prim, spun)
    for prim in geometry.rest:
        emit(prim, base)
    return ops


def _to_path_string(subpaths) -> str:
    parts: list[str] = []
    for sp in subpaths:
        parts.append(f"M{_c(sp.start)}")
        for seg in sp.segments:
            if seg[0] == "L":
                parts.append(f"L{_c(seg[1])}")
            else:
                parts.append(f"C{_c(seg[1])} {_c(seg[2])} {_c(seg[3])}")
        if sp.closed:
            parts.append("Z")
    return "".join(parts)


def _c(p) -> str:
    return f"{p[0]:.4f},{p[1]:.4f}"


def build_layout(design: Design, template: PrintTemplate) -> tuple[list[Op], Layout]:
    """Turn a design into a list of drawables and a description of the canvas."""
    height = height_by_id(design.height_id)
    metrics = sock_metrics(height.leg_cm)
    colorway = colorway_by_id(design.colorway_id)
    placement = placement_by_id(design.placement_id)
    size_mm = print_mm(placement)

    width_mm, height_mm = template.canvas_mm(metrics, size_mm)
    bleed = template.bleed_mm
    ops: list[Op] = []

    if template.kind == "artwork":
        centres = ((width_mm / 2, height_mm / 2),)
        spots = tuple(print_spots(design.placement_id, metrics.landmarks))[:1]
        ops.extend(face_ops(design, centres[0][0], centres[0][1], size_mm, colorway.ink))
        return ops, Layout(
            width_mm=width_mm,
            height_mm=height_mm,
            dpi=template.dpi,
            bleed_mm=bleed,
            metrics=metrics,
            spots=spots,
            print_mm=size_mm,
            centres=centres,
            background=colorway.base if template.background else None,
            ink=colorway.ink,
        )

    # The sock, unwrapped. u * circumference across, v * length down, with the
    # bleed as a margin the artwork bleeds into but the sock does not occupy.
    sock_w = metrics.wrap_width_mm
    sock_h = metrics.wrap_height_mm
    visible_h = height_mm - bleed * 2

    def place(u: float, v: float) -> tuple[float, float]:
        return (bleed + u * sock_w, bleed + v * sock_h)

    def wrapped_x(cx: float, half_width: float) -> list[float]:
        """Every x this shape has to be drawn at.

        The left and right edges of a wrap are the same seam on the finished
        sock, so anything overhanging one edge continues onto the other. Drawn
        once, a heel at u=0.75 or an all-over print at u=0 arrives sliced in
        half down the side of the leg.
        """
        xs = [cx]
        if cx - half_width < bleed:
            xs.append(cx + sock_w)
        if cx + half_width > bleed + sock_w:
            xs.append(cx - sock_w)
        return xs

    if template.background:
        # Bleed included: an edge that stops exactly at the trim line shows as a
        # white sliver when the cut wanders, which it always does.
        ops.append(Op(d=rect_path(0, 0, width_mm, height_mm), fill=colorway.base))

        cuff_mm = metrics.landmarks.cuff_end * sock_h
        ops.append(Op(d=rect_path(0, 0, width_mm, bleed + cuff_mm), fill=colorway.accent))

        if template.kind == "wrap":
            # The heel sits on the back of the ankle, at u = 0.75, where the
            # mesh puts its bulge.
            hx, hy = place(0.75, metrics.landmarks.heel)
            heel_rx = sock_w * 0.3
            for x in wrapped_x(hx, heel_rx):
                ops.append(
                    Op(d=ellipse_path(x, hy, heel_rx, sock_h * 0.052), fill=colorway.accent)
                )
            toe_y = bleed + metrics.landmarks.toe_start * sock_h
            ops.append(
                Op(d=rect_path(0, toe_y, width_mm, height_mm - toe_y), fill=colorway.accent)
            )

    spots = tuple(print_spots(design.placement_id, metrics.landmarks))
    centres: list[tuple[float, float]] = []
    for spot in spots:
        cx, cy = place(spot.u, spot.v)
        if template.kind == "panel" and cy > visible_h + bleed:
            # A panel that stops at the heel cannot carry an all-over print's
            # lower rows; dropping them is right, and the manifest says so.
            continue
        centres.append((cx, cy))
        for x in wrapped_x(cx, spot.cm * 5):
            ops.extend(face_ops(design, x, cy, spot.cm * 10, colorway.ink))

    text_guides = _cuff_text_ops(design, metrics, place, colorway.ink) if design.cuff_text else []

    return ops, Layout(
        width_mm=width_mm,
        height_mm=height_mm,
        dpi=template.dpi,
        bleed_mm=bleed,
        metrics=metrics,
        spots=spots,
        print_mm=size_mm,
        centres=tuple(centres),
        background=colorway.base if template.background else None,
        ink=colorway.ink,
        text_guides=tuple(text_guides),
    )


def _cuff_text_ops(design: Design, metrics: SockMetrics, place, ink: str) -> list[Op]:
    """The wearer's own text, down the outer leg under the print.

    Grinline is a stroked alphabet with no font file, and porting its glyph
    table would be a third copy of the truth for the sake of ten characters.
    Instead the text is set as a row of boxes at the correct size and position,
    and the manifest records the string — so pre-press knows exactly what to set
    and where, and nothing here can silently letter it wrongly.

    These boxes go on the *proof* only. A placeholder that ships inside the
    print file is a placeholder that gets printed onto somebody's sock.
    """
    from .catalog import placement_by_id, print_mm as size_of

    spots = print_spots(design.placement_id, metrics.landmarks)
    if not spots:
        return []
    last = spots[-1]
    cap_mm = min(7.0, (0.42 * metrics.wrap_width_mm) / max(1, len(design.cuff_text)))
    cx, cy = place(0.5, last.v)
    baseline = min(
        cy + size_of(placement_by_id(design.placement_id)) * 0.6 + cap_mm * 2.2,
        place(0.5, metrics.landmarks.heel)[1] - cap_mm,
    )
    advance = cap_mm * 0.78
    total = advance * len(design.cuff_text)
    x = cx - total / 2
    ops: list[Op] = []
    for i in range(len(design.cuff_text)):
        left = x + i * advance
        ops.append(
            Op(
                d=rect_path(left, baseline - cap_mm, advance * 0.72, cap_mm),
                stroke=ink,
                width=0.25,
                opacity=0.55,
            )
        )
    return ops


def guide_ops(layout: Layout) -> list[Op]:
    """Trim line, safe area and print circles — for the proof, never the file
    that gets printed."""
    guide = "#D0342C"
    soft = "#7A8CA3"
    bleed = layout.bleed_mm
    ops = list(layout.text_guides)
    ops += [
        Op(
            d=rect_path(bleed, bleed, layout.width_mm - bleed * 2, layout.height_mm - bleed * 2),
            stroke=guide,
            width=0.3,
            opacity=0.9,
        )
    ]
    for cx, cy in layout.centres:
        r = layout.print_mm / 2
        ops.append(Op(d=ellipse_path(cx, cy, r, r), stroke=soft, width=0.25, opacity=0.9))
        ops.append(
            Op(
                d=f"M{cx - r - 2},{cy:.4f}L{cx + r + 2},{cy:.4f}M{cx:.4f},{cy - r - 2}L{cx:.4f},{cy + r + 2}",
                stroke=soft,
                width=0.15,
                opacity=0.7,
            )
        )
    return ops


def fit_scale(layout: Layout, max_mm: float) -> float:
    """How much a proof has to shrink to fit on a page."""
    longest = max(layout.width_mm, layout.height_mm)
    return min(1.0, max_mm / longest) if longest > 0 else 1.0


def scaled_ops(ops: list[Op], scale: float, dx: float = 0.0, dy: float = 0.0) -> list[Op]:
    if scale == 1.0 and dx == 0.0 and dy == 0.0:
        return ops
    t = pd.Transform.scaled(scale).then(pd.Transform.translate(dx, dy))
    out: list[Op] = []
    for op in ops:
        out.append(
            Op(
                d=_to_path_string(pd.transform_subpaths(pd.parse_path(op.d), t)),
                fill=op.fill,
                stroke=op.stroke,
                width=op.width * scale,
                opacity=op.opacity,
                even_odd=op.even_odd,
            )
        )
    return out


def hypot_mm(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])
