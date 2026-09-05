"""
Numbers formatted the way JavaScript formats them.

The face engine builds SVG path strings by interpolating numbers straight into
text, so a port that computes identical geometry but *prints* it differently
produces different files. Three places where Python and JS disagree, all of
which show up in a path string:

  - ``Math.round`` rounds halves towards +infinity; Python's ``round`` rounds
    halves to even, so 2.5 becomes 2 rather than 3.
  - ``String(72)`` is ``"72"``; Python's ``repr(72.0)`` is ``"72.0"``.
  - ``String(-0)`` is ``"0"``; Python's is ``"-0.0"``.

Beyond those, both languages print the shortest decimal that round-trips to the
same IEEE double, so the digits themselves agree.
"""

from __future__ import annotations

import math

__all__ = ["js_round", "js_num", "fmt"]


def js_round(x: float) -> float:
    """``Math.round``: halves go towards positive infinity, not to even."""
    if math.isnan(x) or math.isinf(x):
        return x
    return math.floor(x + 0.5)


def js_num(value: float) -> str:
    """Format a float as ``String(n)`` would in JavaScript."""
    if value == 0:
        # Catches -0.0, which JS prints without the sign.
        return "0"
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value == int(value) and abs(value) < 1e21:
        return str(int(value))
    text = repr(float(value))
    # Python writes 1e-05 where JS writes 0.00001; nothing in the face engine
    # reaches that magnitude after rounding, but a silent mismatch here would be
    # invisible in a diff, so it is handled rather than assumed away.
    if "e" in text:
        mantissa, exponent = text.split("e")
        power = int(exponent)
        if -6 < power < 21:
            return f"{float(value):.{max(0, 20 - power)}f}".rstrip("0").rstrip(".")
        return f"{mantissa}e{'+' if power > 0 else '-'}{abs(power)}"
    return text


def fmt(value: float) -> str:
    """``r()`` from face.ts: round to two decimals, then print like JS."""
    return js_num(js_round(value * 100) / 100)
