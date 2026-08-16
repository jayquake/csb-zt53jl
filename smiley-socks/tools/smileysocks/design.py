"""
A design, as it arrives from the storefront.

The web app writes exactly this shape (``src/store/design.ts``) into
localStorage and into the file the Studio's "Export for production" button
downloads, so a design file is the same record the customer saw on screen.

Loading is defensive for the same reason it is in the app: a file that arrives
here has been through a browser, a download folder and possibly an email. A bad
field should cost you a customisation, never a crash — and never a garbage
print file, which is the expensive failure at this end of the pipeline.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .catalog import COLORWAYS, HEIGHTS, PLACEMENTS, SIZES
from .face import FaceParams, clamp_face

CUFF_TEXT_MAX = 10

#: Characters the Grinline alphabet can draw. Cuff text is knitted, not
#: typeset, so anything outside this is dropped rather than substituted. The
#: fixture test checks this against the real glyph table — a character that
#: survived here but had no glyph would reach the factory as a gap.
GRINLINE_CHARS = frozenset(" !%&'+,-./0123456789:?ABCDEFGHIJKLMNOPQRSTUVWXYZ")


@dataclass(frozen=True)
class Photo:
    """A data URL, exactly as the browser stored it."""

    src: str
    scale: float = 1.0
    x: float = 0.0
    y: float = 0.0


@dataclass(frozen=True)
class Design:
    label: str = "Custom face"
    template_id: str | None = None
    face: FaceParams = field(default_factory=FaceParams)
    height_id: str = "crew"
    size_id: str = "m"
    colorway_id: str = "bone"
    placement_id: str = "cuff"
    photo: Photo | None = None
    cuff_text: str = ""
    #: How the line is printed: chalky and hand-drawn, or a clean vector.
    finish: str = "chalk"

    @staticmethod
    def from_dict(raw: dict[str, Any] | None) -> "Design":
        raw = raw or {}
        base = Design()

        photo_raw = raw.get("photo")
        photo = None
        if isinstance(photo_raw, dict):
            src = photo_raw.get("src")
            # Only data URLs. A design file that could name a remote image would
            # be a design file that could make this tool fetch one.
            if isinstance(src, str) and src.startswith("data:image/"):
                photo = Photo(
                    src=src,
                    scale=_number_in(photo_raw.get("scale"), 0.4, 2.6, 1.0),
                    x=_number_in(photo_raw.get("x"), -60, 60, 0.0),
                    y=_number_in(photo_raw.get("y"), -60, 60, 0.0),
                )

        label = raw.get("label")
        return Design(
            label=label.strip()[:32] if isinstance(label, str) and label.strip() else base.label,
            template_id=raw.get("templateId") if isinstance(raw.get("templateId"), str) else None,
            face=clamp_face(FaceParams.from_dict(raw.get("face"))),
            height_id=_one_of(raw.get("heightId"), [h.id for h in HEIGHTS], base.height_id),
            size_id=_one_of(raw.get("sizeId"), [s[0] for s in SIZES], base.size_id),
            colorway_id=_one_of(raw.get("colorwayId"), [c.id for c in COLORWAYS], base.colorway_id),
            placement_id=_one_of(
                raw.get("placementId"), [p.id for p in PLACEMENTS], base.placement_id
            ),
            photo=photo,
            cuff_text=normalise_cuff_text(
                raw.get("cuffText") if isinstance(raw.get("cuffText"), str) else ""
            ),
            finish="clean" if raw.get("finish") == "clean" else "chalk",
        )

    @staticmethod
    def load(path: str | Path) -> "Design":
        with open(path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        # Accept both a bare design and the wrapper the storefront exports,
        # which carries the design under "design" alongside its metadata.
        if isinstance(raw, dict) and isinstance(raw.get("design"), dict):
            raw = raw["design"]
        if not isinstance(raw, dict):
            raise ValueError("design file must contain a JSON object")
        return Design.from_dict(raw)

    def to_dict(self) -> dict[str, Any]:
        return {
            "templateId": self.template_id,
            "label": self.label,
            "face": self.face.to_dict(),
            "heightId": self.height_id,
            "sizeId": self.size_id,
            "colorwayId": self.colorway_id,
            "placementId": self.placement_id,
            "photo": None
            if self.photo is None
            else {
                "src": self.photo.src,
                "scale": self.photo.scale,
                "x": self.photo.x,
                "y": self.photo.y,
            },
            "cuffText": self.cuff_text,
            "finish": self.finish,
        }

    def slug(self) -> str:
        """A filename that says what it is, without saying anything unsafe."""
        keep = [c.lower() if c.isalnum() else "-" for c in self.label]
        stem = "".join(keep).strip("-")
        while "--" in stem:
            stem = stem.replace("--", "-")
        return stem or "design"


def normalise_cuff_text(raw: str) -> str:
    return "".join(c for c in raw.upper() if c in GRINLINE_CHARS)[:CUFF_TEXT_MAX]


def _one_of(value: Any, allowed: list[str], fallback: str) -> str:
    return value if isinstance(value, str) and value in allowed else fallback


def _number_in(value: Any, lo: float, hi: float, fallback: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    return min(hi, max(lo, float(value)))
