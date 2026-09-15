"""
An anti-aliased polygon rasteriser and a PNG writer, in the standard library.

Pillow would do this in three lines. It is not here on purpose: this package's
whole claim is that a print file can be produced anywhere Python runs, and a
production tool that dies on `pip install` in a factory's environment is a
production tool that does not work. zlib is in the standard library, and a
scanline fill is a page of arithmetic.

Quality is not sacrificed for that. Coverage is computed by sampling several
sub-scanlines per pixel row and measuring the *exact* horizontal fraction of
each span, so edges are properly anti-aliased in both directions rather than
stair-stepped vertically the way naive supersampling leaves them.
"""

from __future__ import annotations

import struct
import zlib
from typing import Iterable, Sequence

Pt = tuple[float, float]
RGB = tuple[int, int, int]

#: Sub-scanlines per pixel row. Four is the point where more stops being
#: visible on a printed edge and starts only costing time.
DEFAULT_SAMPLES = 4


def parse_color(value: str | RGB) -> RGB:
    """``#RGB``, ``#RRGGBB``, or an already-unpacked triple."""
    if not isinstance(value, str):
        r, g, b = value
        return (int(r), int(g), int(b))
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(c * 2 for c in text)
    if len(text) != 6:
        raise ValueError(f"unsupported colour {value!r}")
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


