"""
What we sell, and how big the print is — ported from ``src/store/catalog.ts``
and the placement half of ``src/three/texture.ts``.

Placement is a product fact, not a styling choice: the cuff hit is where Stance
puts its mark and at Stance's footprint, the studio quotes that size in
millimetres, and this module is what turns the quote into a position on a print
file. If the two disagreed, the sock would arrive with a print the customer was
never shown.
"""

from __future__ import annotations

from dataclasses import dataclass

from .sock import Landmarks

#: The sock is drawn in a 380x480 box; one unit is 0.85 mm on a real sock,
#: from a leg panel 100 units wide (85 mm laid flat), a standard adult crew.
#: Every print size is derived from this, so quoted millimetres are honest.
MM_PER_UNIT = 0.85


@dataclass(frozen=True)
class Height:
    id: str
    name: str
    #: Cuff opening above the sole, in centimetres.
    leg_cm: float
    price_delta: float


HEIGHTS: tuple[Height, ...] = (
    Height("ankle", "Ankle", 11, 0),
    Height("crew", "Crew", 21, 0),
    Height("knee", "Knee-high", 38, 2),
)

SIZES: tuple[tuple[str, str], ...] = (
    ("s", "US W 5-7.5 / M 4-6.5"),
    ("m", "US W 8-10.5 / M 7-9.5"),
    ("l", "US W 11-13 / M 10-12.5"),
    ("xl", "US M 13-15"),
)


@dataclass(frozen=True)
class Colorway:
    id: str
    name: str
    #: Sock body.
    base: str
    #: Cuff band, heel and toe.
    accent: str
    #: The print.
    ink: str


COLORWAYS: tuple[Colorway, ...] = (
    Colorway("bone", "Bone", "#F0EADE", "#DED5C4", "#191710"),
    Colorway("fog", "Fog", "#F1F1EF", "#B3B3B0", "#1C1C1A"),
    Colorway("midnight", "Midnight", "#1E2542", "#2E3A63", "#F5F0E4"),
    Colorway("clay", "Clay", "#C4553B", "#9E3F2A", "#FBEFE2"),
    Colorway("moss", "Moss", "#3D5A44", "#2C4433", "#F0EEDC"),
    Colorway("bubblegum", "Bubblegum", "#EFA3BD", "#DE6E8E", "#2B1220"),
    Colorway("butter", "Butter", "#F0C258", "#DCA636", "#2A2110"),
)


@dataclass(frozen=True)
class Placement:
    id: str
    name: str
    #: Print diameter in sock units.
    size: float
    price_delta: float


PLACEMENTS: tuple[Placement, ...] = (
    Placement("cuff", "Cuff hit", 34, 0),
    Placement("leg", "Big leg hit", 58, 0),
    Placement("stacked", "Stacked", 32, 1),
    Placement("allover", "All-over", 22, 3),
)

PRICE = {"single": 18.0, "three": 16.0, "six": 15.0, "photoPrint": 3.0}
DONATION_RATE = 0.1


def height_by_id(height_id: str) -> Height:
    for h in HEIGHTS:
        if h.id == height_id:
            return h
    return HEIGHTS[1]


def colorway_by_id(colorway_id: str) -> Colorway:
    for c in COLORWAYS:
        if c.id == colorway_id:
            return c
    return COLORWAYS[0]


def placement_by_id(placement_id: str) -> Placement:
    for p in PLACEMENTS:
        if p.id == placement_id:
            return p
    return PLACEMENTS[0]


def print_mm(placement: Placement) -> float:
    """The print's diameter on a real sock, in millimetres."""
    return placement.size * MM_PER_UNIT


@dataclass(frozen=True)
class PrintSpot:
    """Where one print sits in UV space, and how big it is on the real sock.

    ``u`` runs around the sock (0.5 is the outer side of the leg, 0.75 the back
    and the heel); ``v`` runs from the cuff opening to the toe.
    """

    u: float
    v: float
    #: Print diameter in centimetres.
    cm: float


def print_spots(placement_id: str, landmarks: Landmarks) -> list[PrintSpot]:
    """Ported from ``printSpots`` in texture.ts — the same spots the 3D preview
    paints, so the proof on screen and the file at the factory agree."""
    placement = placement_by_id(placement_id)
    cm = (placement.size * MM_PER_UNIT) / 10
    # Outer side of the leg, just below the ribbed cuff — the Stance spot.
    top = landmarks.cuff_end + 0.035
    leg_room = max(0.04, landmarks.heel - 0.12 - top)

    if placement.id == "cuff":
        return [PrintSpot(0.5, top + 0.02, cm)]
    if placement.id == "leg":
        return [PrintSpot(0.5, top + leg_room * 0.42, cm)]
    if placement.id == "stacked":
        return [PrintSpot(0.5, top + 0.02 + (leg_room * i) / 2.6, cm) for i in (0, 1, 2)]
    if placement.id == "allover":
        spots: list[PrintSpot] = []
        step_v = 0.052
        row = 0
        v = landmarks.cuff_end + 0.02
        while v < 0.97:
            u = 0.1 if row % 2 else 0.0
            while u < 1:
                spots.append(PrintSpot(u, v, cm))
                u += 0.2
            row += 1
            v += step_v
        return spots
    return [PrintSpot(0.5, top + 0.02, cm)]
