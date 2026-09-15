"""
Design in, order pack out.

Four files, because a print order needs four different things and bundling them
into one always means somebody re-derives the missing three by hand:

  ``*-print.png``     the raster the supplier's uploader accepts, at their DPI
  ``*-print.svg``     the same artwork as vector, for pre-press
  ``*-proof.pdf``     a true-scale proof with guides and the spec, for sign-off
  ``*-manifest.json`` every number a human might otherwise measure off a screen

The proof is the one that earns its place. It carries the trim line, the print
circles at their real diameter, and the measured drop from the cuff opening — so
"is this the sock we showed the customer" is answered by looking at it, rather
than by trusting that it is.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from .catalog import (
    DONATION_RATE,
    MM_PER_UNIT,
    PRICE,
    colorway_by_id,
    height_by_id,
    placement_by_id,
    print_mm,
)
from .design import Design
from .layout import Layout, build_layout, guide_ops, scaled_ops
from .render import Op, TextRun, render_pdf, render_png, render_svg
from .template import PrintTemplate

#: A4, in millimetres. The proof is a document people print and sign.
PAGE_W_MM = 210.0
PAGE_H_MM = 297.0
MARGIN_MM = 14.0


@dataclass(frozen=True)
class ExportResult:
    files: dict[str, Path]
    manifest: dict
    layout: Layout

    def summary(self) -> str:
        m = self.manifest
        lines = [
            f"{m['design']['label']} — {m['product']['height']}, {m['product']['colorway']}",
            f"  placement   {m['print']['placement']} · {m['print']['diameterMm']} mm"
            f" × {m['print']['count']}",
            f"  canvas      {m['canvas']['widthMm']} × {m['canvas']['heightMm']} mm"
            f"  ({m['canvas']['widthPx']} × {m['canvas']['heightPx']} px @ {m['canvas']['dpi']} DPI)",
        ]
        if m["print"]["dropFromCuffMm"] is not None:
            lines.append(f"  first hit   {m['print']['dropFromCuffMm']} mm below the cuff opening")
        for name, path in self.files.items():
            lines.append(f"  {name:<11} {path}")
        for warning in m["warnings"]:
            lines.append(f"  ! {warning}")
        return "\n".join(lines)


def design_hash(design: Design) -> str:
    """A stable fingerprint of the design, for matching a file to an order."""
    canonical = json.dumps(design.to_dict(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def build_manifest(design: Design, template: PrintTemplate, layout: Layout) -> dict:
    height = height_by_id(design.height_id)
    colorway = colorway_by_id(design.colorway_id)
    placement = placement_by_id(design.placement_id)

    drop = None
    if layout.centres:
        cuff_mm = layout.metrics.landmarks.cuff_end * layout.metrics.wrap_height_mm
        drop = round(layout.centres[0][1] - layout.bleed_mm - cuff_mm, 2)

    warnings: list[str] = []
    if layout.dpi < 150:
        warnings.append(
            f"{layout.dpi} DPI is below the 150 DPI all-over minimum most suppliers publish."
        )
    if template.width_mm is None:
        warnings.append(
            "Canvas measured from our own sock geometry, not a supplier template. "
            "Check it against the vendor's file guidelines before ordering."
        )
    if design.photo is not None:
        warnings.append(
            "This design carries an uploaded photo. The photo is NOT in these files — "
            "only the face is. Composite it in pre-press, or clear it before exporting."
        )
    if design.cuff_text:
        warnings.append(
            f"Cuff text {design.cuff_text!r} is marked as boxes only. Set it in Grinline "
            "at the recorded size; the boxes are position and cap height, not lettering."
        )
    if len(layout.centres) < len(layout.spots):
        warnings.append(
            f"{len(layout.spots) - len(layout.centres)} print(s) fall outside this template "
            "and were dropped. Use the 'wrap' template for a full all-over."
        )

    return {
        "generator": "smileysocks production tooling",
        "designHash": design_hash(design),
        "design": {
            "label": design.label,
            "templateId": design.template_id,
            "finish": design.finish,
            "cuffText": design.cuff_text,
            "face": design.face.to_dict(),
        },
        "product": {
            "height": height.name,
            "heightId": height.id,
            "legCm": height.leg_cm,
            "sizeId": design.size_id,
            "colorway": colorway.name,
            "colorwayId": colorway.id,
            "colors": {"base": colorway.base, "accent": colorway.accent, "ink": colorway.ink},
        },
        "print": {
            "placement": placement.name,
            "placementId": placement.id,
            "diameterMm": round(print_mm(placement), 2),
            "count": len(layout.centres),
            "dropFromCuffMm": drop,
            "centresMm": [[round(x, 2), round(y, 2)] for x, y in layout.centres],
            "mmPerUnit": MM_PER_UNIT,
        },
        "sock": {
            "lengthMm": round(layout.metrics.wrap_height_mm, 2),
            "circumferenceMm": round(layout.metrics.wrap_width_mm, 2),
            "landmarks": {
                "cuffEnd": layout.metrics.landmarks.cuff_end,
                "heel": layout.metrics.landmarks.heel,
                "toeStart": layout.metrics.landmarks.toe_start,
            },
        },
        "canvas": {
            "template": template.id,
            "templateName": template.name,
            "widthMm": round(layout.width_mm, 2),
            "heightMm": round(layout.height_mm, 2),
            "widthPx": layout.width_px,
            "heightPx": layout.height_px,
            "dpi": layout.dpi,
            "bleedMm": layout.bleed_mm,
            "background": template.background,
            "notes": template.notes,
        },
        "pricing": {
            "singleUsd": PRICE["single"],
            "donationRate": DONATION_RATE,
            "donationOnSingleUsd": round(PRICE["single"] * DONATION_RATE, 2),
        },
        "warnings": warnings,
    }


def proof_pdf(design: Design, template: PrintTemplate, layout: Layout, ops: list[Op], manifest: dict) -> bytes:
    """The artwork at true scale where it fits, shrunk to fit where it does not,
    with the scale stated either way."""
    room_w = PAGE_W_MM - MARGIN_MM * 2
    room_h = PAGE_H_MM - MARGIN_MM * 2 - 62  # leave a block for the spec
    scale = min(1.0, room_w / layout.width_mm, room_h / layout.height_mm)

    dx = MARGIN_MM + (room_w - layout.width_mm * scale) / 2
    dy = MARGIN_MM + 8
    placed = scaled_ops(ops + guide_ops(layout), scale, dx, dy)

    ink = "#191710"
    grey = "#5C5A52"
    top = dy + layout.height_mm * scale + 10
    m = manifest

    texts = [
        TextRun(MARGIN_MM, MARGIN_MM, "SMILEY SOCKS — PRODUCTION PROOF", 11, ink, bold=True),
        TextRun(
            PAGE_W_MM - MARGIN_MM - 46,
            MARGIN_MM,
            f"{'TRUE SCALE' if scale > 0.999 else f'SHOWN AT {scale * 100:.0f}%'}",
            8,
            grey,
        ),
        TextRun(MARGIN_MM, top, f"{m['design']['label']}  ·  {m['designHash']}", 10, ink, bold=True),
    ]
    rows = [
        ("Product", f"{m['product']['height']} · size {m['product']['sizeId'].upper()} · {m['product']['colorway']}"),
        ("Placement", f"{m['print']['placement']} · {m['print']['diameterMm']} mm across · x{m['print']['count']}"),
        (
            "Drop from cuff",
            "n/a" if m["print"]["dropFromCuffMm"] is None else f"{m['print']['dropFromCuffMm']} mm to first print centre",
        ),
        ("Canvas", f"{m['canvas']['widthMm']} × {m['canvas']['heightMm']} mm · {m['canvas']['widthPx']} × {m['canvas']['heightPx']} px @ {m['canvas']['dpi']} DPI"),
        ("Bleed", f"{m['canvas']['bleedMm']} mm · red line is the trim"),
        ("Ink", f"{m['product']['colors']['ink']} on {m['product']['colors']['base']}"),
        ("Template", f"{m['canvas']['templateName']} — {m['canvas']['notes']}"),
    ]
    y = top + 7
    for label, value in rows:
        texts.append(TextRun(MARGIN_MM, y, label.upper(), 6.5, grey, bold=True))
        texts.append(TextRun(MARGIN_MM + 28, y, value, 8, ink))
        y += 5.4

    for warning in m["warnings"]:
        y += 1.2
        for line in _wrap(warning, 96):
            texts.append(TextRun(MARGIN_MM, y, line, 7, "#A2401F"))
            y += 3.6

    texts.append(
        TextRun(
            MARGIN_MM,
            PAGE_H_MM - MARGIN_MM,
            f"{int(DONATION_RATE * 100)}% of every order funds mental health support.",
            7,
            grey,
        )
    )

    return render_pdf(
        placed,
        PAGE_W_MM,
        PAGE_H_MM,
        background="#FFFFFF",
        texts=texts,
        title=f"Smiley Socks proof — {m['design']['label']}",
    )


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if len(candidate) > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def export_design(
    design: Design,
    template: PrintTemplate,
    out_dir: Path,
    stem: str | None = None,
    formats: tuple[str, ...] = ("png", "svg", "pdf", "json"),
) -> ExportResult:
    ops, layout = build_layout(design, template)
    manifest = build_manifest(design, template, layout)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = stem or f"{design.slug()}-{template.id}"
    files: dict[str, Path] = {}

    if "png" in formats:
        canvas = render_png(
            ops,
            layout.width_mm,
            layout.height_mm,
            layout.dpi,
            background=layout.background or "#FFFFFF",
        )
        path = out_dir / f"{stem}-print.png"
        canvas.write_png(path, dpi=layout.dpi)
        files["print.png"] = path

    if "svg" in formats:
        path = out_dir / f"{stem}-print.svg"
        path.write_text(
            render_svg(
                ops,
                layout.width_mm,
                layout.height_mm,
                background=layout.background,
                title=f"Smiley Socks — {design.label}",
            ),
            encoding="utf-8",
        )
        files["print.svg"] = path

    if "pdf" in formats:
        path = out_dir / f"{stem}-proof.pdf"
        path.write_bytes(proof_pdf(design, template, layout, ops, manifest))
        files["proof.pdf"] = path

    if "json" in formats:
        path = out_dir / f"{stem}-manifest.json"
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        files["manifest.json"] = path

    return ExportResult(files=files, manifest=manifest, layout=layout)