class Canvas:
    """An RGB raster. No alpha: a print file is opaque ink on opaque stock, and
    carrying a channel nobody reads would double the memory for nothing."""

    def __init__(self, width: int, height: int, background: str | RGB = "#FFFFFF"):
        if width < 1 or height < 1:
            raise ValueError("canvas must have a positive size")
        self.width = int(width)
        self.height = int(height)
        r, g, b = parse_color(background)
        self.pixels = bytearray(bytes((r, g, b)) * (self.width * self.height))

    # -- drawing ----------------------------------------------------------

    def fill_polygons(
        self,
        polygons: Sequence[Sequence[Pt]],
        color: str | RGB,
        opacity: float = 1.0,
        even_odd: bool = False,
        samples: int = DEFAULT_SAMPLES,
    ) -> None:
        """Fill under the nonzero rule (or even-odd), blending by coverage."""
        if opacity <= 0:
            return
        ink = parse_color(color)
        opacity = min(1.0, max(0.0, opacity))

        ink_bytes = bytes(ink)
        solid = opacity >= 0.998
        pixels = self.pixels

        for y, x0, coverage in self._coverage(polygons, even_odd, samples):
            row = (y * self.width + x0) * 3
            i = 0
            n = len(coverage)
            while i < n:
                cov = coverage[i]
                if cov <= 0.0015:  # below half a per-cent, invisible in print
                    i += 1
                    continue
                if solid and cov >= 0.998:
                    # The interior of any solid shape is a run of fully covered
                    # pixels. Writing it as one slice rather than one Python
                    # loop iteration per pixel is the difference between a
                    # full-wrap sock file taking seconds and taking minutes.
                    j = i + 1
                    while j < n and coverage[j] >= 0.998:
                        j += 1
                    p = row + i * 3
                    pixels[p : p + (j - i) * 3] = ink_bytes * (j - i)
                    i = j
                    continue
                alpha = (cov if cov < 1.0 else 1.0) * opacity
                p = row + i * 3
                inv = 1.0 - alpha
                pixels[p] = int(ink[0] * alpha + pixels[p] * inv + 0.5)
                pixels[p + 1] = int(ink[1] * alpha + pixels[p + 1] * inv + 0.5)
                pixels[p + 2] = int(ink[2] * alpha + pixels[p + 2] * inv + 0.5)
                i += 1

    def fill_rect(self, x: float, y: float, w: float, h: float, color: str | RGB, opacity: float = 1.0) -> None:
        self.fill_polygons([[(x, y), (x + w, y), (x + w, y + h), (x, y + h)]], color, opacity)

    # -- coverage ---------------------------------------------------------

    def _coverage(
        self, polygons: Sequence[Sequence[Pt]], even_odd: bool, samples: int
    ) -> Iterable[tuple[int, int, list[float]]]:
        samples = max(1, int(samples))
        weight = 1.0 / samples

        # Edges, as (y_top, y_bottom, x_at_y_top, dx/dy, winding). Horizontal
        # edges contribute nothing to a scanline crossing and are dropped.
        edges: list[tuple[float, float, float, float, int]] = []
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")
        for poly in polygons:
            n = len(poly)
            if n < 3:
                continue
            for i in range(n):
                x0, y0 = poly[i]
                x1, y1 = poly[(i + 1) % n]
                if x0 < min_x:
                    min_x = x0
                if x0 > max_x:
                    max_x = x0
                if y0 < min_y:
                    min_y = y0
                if y0 > max_y:
                    max_y = y0
                if y0 == y1:
                    continue
                if y0 < y1:
                    edges.append((y0, y1, x0, (x1 - x0) / (y1 - y0), 1))
                else:
                    edges.append((y1, y0, x1, (x0 - x1) / (y0 - y1), -1))

        if not edges:
            return

        bx0 = max(0, int(min_x) - 1)
        bx1 = min(self.width, int(max_x) + 2)
        by0 = max(0, int(min_y) - 1)
        by1 = min(self.height, int(max_y) + 2)
        if bx1 <= bx0 or by1 <= by0:
            return
        bw = bx1 - bx0

        edges.sort(key=lambda e: e[0])
        pending = 0
        active: list[tuple[float, float, float, float, int]] = []
        limit = float(bx1)
        left = float(bx0)

        for y in range(by0, by1):
            acc = [0.0] * bw
            # Runs of whole pixels are accumulated as a difference array and
            # prefix-summed once per row, so a span costs the same whether it
            # is two pixels wide or two thousand.
            delta = [0.0] * (bw + 1)
            touched = False

            for s in range(samples):
                sy = y + (s + 0.5) / samples
                while pending < len(edges) and edges[pending][0] <= sy:
                    active.append(edges[pending])
                    pending += 1
                # Edges are added once their top is reached and dropped once
                # their bottom is passed, so the inner loop only ever walks the
                # handful of edges this scanline actually crosses — not the
                # thousands a flattened face outline produces in total.
                active = [e for e in active if e[1] > sy]
                if len(active) < 2:
                    continue

                crossings = [
                    (x_top + (sy - y_top) * slope, winding)
                    for y_top, _, x_top, slope, winding in active
                ]
                if len(crossings) < 2:
                    continue
                crossings.sort()

                spans: list[tuple[float, float]] = []
                if even_odd:
                    for i in range(0, len(crossings) - 1, 2):
                        spans.append((crossings[i][0], crossings[i + 1][0]))
                else:
                    wind = 0
                    for i in range(len(crossings) - 1):
                        wind += crossings[i][1]
                        if wind != 0:
                            spans.append((crossings[i][0], crossings[i + 1][0]))

                for xa, xb in spans:
                    if xa < left:
                        xa = left
                    if xb > limit:
                        xb = limit
                    if xb <= xa:
                        continue
                    touched = True
                    ia = int(xa)
                    ib = int(xb)
                    if ia == ib:
                        acc[ia - bx0] += (xb - xa) * weight
                        continue
                    acc[ia - bx0] += (ia + 1 - xa) * weight
                    if ib > ia + 1:
                        delta[ia + 1 - bx0] += weight
                        delta[ib - bx0] -= weight
                    if ib < bx1:
                        acc[ib - bx0] += (xb - ib) * weight

            if not touched:
                continue
            running = 0.0
            for i in range(bw):
                running += delta[i]
                if running:
                    acc[i] += running
            yield y, bx0, acc

    # -- output -----------------------------------------------------------

    def to_png_bytes(self, dpi: int | None = None) -> bytes:
        raw = bytearray()
        stride = self.width * 3
        for y in range(self.height):
            raw.append(0)  # filter type 0 (None)
            raw += self.pixels[y * stride : (y + 1) * stride]

        def chunk(tag: bytes, payload: bytes) -> bytes:
            return (
                struct.pack(">I", len(payload))
                + tag
                + payload
                + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
            )

        out = bytearray(b"\x89PNG\r\n\x1a\n")
        out += chunk(b"IHDR", struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0))
        if dpi:
            # pHYs in pixels per metre. Without it a 300 DPI file opens as a
            # wall-sized 72 DPI one, and somebody prints it at the wrong size.
            per_metre = int(round(dpi / 0.0254))
            out += chunk(b"pHYs", struct.pack(">IIB", per_metre, per_metre, 1))
        out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        out += chunk(b"IEND", b"")
        return bytes(out)

    def write_png(self, path, dpi: int | None = None) -> None:
        with open(path, "wb") as handle:
            handle.write(self.to_png_bytes(dpi))

    def pixel(self, x: int, y: int) -> RGB:
        p = (y * self.width + x) * 3
        return (self.pixels[p], self.pixels[p + 1], self.pixels[p + 2])
