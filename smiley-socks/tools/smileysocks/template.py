"""
Print templates: what shape of file the manufacturer wants.

**Read this before sending anything to a supplier.** The dimensions here are
*our* derivation, measured from the sock geometry the storefront previews — a
full wrap is the leg circumference by the centreline length, because that is
what the sock actually is. They are honest numbers and they are the right
starting point, but they are not any particular vendor's official template.

Print-on-demand suppliers publish a template pack per product, and the sizes
differ between them and change over time. Printful, for instance, asks you to
download the template from the product's own "File guidelines" tab rather than
quoting one number for socks, and requires at least 150 DPI for all-over print
(300 recommended). So: fetch the template for the exact product you are
ordering, and pass its dimensions with ``--width-mm/--height-mm/--dpi``, or add
it to ``SUPPLIER_TEMPLATES`` once you have it in hand.

The vendor itself — which supplier, which product — is a separate decision
from the template dimensions, and it is locked in: see ``CHOSEN_SUPPLIER``
below. What is not locked in yet is that product's exact print-file template,
which is why it is not in ``SUPPLIER_TEMPLATES``.

What the geometry buys you regardless of vendor is proportion. Whatever canvas
the supplier specifies, the print lands the correct number of millimetres below
the cuff, at the millimetre size the customer was quoted, because both come from
the same measurements.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .sock import SockMetrics

#: Printful's published floor for all-over print, and its recommendation.
#: These two are vendor guidance, not our invention.
MIN_ALLOVER_DPI = 150
RECOMMENDED_DPI = 300


@dataclass(frozen=True)
class PrintTemplate:
    id: str
    name: str
    #: 'wrap' prints the whole sock (sublimation); 'panel' prints only the
    #: area around the hit; 'artwork' is the print alone, for whoever is
    #: applying it.
    kind: str
    dpi: int
    bleed_mm: float
    #: Whether the sock's own colour is part of the file. It is for
    #: sublimation onto white blanks; it is not for a knitted sock, where the
    #: yarn is the colour and printing it would be printing over the knit.
    background: bool
    notes: str
    #: Set only when a supplier has specified the canvas. None means "measure
    #: the sock", which is what the default templates do.
    width_mm: float | None = None
    height_mm: float | None = None

    def canvas_mm(self, metrics: SockMetrics, print_mm: float) -> tuple[float, float]:
        """The finished canvas, bleed included."""
        if self.width_mm is not None and self.height_mm is not None:
            return (self.width_mm, self.height_mm)
        if self.kind == "artwork":
            side = print_mm + self.bleed_mm * 2
            return (side, side)
        if self.kind == "panel":
            # The leg panel: full circumference, and enough length to hold the
            # hits with room to breathe.
            return (
                metrics.wrap_width_mm + self.bleed_mm * 2,
                metrics.wrap_height_mm * metrics.landmarks.heel + self.bleed_mm * 2,
            )
        return (
            metrics.wrap_width_mm + self.bleed_mm * 2,
            metrics.wrap_height_mm + self.bleed_mm * 2,
        )

    def with_overrides(
        self,
        width_mm: float | None = None,
        height_mm: float | None = None,
        dpi: int | None = None,
        bleed_mm: float | None = None,
        background: bool | None = None,
    ) -> "PrintTemplate":
        return replace(
            self,
            width_mm=self.width_mm if width_mm is None else width_mm,
            height_mm=self.height_mm if height_mm is None else height_mm,
            dpi=self.dpi if dpi is None else int(dpi),
            bleed_mm=self.bleed_mm if bleed_mm is None else bleed_mm,
            background=self.background if background is None else background,
        )


TEMPLATES: tuple[PrintTemplate, ...] = (
    PrintTemplate(
        id="wrap",
        name="Full wrap (sublimation)",
        kind="wrap",
        # 150 rather than 300 by default: it is the published all-over minimum,
        # and it keeps a crew-length wrap around 1000x2200 rather than a
        # 9-megapixel file most uploaders reject for size. Pass --dpi 300 when
        # the supplier asks for it.
        dpi=MIN_ALLOVER_DPI,
        bleed_mm=3.0,
        background=True,
        notes=(
            "Sock laid flat and opened out: width is the leg circumference, "
            "height is the centreline from cuff opening to toe."
        ),
    ),
    PrintTemplate(
        id="panel",
        name="Leg panel",
        kind="panel",
        dpi=RECOMMENDED_DPI,
        bleed_mm=3.0,
        background=False,
        notes="Cuff down to the heel only — for placement print on a finished sock.",
    ),
    PrintTemplate(
        id="artwork",
        name="Artwork only",
        kind="artwork",
        dpi=RECOMMENDED_DPI,
        bleed_mm=2.0,
        background=False,
        notes="The face alone, at its true printed size. For vinyl, DTG or embroidery digitising.",
    ),
)

#: Canvases a supplier has actually specified. Empty on purpose — adding one you
#: have not read off the vendor's own template pack is how a run gets misprinted.
SUPPLIER_TEMPLATES: dict[str, PrintTemplate] = {}


@dataclass(frozen=True)
class VendorChoice:
    """Who we're printing with, and why — kept separate from
    ``SUPPLIER_TEMPLATES`` on purpose. This records a decision; it is not a
    template, and it must never grow a ``width_mm``/``height_mm`` that someone
    guessed rather than read off the vendor's own product page."""

    supplier: str
    product: str
    url: str
    price_usd: float
    #: Count only — the exact size labels/ranges were not visible on the
    #: public product page and must not be guessed here.
    size_count: int
    print_method: str
    minimum_order: str
    reasoning: str
    #: What is still missing before `wrap` can be replaced with a real
    #: SUPPLIER_TEMPLATES entry for this product.
    still_needed: str


