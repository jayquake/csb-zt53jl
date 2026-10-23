"""
The export pipeline.

These tests care about one question: would this file, sent to a manufacturer,
come back as the sock the customer saw? So they check millimetres and pixels —
where the print lands, how big it is, that it survives the wrap seam — rather
than that a function returned without raising.
"""

from __future__ import annotations

import json
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

from smileysocks import pathdata as pd
from smileysocks.catalog import placement_by_id, print_mm
from smileysocks.design import Design
from smileysocks.export import export_design
from smileysocks.layout import build_layout, face_ops, guide_ops
from smileysocks.raster import Canvas
from smileysocks.render import MM_PER_INCH, render_png
from smileysocks.sock import sock_metrics
from smileysocks.template import CHOSEN_SUPPLIER, SUPPLIER_TEMPLATES, template_by_id

SMITTEN = {
    "label": "Smitten",
    "heightId": "crew",
    "colorwayId": "midnight",
    "placementId": "cuff",
    "face": {
        "gap": 360,
        "eyes": {"shape": "heart", "x": 30, "y": 80, "size": 15},
        "mouth": {"y": 136, "width": 56, "curve": 0.85, "flick": 0.6},
        "marks": [],
    },
}


def png_header(data: bytes) -> dict:
    """Width, height and pixel density, read back out of the file."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    info: dict = {}
    i = 8
    while i < len(data):
        (length,) = struct.unpack(">I", data[i : i + 4])
        tag = data[i + 4 : i + 8]
        payload = data[i + 8 : i + 8 + length]
        if tag == b"IHDR":
            w, h, depth, color = struct.unpack(">IIBB", payload[:10])
            info.update(width=w, height=h, depth=depth, color=color)
        elif tag == b"pHYs":
            x_ppm, _, unit = struct.unpack(">IIB", payload)
            info["dpi"] = round(x_ppm * 0.0254) if unit == 1 else None
        elif tag == b"IEND":
            break
        i += 12 + length
    return info


class RasterTest(unittest.TestCase):
    """The rasteriser, before anything trusts it with artwork."""

    def test_a_solid_rectangle_is_solid(self) -> None:
        c = Canvas(20, 20, "#FFFFFF")
        c.fill_rect(5, 5, 10, 10, "#000000")
        self.assertEqual(c.pixel(10, 10), (0, 0, 0))
        self.assertEqual(c.pixel(2, 2), (255, 255, 255))
        # The boundary is exact, not blurred: an integer-aligned edge should
        # not bleed into the pixel outside it.
        self.assertEqual(c.pixel(4, 10), (255, 255, 255))
        self.assertEqual(c.pixel(5, 10), (0, 0, 0))

    def test_edges_are_anti_aliased(self) -> None:
        c = Canvas(20, 20, "#FFFFFF")
        # Half-covering a column of pixels should land near mid-grey, not snap
        # to black or white.
        c.fill_rect(5.5, 0, 10, 20, "#000000")
        value = c.pixel(5, 10)[0]
        self.assertTrue(100 < value < 160, f"expected a half-covered pixel, got {value}")

    def test_nonzero_unions_overlapping_shapes(self) -> None:
        # This is what makes stroking work: overlapping, consistently-wound
        # quads and joint discs have to merge, not cancel.
        c = Canvas(30, 30, "#FFFFFF")
        square = [(5, 5), (20, 5), (20, 20), (5, 20)]
        shifted = [(x + 5, y + 5) for x, y in square]
        c.fill_polygons([square, shifted], "#000000")
        self.assertEqual(c.pixel(15, 15), (0, 0, 0))  # the overlap stays filled

    def test_even_odd_punches_a_hole(self) -> None:
        c = Canvas(40, 40, "#FFFFFF")
        outer = [(5, 5), (35, 5), (35, 35), (5, 35)]
        inner = [(15, 15), (25, 15), (25, 25), (15, 25)]
        c.fill_polygons([outer, inner], "#000000", even_odd=True)
        self.assertEqual(c.pixel(10, 20), (0, 0, 0))
        self.assertEqual(c.pixel(20, 20), (255, 255, 255))

    def test_opacity_blends(self) -> None:
        c = Canvas(10, 10, "#000000")
        c.fill_rect(0, 0, 10, 10, "#FFFFFF", opacity=0.5)
        self.assertTrue(120 <= c.pixel(5, 5)[0] <= 135)

    def test_png_round_trips_its_own_header(self) -> None:
        c = Canvas(7, 11, "#123456")
        info = png_header(c.to_png_bytes(dpi=300))
        self.assertEqual((info["width"], info["height"]), (7, 11))
        self.assertEqual(info["dpi"], 300)
        self.assertEqual(info["color"], 2)  # truecolour RGB

    def test_shapes_off_canvas_do_not_crash_or_wrap(self) -> None:
        c = Canvas(10, 10, "#FFFFFF")
        c.fill_rect(-50, -50, 20, 20, "#000000")  # overlaps only the corner
        self.assertEqual(c.pixel(9, 9), (255, 255, 255))
        c.fill_rect(100, 100, 5, 5, "#000000")  # entirely outside
        self.assertEqual(c.pixel(5, 5), (255, 255, 255))


class PathTest(unittest.TestCase):
    def test_quadratics_are_raised_to_cubics(self) -> None:
        # face.ts writes Q for the arc eye and the sparkle; PDF has no
        # quadratic operator, so nothing downstream may ever see one.
        subpaths = pd.parse_path("M0,0 Q10,20 20,0")
        self.assertEqual(len(subpaths), 1)
        self.assertEqual([s[0] for s in subpaths[0].segments], ["C"])
        end = subpaths[0].segments[0][-1]
        self.assertEqual(end, (20.0, 0.0))

    def test_a_curve_flattens_near_its_true_midpoint(self) -> None:
        points = pd.flatten(pd.parse_path("M0,0 Q10,20 20,0"), 0.05)[0]
        # A quadratic's midpoint is a quarter of the way to the control point.
        mid = min(points, key=lambda p: abs(p[0] - 10))
        self.assertAlmostEqual(mid[1], 10.0, delta=0.2)

    def test_stroke_outline_covers_the_line(self) -> None:
        polys = pd.stroke_to_polygons([[(0, 0), (10, 0)]], 4.0)
        box = pd.bounds(polys)
        self.assertAlmostEqual(box[1], -2.0, delta=0.05)  # half the width, above
        self.assertAlmostEqual(box[3], 2.0, delta=0.05)
        self.assertLess(box[0], 0.0)  # round caps overhang the ends
        self.assertGreater(box[2], 10.0)

    def test_transform_composition_order(self) -> None:
        # Scale then translate is not translate then scale, and getting this
        # backwards would put every face in the wrong place.
        t = pd.Transform.scaled(2).then(pd.Transform.translate(10, 0))
        self.assertEqual(t.apply((3, 0)), (16.0, 0.0))


class LayoutTest(unittest.TestCase):
    def test_the_print_is_the_size_the_customer_was_quoted(self) -> None:
        design = Design.from_dict(SMITTEN)
        template = template_by_id("wrap")
        ops, layout = build_layout(design, template)
        self.assertAlmostEqual(layout.print_mm, print_mm(placement_by_id("cuff")), places=6)
        self.assertAlmostEqual(layout.print_mm, 28.9, places=4)

        # And the drawn artwork really is that many millimetres across, rather
        # than merely being labelled so. Measured on a ringed face, whose
        # outline spans the whole face box — that is what FACE_SPAN calibrates,
        # and a bare face is deliberately smaller than its own box.
        ringed = Design.from_dict({**SMITTEN, "face": {**SMITTEN["face"], "gap": 0}})
        art = face_ops(ringed, 0, 0, layout.print_mm, layout.ink)
        box = pd.bounds(pd.flatten([s for op in art for s in pd.parse_path(op.d)], 0.02))
        self.assertIsNotNone(box)
        # A stroke straddles its path, so half of it lies outside those bounds.
        overhang = max(op.width for op in art if op.stroke) / 2
        width = (box[2] - box[0]) + overhang * 2
        # A default-width face is 144 units across plus a 10-unit stroke — 154
        # of the 160-unit span — so it lands a few per cent inside its nominal
        # box. That margin is deliberate; a face printing *over* its quoted
        # size is the failure worth catching.
        self.assertAlmostEqual(
            width,
            layout.print_mm,
            delta=1.5,
            msg=f"face measured {width:.2f}mm against a {layout.print_mm}mm print",
        )

    def test_canvas_is_the_sock_laid_flat(self) -> None:
        design = Design.from_dict(SMITTEN)
        template = template_by_id("wrap")
        _, layout = build_layout(design, template)
        metrics = sock_metrics(21)
        self.assertAlmostEqual(layout.width_mm, metrics.wrap_width_mm + 6, places=6)
        self.assertAlmostEqual(layout.height_mm, metrics.wrap_height_mm + 6, places=6)

    def test_the_hit_sits_below_the_cuff_ribbing(self) -> None:
        design = Design.from_dict(SMITTEN)
        _, layout = build_layout(design, template_by_id("wrap"))
        cuff_mm = layout.metrics.landmarks.cuff_end * layout.metrics.wrap_height_mm
        cy = layout.centres[0][1] - layout.bleed_mm
        # Below the ribbing, and above the heel — the Stance spot.
        self.assertGreater(cy - layout.print_mm / 2, cuff_mm)
        self.assertLess(cy, layout.metrics.landmarks.heel * layout.metrics.wrap_height_mm)

    def test_cuff_text_never_reaches_the_print_file(self) -> None:
        # A placeholder inside the print file is a placeholder that gets
        # printed onto somebody's sock.
        design = Design.from_dict({**SMITTEN, "cuffText": "HELLO"})
        ops, layout = build_layout(design, template_by_id("wrap"))
        self.assertTrue(layout.text_guides, "the proof still needs the boxes")
        for box in layout.text_guides:
            self.assertNotIn(box, ops)
        self.assertTrue(set(layout.text_guides).issubset(set(guide_ops(layout))))

    def test_artwork_template_is_just_the_print(self) -> None:
        design = Design.from_dict(SMITTEN)
        template = template_by_id("artwork")
        _, layout = build_layout(design, template)
        self.assertAlmostEqual(layout.width_mm, layout.print_mm + template.bleed_mm * 2, places=6)
        self.assertEqual(layout.width_mm, layout.height_mm)
        self.assertIsNone(layout.background)


class WrapSeamTest(unittest.TestCase):
    """The left and right edges of a wrap are the same seam on the sock."""

    def test_an_all_over_print_continues_across_the_seam(self) -> None:
        design = Design.from_dict({**SMITTEN, "placementId": "allover", "colorwayId": "bone"})
        ops, layout = build_layout(design, template_by_id("wrap"))
        canvas = render_png(ops, layout.width_mm, layout.height_mm, 72, layout.background)

        ink = tuple(int(layout.ink.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))

        def has_ink(x: int) -> bool:
            return any(
                sum(abs(a - b) for a, b in zip(canvas.pixel(x, y), ink)) < 90
                for y in range(canvas.height)
            )

        # An all-over row starts at u=0, so ink must appear hard against both
        # edges. Drawn without wrapping, the right edge is bare.
        self.assertTrue(has_ink(0), "no ink on the left edge")
        self.assertTrue(has_ink(canvas.width - 1), "print does not continue across the seam")

    def test_the_heel_is_drawn_on_both_sides_of_the_seam(self) -> None:
        design = Design.from_dict(SMITTEN)
        ops, layout = build_layout(design, template_by_id("wrap"))
        # The heel is centred at u=0.75 and is 0.6 of the circumference wide,
        # so it necessarily overhangs. Two ellipses, not one.
        ellipses = [op for op in ops if op.fill and op.d.count("C") == 4]
        self.assertGreaterEqual(len(ellipses), 2, "the heel was not wrapped round the seam")


class VendorChoiceTest(unittest.TestCase):
    """The supplier decision is recorded, but it is not a licence to guess a
    template. `CHOSEN_SUPPLIER` names who we're printing with; it must never
    grow the kind of invented width_mm/height_mm that SUPPLIER_TEMPLATES
    exists to keep out."""

    def test_the_decision_is_recorded(self) -> None:
        v = CHOSEN_SUPPLIER
        self.assertTrue(v.supplier)
        self.assertTrue(v.product)
        self.assertTrue(v.url.startswith("https://"))
        self.assertGreater(v.price_usd, 0)
        self.assertGreater(v.size_count, 0)
        self.assertTrue(v.reasoning)

    def test_the_template_is_not_guessed(self) -> None:
        # This is the actual point of the split: naming a vendor must not
        # quietly grow into a fabricated print-file template. The moment a
        # real one is confirmed it belongs in SUPPLIER_TEMPLATES, not here.
        self.assertTrue(CHOSEN_SUPPLIER.still_needed, "should say what's missing until it isn't")
        self.assertNotIn("printful-socks", SUPPLIER_TEMPLATES)

    def test_naming_a_vendor_does_not_change_what_export_does(self) -> None:
        # Recording CHOSEN_SUPPLIER must be inert: it exists to be read, not
        # to alter template_by_id's behaviour for anyone who doesn't ask for
        # it by id.
        design = Design.from_dict(SMITTEN)
        ops, layout = build_layout(design, template_by_id("wrap"))
        self.assertIsNone(template_by_id("wrap").width_mm)
        self.assertGreater(layout.width_mm, 0)
        self.assertTrue(ops)


class ExportTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.out = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_a_full_export_writes_the_order_pack(self) -> None:
        result = export_design(Design.from_dict(SMITTEN), template_by_id("wrap"), self.out)
        self.assertEqual(
            set(result.files), {"print.png", "print.svg", "proof.pdf", "manifest.json"}
        )
        for path in result.files.values():
            self.assertTrue(path.exists() and path.stat().st_size > 0, path)

    def test_the_png_is_the_pixel_size_the_manifest_claims(self) -> None:
        result = export_design(Design.from_dict(SMITTEN), template_by_id("wrap"), self.out)
        info = png_header(result.files["print.png"].read_bytes())
        canvas = result.manifest["canvas"]
        self.assertEqual(info["width"], canvas["widthPx"])
        self.assertEqual(info["height"], canvas["heightPx"])
        self.assertEqual(info["dpi"], canvas["dpi"])
        # And the pixels really are that many per millimetre.
        self.assertAlmostEqual(
            info["width"] / canvas["widthMm"], canvas["dpi"] / MM_PER_INCH, places=1
        )

    def test_dpi_override_scales_the_file_not_the_artwork(self) -> None:
        design = Design.from_dict(SMITTEN)
        base = export_design(design, template_by_id("wrap"), self.out, stem="a", formats=("json",))
        hi = export_design(
            design,
            template_by_id("wrap").with_overrides(dpi=300),
            self.out,
            stem="b",
            formats=("json",),
        )
        self.assertEqual(base.manifest["canvas"]["widthMm"], hi.manifest["canvas"]["widthMm"])
        # Doubling the DPI doubles the pixels, give or take the rounding of
        # a canvas whose millimetre width is not a whole number of pixels.
        self.assertAlmostEqual(
            base.manifest["canvas"]["widthPx"] * 2, hi.manifest["canvas"]["widthPx"], delta=1
        )

    def test_svg_is_well_formed_and_sized_in_millimetres(self) -> None:
        result = export_design(
            Design.from_dict(SMITTEN), template_by_id("wrap"), self.out, formats=("svg", "json")
        )
        root = ET.parse(result.files["print.svg"]).getroot()
        canvas = result.manifest["canvas"]
        self.assertTrue(root.get("width").endswith("mm"))
        self.assertAlmostEqual(float(root.get("width")[:-2]), canvas["widthMm"], places=1)
        self.assertGreater(len(root.findall("{http://www.w3.org/2000/svg}path")), 3)

    def test_pdf_is_a4_and_structurally_complete(self) -> None:
        result = export_design(
            Design.from_dict(SMITTEN), template_by_id("wrap"), self.out, formats=("pdf",)
        )
        data = result.files["proof.pdf"].read_bytes()
        self.assertTrue(data.startswith(b"%PDF-1.4"))
        self.assertTrue(data.rstrip().endswith(b"%%EOF"))
        self.assertIn(b"/MediaBox [0 0 595.2756 841.8898]", data)  # A4 in points
        # The xref offsets have to point at real objects or readers reject it.
        tail = data.rsplit(b"startxref", 1)[1]
        offset = int(tail.strip().split()[0])
        self.assertEqual(data[offset : offset + 4], b"xref")

    def test_the_proof_carries_the_spec_as_readable_text(self) -> None:
        design = Design.from_dict({**SMITTEN, "label": "Smitten"})
        result = export_design(design, template_by_id("wrap"), self.out, formats=("pdf", "json"))
        data = result.files["proof.pdf"].read_bytes()
        stream = data.split(b"stream\n", 1)[1].rsplit(b"\nendstream", 1)[0]
        text = zlib.decompress(stream).decode("ascii")
        self.assertIn("PRODUCTION PROOF", text)
        self.assertIn(result.manifest["designHash"], text)
        self.assertIn("28.9 mm", text)
        # WinAnsi punctuation must survive as escapes, not as question marks.
        self.assertIn(r"\227", text)

    def test_manifest_records_what_pre_press_would_otherwise_measure(self) -> None:
        result = export_design(
            Design.from_dict(SMITTEN), template_by_id("wrap"), self.out, formats=("json",)
        )
        m = json.loads(result.files["manifest.json"].read_text())
        self.assertEqual(m["print"]["diameterMm"], 28.9)
        self.assertEqual(m["print"]["count"], 1)
        self.assertGreater(m["print"]["dropFromCuffMm"], 0)
        self.assertEqual(m["product"]["colors"]["ink"], "#F5F0E4")
        self.assertEqual(m["pricing"]["donationOnSingleUsd"], 1.8)
        self.assertEqual(len(m["designHash"]), 16)

    def test_the_hash_tracks_the_design_and_nothing_else(self) -> None:
        a = export_design(Design.from_dict(SMITTEN), template_by_id("wrap"), self.out, stem="a", formats=("json",))
        b = export_design(Design.from_dict(SMITTEN), template_by_id("artwork"), self.out, stem="b", formats=("json",))
        changed = export_design(
            Design.from_dict({**SMITTEN, "colorwayId": "clay"}),
            template_by_id("wrap"),
            self.out,
            stem="c",
            formats=("json",),
        )
        self.assertEqual(a.manifest["designHash"], b.manifest["designHash"])
        self.assertNotEqual(a.manifest["designHash"], changed.manifest["designHash"])

    def test_warnings_fire_on_the_things_that_ruin_a_run(self) -> None:
        def warnings_for(design_over: dict, template_over: dict | None = None) -> str:
            template = template_by_id("wrap")
            if template_over:
                template = template.with_overrides(**template_over)
            result = export_design(
                Design.from_dict({**SMITTEN, **design_over}), template, self.out, formats=()
            )
            return " ".join(result.manifest["warnings"])

        self.assertIn("150 DPI", warnings_for({}, {"dpi": 72}))
        self.assertIn("photo", warnings_for({"photo": {"src": "data:image/png;base64,iVBORw0KGgo="}}))
        self.assertIn("Grinline", warnings_for({"cuffText": "HI"}))
        # The default canvas is our own derivation and must say so, every time.
        self.assertIn("supplier template", warnings_for({}))
        # A supplied canvas is not second-guessed.
        self.assertNotIn(
            "supplier template", warnings_for({}, {"width_mm": 200.0, "height_mm": 400.0})
        )

    def test_a_panel_drops_prints_it_cannot_hold_and_says_so(self) -> None:
        result = export_design(
            Design.from_dict({**SMITTEN, "placementId": "allover"}),
            template_by_id("panel"),
            self.out,
            formats=("json",),
        )
        m = result.manifest
        self.assertLess(m["print"]["count"], len(build_layout(
            Design.from_dict({**SMITTEN, "placementId": "allover"}), template_by_id("wrap")
        )[1].spots))
        self.assertTrue(any("dropped" in w for w in m["warnings"]))


if __name__ == "__main__":
    unittest.main()
