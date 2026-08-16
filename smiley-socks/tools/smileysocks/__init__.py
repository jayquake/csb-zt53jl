"""
Smiley Socks production tooling.

Turns a design record — the same JSON the storefront stores and exports — into
the files a manufacturer needs, with no browser in the loop. The geometry here
is a port of the app's, held to it by ``tests/test_geometry.py``.

Nothing in this package reaches the network or shells out; it is standard
library only, so a print file can be produced anywhere Python runs.
"""

from .catalog import COLORWAYS, HEIGHTS, PLACEMENTS, PrintSpot, print_mm, print_spots
from .design import Design
from .face import FaceParams, build_face, clamp_face
from .sock import SockMetrics, sock_metrics

__version__ = "1.0.0"

__all__ = [
    "COLORWAYS",
    "HEIGHTS",
    "PLACEMENTS",
    "Design",
    "FaceParams",
    "PrintSpot",
    "SockMetrics",
    "build_face",
    "clamp_face",
    "print_mm",
    "print_spots",
    "sock_metrics",
]
