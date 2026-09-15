"""
One drawing, three files.

A print order needs the same artwork in three forms: a raster the supplier's
uploader will accept, a vector the pre-press desk can scale without asking, and
a true-scale proof a human signs off. Producing those from three separate
drawing routines is how a sock ships with a print the customer never approved.

So layout happens once, in millimetres, and lands in a list of ``Op``. The three
emitters below are dumb: they translate ops into PNG pixels, SVG elements and
PDF content-stream operators, and none of them makes a placement decision.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass
from typing import Sequence

from . import pathdata as pd
from .raster import Canvas

MM_PER_INCH = 25.4
PT_PER_MM = 72.0 / MM_PER_INCH


@dataclass(frozen=True)
class Op:
    """One drawable, in millimetres from the top-left of the print area."""

    d: str
    fill: str | None = None
    stroke: str | None = None
    #: Stroke width in millimetres. Ignored when ``stroke`` is None.
    width: float = 0.0
    opacity: float = 1.0
    #: Even-odd rather than nonzero. Only the open mouth needs it.
    even_odd: bool = False


def ellipse_path(cx: float, cy: float, rx: float, ry: float) -> str:
    """An ellipse as four cubics, so every drawable in the pipeline is a path
    and no emitter needs a second shape primitive."""
    k = 0.5522847498307936  # circle-to-bezier constant
    ox, oy = rx * k, ry * k
    return (
        f"M{cx - rx},{cy}"
        f"C{cx - rx},{cy - oy} {cx - ox},{cy - ry} {cx},{cy - ry}"
        f"C{cx + ox},{cy - ry} {cx + rx},{cy - oy} {cx + rx},{cy}"
        f"C{cx + rx},{cy + oy} {cx + ox},{cy + ry} {cx},{cy + ry}"
        f"C{cx - ox},{cy + ry} {cx - rx},{cy + oy} {cx - rx},{cy}Z"
    )


def rect_path(x: float, y: float, w: float, h: float) -> str:
    return f"M{x},{y}L{x + w},{y}L{x + w},{y + h}L{x},{y + h}Z"


# ---------------------------------------------------------------------------
# Raster
# ---------------------------------------------------------------------------


def render_png(
    ops: Sequence[Op],
    width_mm: float,
    height_mm: float,
    dpi: int,
    background: str = "#FFFFFF",
) -> Canvas:
    px_per_mm = dpi / MM_PER_INCH
    canvas = Canvas(
        max(1, round(width_mm * px_per_mm)),
        max(1, round(height_mm * px_per_mm)),
        background,
    )
    to_px = pd.Transform.scaled(px_per_mm)
    # Half a pixel: curves are flattened finely enough that the anti-aliasing,
    # not the polygon count, is what you can see.
    tolerance = 0.4

    for op in ops:
        subpaths = pd.transform_subpaths(pd.parse_path(op.d), to_px)
        if op.fill:
            canvas.fill_polygons(
                pd.flatten(subpaths, tolerance), op.fill, op.opacity, even_odd=op.even_odd
            )
        if op.stroke and op.width > 0:
            polylines = pd.flatten(subpaths, tolerance)
            polygons = pd.stroke_to_polygons(polylines, op.width * px_per_mm)
            canvas.fill_polygons(polygons, op.stroke, op.opacity)
    return canvas


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------


def render_svg(
    ops: Sequence[Op],
    width_mm: float,
    height_mm: float,
    background: str | None = None,
    title: str = "Smiley Socks print file",
) -> str:
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        # Sized in millimetres with a matching viewBox, so opening this in
        # Illustrator gives an artboard at the real print size rather than at
        # whatever the application guesses.
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_n(width_mm)}mm" '
        f'height="{_n(height_mm)}mm" viewBox="0 0 {_n(width_mm)} {_n(height_mm)}">',
        f"<title>{_escape(title)}</title>",
    ]
    if background:
        parts.append(f'<rect width="{_n(width_mm)}" height="{_n(height_mm)}" fill="{background}"/>')
    for op in ops:
        attrs = [f'd="{op.d}"']
        attrs.append(f'fill="{op.fill}"' if op.fill else 'fill="none"')
        if op.fill and op.even_odd:
            attrs.append('fill-rule="evenodd"')
        if op.stroke and op.width > 0:
            attrs.append(f'stroke="{op.stroke}"')
            attrs.append(f'stroke-width="{_n(op.width)}"')
            attrs.append('stroke-linecap="round"')
            attrs.append('stroke-linejoin="round"')
        if op.opacity < 1:
            attrs.append(f'opacity="{_n(op.opacity)}"')
        parts.append(f"<path {' '.join(attrs)}/>")
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def _n(value: float) -> str:
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


@dataclass
class TextRun:
    """A line of Helvetica on the proof. Millimetres, from the top-left."""

    x: float
    y: float
    text: str
    size_pt: float = 8.0
    color: str = "#000000"
    bold: bool = False


def render_pdf(
    ops: Sequence[Op],
    width_mm: float,
    height_mm: float,
    background: str | None = None,
    texts: Sequence[TextRun] = (),
    title: str = "Smiley Socks print file",
) -> bytes:
    """A one-page PDF at true scale.

    Written by hand rather than with a library for the same reason as the
    rasteriser, and it is less code than it sounds: a PDF page is a stream of
    path operators, and this module already has everything as paths.
    """
    stream: list[str] = []
    # PDF's y axis points up and its origin is bottom-left. Flipping here means
    # every coordinate in this file stays in the same top-left millimetre space
    # as the SVG and the PNG.
    stream.append(f"{PT_PER_MM:.6f} 0 0 -{PT_PER_MM:.6f} 0 {height_mm * PT_PER_MM:.4f} cm")
    stream.append("1 J 1 j")  # round caps and joins, as the brand is drawn

    if background:
        stream.append(_pdf_color(background, stroke=False))
        stream.append(f"0 0 {_n(width_mm)} {_n(height_mm)} re f")

    alphas: dict[float, str] = {}

    def alpha_name(value: float) -> str:
        if value not in alphas:
            alphas[value] = f"GS{len(alphas)}"
        return alphas[value]

    for op in ops:
        stream.append("q")
        if op.opacity < 1:
            stream.append(f"/{alpha_name(round(op.opacity, 4))} gs")
        if op.fill:
            stream.append(_pdf_color(op.fill, stroke=False))
        if op.stroke and op.width > 0:
            stream.append(_pdf_color(op.stroke, stroke=True))
            stream.append(f"{_n(op.width)} w")
        stream.append(_pdf_path(op.d))
        if op.fill and op.stroke and op.width > 0:
            stream.append("B*" if op.even_odd else "B")
        elif op.fill:
            stream.append("f*" if op.even_odd else "f")
        elif op.stroke and op.width > 0:
            stream.append("S")
        else:
            stream.append("n")
        stream.append("Q")

    for run in texts:
        stream.append("q")
        # Text is drawn in an un-flipped frame; otherwise every glyph arrives
        # upside down.
        stream.append(f"1 0 0 -1 0 {height_mm:.4f} cm")
        stream.append("BT")
        stream.append(f"/{'FB' if run.bold else 'FR'} {run.size_pt / PT_PER_MM:.4f} Tf")
        stream.append(_pdf_color(run.color, stroke=False))
        stream.append(f"1 0 0 1 {_n(run.x)} {_n(height_mm - run.y)} Tm")
        stream.append(f"({_pdf_string(run.text)}) Tj")
        stream.append("ET")
        stream.append("Q")

    content = zlib.compress("\n".join(stream).encode("ascii"))

    ext_g_state = ""
    if alphas:
        entries = " ".join(
            f"/{name} << /Type /ExtGState /ca {value} /CA {value} >>" for value, name in alphas.items()
        )
        ext_g_state = f"/ExtGState << {entries} >>"

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width_mm * PT_PER_MM:.4f} "
            f"{height_mm * PT_PER_MM:.4f}] /Contents 4 0 R /Resources << /Font "
            f"<< /FR 5 0 R /FB 6 0 R >> {ext_g_state} >> >>"
        ).encode("latin-1"),
        f"<< /Length {len(content)} /Filter /FlateDecode >>\nstream\n".encode("latin-1")
        + content
        + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        (
            "<< /Title (" + _pdf_string(title) + ") /Creator (Smiley Socks production tooling) >>"
        ).encode("latin-1"),
    ]

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("latin-1") + body + b"\nendobj\n"

    xref = len(out)
    count = len(objects) + 1
    out += f"xref\n0 {count}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode("latin-1")
    out += (
        f"trailer\n<< /Size {count} /Root 1 0 R /Info {len(objects)} 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode("latin-1")
    return bytes(out)


def _pdf_color(value: str, stroke: bool) -> str:
    r, g, b = (c / 255 for c in _rgb(value))
    return f"{r:.4f} {g:.4f} {b:.4f} {'RG' if stroke else 'rg'}"


def _rgb(value: str) -> tuple[int, int, int]:
    from .raster import parse_color

    return parse_color(value)


def _pdf_path(d: str) -> str:
    """Path data as PDF operators. Quadratics are already cubics by the time
    they leave the parser, and PDF has no quadratic operator, so this is a
    direct translation."""
    out: list[str] = []
    for sp in pd.parse_path(d):
        out.append(f"{_n(sp.start[0])} {_n(sp.start[1])} m")
        for seg in sp.segments:
            if seg[0] == "L":
                out.append(f"{_n(seg[1][0])} {_n(seg[1][1])} l")
            else:
                _, c1, c2, end = seg
                out.append(
                    f"{_n(c1[0])} {_n(c1[1])} {_n(c2[0])} {_n(c2[1])} {_n(end[0])} {_n(end[1])} c"
                )
        if sp.closed:
            out.append("h")
    return "\n".join(out)


def _pdf_string(text: str) -> str:
    """A PDF literal string, escaped to pure ASCII.

    The fonts are declared /WinAnsiEncoding, which is Windows-1252 — not
    Latin-1, and the difference is exactly the punctuation this brand writes
    with. Encoding as Latin-1 turned every em dash into a question mark. Bytes
    above 126 are written as octal escapes so the content stream stays ASCII
    whatever the text contains.
    """
    out: list[str] = []
    for byte in text.encode("cp1252", "replace"):
        char = chr(byte)
        if char in "()\\":
            out.append("\\" + char)
        elif 32 <= byte < 127:
            out.append(char)
        else:
            out.append(f"\\{byte:03o}")
    return "".join(out)
