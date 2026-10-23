"""
The needle's limits, enforced.

These tests exist because the failure they guard against is silent: a stroke
under the satin minimum does not come back looking thin, it comes back
*missing*, and only once a sample has been stitched.
"""

from __future__ import annotations

import unittest

from smileysocks import stitch
from smileysocks.design import Design
from smileysocks.layout import build_layout
from smileysocks.render import Op
from smileysocks.template import template_by_id


def stroked(width_mm: float) -> Op:
    return Op(d="M0,0 L1,1", stroke="#000", width=width_mm)


class TestFloor(unittest.TestCase):
    def test_raises_only_what_is_under_the_minimum(self):
        ops = [stroked(0.5), stroked(stitch.MIN_SATIN_MM), stroked(3.0)]
        out, report = stitch.enforce(ops, print_mm=29.0)

        self.assertEqual([o.width for o in out], [stitch.MIN_SATIN_MM, stitch.MIN_SATIN_MM, 3.0])
        self.assertEqual(report.clamped, 1)
        self.assertFalse(report.native)

    def test_reports_the_geometry_as_designed_not_as_delivered(self):
        """The report has to describe intent, or it cannot flag a problem."""
        out, report = stitch.enforce([stroked(0.5)], print_mm=29.0)

        self.assertEqual(out[0].width, stitch.MIN_SATIN_MM)   # delivered: legal
        self.assertEqual(report.thinnest_mm, 0.5)             # designed: not
        self.assertEqual(report.violations[0].actual_mm, 0.5)

    def test_apply_floor_false_changes_nothing_but_still_measures(self):
        out, report = stitch.enforce([stroked(0.5)], print_mm=29.0, apply_floor=False)

        self.assertEqual(out[0].width, 0.5)
        self.assertEqual(report.clamped, 0)
        self.assertFalse(report.native)

    def test_fills_are_left_alone(self):
        fill = Op(d="M0,0 L1,1", fill="#000")
        out, report = stitch.enforce([fill], print_mm=29.0)

        self.assertEqual(out, [fill])
        self.assertIsNone(report.thinnest_mm)
        self.assertTrue(report.native)


class TestEveryPlacementShipsStitchable(unittest.TestCase):
    def test_no_placement_emits_a_stroke_under_the_minimum(self):
        for placement in ("cuff", "leg", "stacked", "allover"):
            with self.subTest(placement=placement):
                ops, layout = build_layout(
                    Design(placement_id=placement), template_by_id("wrap")
                )
                widths = [o.width for o in ops if o.stroke and o.width > 0]
                self.assertTrue(widths, "expected stroked artwork")
                self.assertGreaterEqual(min(widths), stitch.MIN_SATIN_MM)
                self.assertIsNotNone(layout.stitch)

    def test_allover_is_the_placement_that_needs_help(self):
        """Documents a real finding: at 18.7 mm even the main stroke is under
        the floor, so the all-over tile cannot be embroidered as drawn."""
        _, layout = build_layout(Design(placement_id="allover"), template_by_id("wrap"))
        self.assertFalse(layout.stitch.native)

        _, cuff = build_layout(Design(placement_id="cuff"), template_by_id("wrap"))
        self.assertTrue(cuff.stitch.native)

    def test_disabling_the_floor_lets_thin_strokes_through(self):
        ops, layout = build_layout(
            Design(placement_id="allover"), template_by_id("wrap"), stitch_floor=False
        )
        widths = [o.width for o in ops if o.stroke and o.width > 0]
        self.assertLess(min(widths), stitch.MIN_SATIN_MM)
        self.assertEqual(layout.stitch.clamped, 0)


if __name__ == "__main__":
    unittest.main()