#: Locked in 2026-08-16. Chosen over Printify (broker model — print quality
#: varies by which third-party provider fulfils the order, vs. Printful
#: owning and running its own facilities) and over Printful's own "Black Foot
#: Sublimated Socks" (fixed black sole with no cuff/heel/toe colour control,
#: and multiple reviewers report white fabric/stitching showing through on
#: darker prints). This product is a true all-over blank: cuff, heel, toe and
#: leg colour all come from the print file, which is what our colorway
#: system in `catalog.py` already assumes — it maps directly onto the `wrap`
#: template above rather than needing a new `kind`.
CHOSEN_SUPPLIER = VendorChoice(
    supplier="Printful",
    product="Sublimation Socks",
    url="https://www.printful.com/custom/socks/personalized/sublimation-socks",
    price_usd=7.0,
    size_count=3,
    print_method="dye sublimation, true all-over print, cushioned sole",
    minimum_order="none",
    reasoning=(
        "Printful owns and runs its own fulfilment (more consistent print "
        "quality than Printify's third-party network), and this specific "
        "product is a genuine all-over blank rather than a fixed-colour sole "
        "— it matches how our colorway system already treats the whole sock "
        "as printable, cuff to toe."
    ),
    still_needed=(
        "The actual print-file template — pixel dimensions, DPI, bleed — "
        "sits behind Printful's product configurator (add the product in a "
        "Printful account, then its own 'File guidelines' tab), not on the "
        "public product page. Until someone with account access pulls that, "
        "`wrap`'s canvas stays measured from our own sock geometry — real "
        "proportions, but not Printful's exact numbers. Once you have them: "
        "add a 'printful-socks' entry to SUPPLIER_TEMPLATES with the real "
        "width_mm/height_mm/dpi, and pass --template printful-socks."
    ),
)


def template_by_id(template_id: str) -> PrintTemplate:
    for t in TEMPLATES:
        if t.id == template_id:
            return t
    if template_id in SUPPLIER_TEMPLATES:
        return SUPPLIER_TEMPLATES[template_id]
    known = ", ".join([t.id for t in TEMPLATES] + sorted(SUPPLIER_TEMPLATES))
    raise KeyError(f"unknown template {template_id!r}; known templates: {known}")
