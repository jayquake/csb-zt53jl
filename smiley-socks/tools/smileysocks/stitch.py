"""
Embroidery constraints — what thread can and cannot hold.

The print pipeline was built for ink, where the only real limit is the
supplier's DPI. Thread is a physical object with a minimum size, and a design
that ignores that does not come back wrong-looking, it comes back *different*:
the digitiser silently drops what cannot be stitched, and nobody finds out
until the sample lands.

Three limits matter at the sizes this product prints at:

``MIN_SATIN_MM``
    A satin column narrower than this will not hold — the thread has nothing
    to bite into and the digitiser either drops the column or demotes it to a
    single running stitch, which reads as a hairline rather than a line.

``MIN_ISLAND_MM``
    A detached shape smaller than this cannot be stitched as its own object;
    it becomes a knot, or it is dropped.

``MIN_GAP_MM``
    Two shapes closer than this merge once each has been stitched out to its
    own minimum width, so features that should read as separate run together.

**These are industry-standard defaults, not this supplier's numbers.** A
digitiser working on knit goods may well want more — knit moves under the
needle and a sock has to stretch, which argues for heavier minimums than flat
woven goods. They are constants rather than literals precisely so that
swapping in real numbers is a one-line change that the tests then re-verify.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Narrowest satin column that will hold, in millimetres.
MIN_SATIN_MM = 1.2

#: Smallest detached shape that can be stitched as its own object.
MIN_ISLAND_MM = 1.0

#: Closest two shapes can sit before they merge once stitched.
MIN_GAP_MM = 0.9


@dataclass(frozen=True)
class Violation:
    """One drawable that thread cannot reproduce at this size."""

    #: Index of the offending op within the layout's op list.
    index: int
    kind: str
    #: What the geometry asks for, in millimetres.
    actual_mm: float
    #: What the medium requires.
    required_mm: float

    @property
    def shortfall_mm(self) -> float:
        return self.required_mm - self.actual_mm

    def describe(self) -> str:
        return (
            f"op {self.index}: {self.kind} {self.actual_mm:.2f} mm "
            f"< {self.required_mm:.2f} mm minimum"
        )


@dataclass(frozen=True)
class StitchReport:
    """What a given print file asks of the needle."""

    print_mm: float
    violations: tuple[Violation, ...]
    #: Narrowest and widest stroke actually emitted, in millimetres.
    thinnest_mm: float | None
    thickest_mm: float | None
    #: How many ops had their width raised to the floor.
    clamped: int

    @property
    def native(self) -> bool:
        """Whether the design was stitchable as drawn, with nothing raised.

        Distinct from whether the delivered file is stitchable: ``enforce``
        guarantees that unconditionally. This says whether it had to help.
        """
        return not self.violations

    def as_dict(self) -> dict:
        return {
            "printMm": round(self.print_mm, 2),
            "minSatinMm": MIN_SATIN_MM,
            "minIslandMm": MIN_ISLAND_MM,
            "minGapMm": MIN_GAP_MM,
            # The file written alongside this manifest always complies; this
            # records whether the geometry needed raising to get there.
            "stitchableAsDrawn": self.native,
            "thinnestStrokeMm": (
                None if self.thinnest_mm is None else round(self.thinnest_mm, 3)
            ),
            "thickestStrokeMm": (
                None if self.thickest_mm is None else round(self.thickest_mm, 3)
            ),
            "raisedToFloorOps": self.clamped,
            "raisedFrom": [
                {
                    "index": v.index,
                    "kind": v.kind,
                    "actualMm": round(v.actual_mm, 3),
                    "requiredMm": round(v.required_mm, 3),
                }
                for v in self.violations
            ],
        }

    def summary(self) -> str:
        if self.thinnest_mm is None:
            return f"stitch      no stroked artwork (min {MIN_SATIN_MM} mm)"
        span = f"strokes {self.thinnest_mm:.2f}–{self.thickest_mm:.2f} mm"
        if self.native:
            return f"stitch      ok as drawn · {span} (min {MIN_SATIN_MM} mm)"
        worst = min(self.violations, key=lambda v: v.actual_mm)
        return (
            f"stitch      {self.clamped} stroke(s) raised to the "
            f"{MIN_SATIN_MM} mm floor (thinnest drawn {worst.actual_mm:.2f} mm) · "
            f"as drawn: {span}"
        )


def clamp_width(width_mm: float) -> float:
    """Raise a stroke to the satin floor.

    Applied where millimetres are known rather than in the face geometry,
    because the same face is printed at four placements between roughly 19 and
    49 mm: a weight that is a comfortable satin column on the big leg hit is
    under the floor on the all-over tile. The design intent stays in
    ``face.py``; the physical floor belongs to whatever is being made.
    """
    return max(width_mm, MIN_SATIN_MM)


def enforce(ops, print_mm: float, apply_floor: bool = True):
    """Measure the artwork, then raise anything under the floor.

    Returns the stitchable ops and a report describing what the *original*
    geometry asked for — so the manifest records the design's real intent and
    what had to be changed to make it, rather than quietly showing a file that
    already complies.

    With ``apply_floor=False`` nothing is modified and the report still
    measures: ink has no satin minimum, but knowing where the line would be
    too thin to stitch is worth recording even on a printed file.
    """
    from dataclasses import replace

    report_source = list(ops)
    if not apply_floor:
        return report_source, check_ops(report_source, print_mm, clamped=0)

    out = []
    clamped = 0
    for op in report_source:
        if op.stroke and 0 < op.width < MIN_SATIN_MM:
            out.append(replace(op, width=MIN_SATIN_MM))
            clamped += 1
        else:
            out.append(op)
    return out, check_ops(report_source, print_mm, clamped=clamped)


def check_ops(ops, print_mm: float, clamped: int = 0) -> StitchReport:
    """Measure a layout's stroked ops against what thread can hold.

    Stroke width is exact — ``Op.width`` is already in millimetres by the time
    a layout exists, so this is a comparison rather than an estimate. Island
    and gap minimums are published on the report for the digitiser, but are
    deliberately not asserted here: both need the stitched outline, which does
    not exist until the artwork is digitised.
    """
    widths = [op.width for op in ops if op.stroke and op.width > 0]
    violations = tuple(
        Violation(
            index=i,
            kind="stroke",
            actual_mm=op.width,
            required_mm=MIN_SATIN_MM,
        )
        for i, op in enumerate(ops)
        if op.stroke and 0 < op.width < MIN_SATIN_MM
    )
    return StitchReport(
        print_mm=print_mm,
        violations=violations,
        thinnest_mm=min(widths) if widths else None,
        thickest_mm=max(widths) if widths else None,
        clamped=clamped,
    )
