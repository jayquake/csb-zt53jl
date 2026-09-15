"""
The port has to agree with the app, exactly.

Every assertion here reads ``fixtures/geometry.json``, which is written by the
real TypeScript in ``tests/production-fixtures.test.ts``. Nothing in this file
hard-codes an expected path or an expected measurement — if it did, it would be
testing a third copy of the truth rather than the two that ship.
"""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from smileysocks import catalog
from smileysocks.design import CUFF_TEXT_MAX, GRINLINE_CHARS, Design, normalise_cuff_text
from smileysocks.face import FACE_LIMITS, FaceParams, build_face, clamp_face
from smileysocks.sock import sock_metrics

FIXTURE = Path(__file__).parent / "fixtures" / "geometry.json"


def load() -> dict:
    with open(FIXTURE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _text_of(prim) -> object:
    """The comparable payload of a Prim, whatever kind it is."""
    return (prim.cx, prim.cy, prim.rx, prim.ry) if prim.kind == "dot" else prim.d


class FaceGeometryTest(unittest.TestCase):
    """The face engine, path string for path string."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load()

    def test_fixture_covers_the_shelf_and_the_edges(self) -> None:
        names = {f["name"] for f in self.fixture["faces"]}
        # A fixture that quietly stopped covering the templates would let the
        # port drift on exactly the faces customers actually buy.
        self.assertGreaterEqual(len([n for n in names if n.startswith("template-")]), 24)
        for shape in ("bar", "tick", "round", "arc", "cross", "line", "spiral", "heart", "lash", "star"):
            self.assertIn(f"eye-{shape}", names)

    def _assert_geometry_matches(self, name: str, finish: str, theirs: dict) -> int:
        """One (face, finish) pair, checked primitive by primitive. Returns
        how many primitives were compared, so the caller can prove the
        fixture is actually exercising the engine rather than trivially
        passing on empty faces."""
        mine = build_face(FaceParams.from_dict(self.fixture_params[name]), finish)
        label = f"{name}[{finish}]"
        compared = 0

        self.assertAlmostEqual(mine.tilt, theirs["tilt"], places=12, msg=label)

        if theirs["outline"] is None:
            self.assertIsNone(mine.outline, f"{label}: drew an outline that should not exist")
        else:
            self.assertIsNotNone(mine.outline, f"{label}: missing outline")
            self.assertEqual(mine.outline.d, theirs["outline"]["d"], label)

        for part, ours, ref in (
            ("eyesLeft", mine.eyes_left, theirs["eyesLeft"]),
            ("eyesRight", mine.eyes_right, theirs["eyesRight"]),
            ("rest", mine.rest, theirs["rest"]),
        ):
            self.assertEqual(len(ours), len(ref), f"{label}/{part}: primitive count")
            for a, b in zip(ours, ref):
                compared += 1
                self.assertEqual(a.kind, b["kind"], f"{label}/{part}/{a.key}")
                self.assertEqual(a.key, b["key"], f"{label}/{part}")
                if a.kind == "dot":
                    for field in ("cx", "cy", "rx", "ry"):
                        self.assertAlmostEqual(
                            getattr(a, field), b[field], places=9, msg=f"{label}/{a.key}/{field}"
                        )
                else:
                    # Exact string equality, not a numeric tolerance: these
                    # strings go into the print file verbatim, so "close
                    # enough" is not the contract — that goes double for the
                    # wobbled chalk finish, where a mismatch would mean the
                    # printed sock's texture disagrees with the proof.
                    self.assertEqual(a.d, b["d"], f"{label}/{part}/{a.key}")

        for spin, ref in zip(mine.eye_rotation, (theirs["eyeRotation"]["left"], theirs["eyeRotation"]["right"])):
            self.assertAlmostEqual(spin.deg, ref["deg"], places=12, msg=label)
            self.assertAlmostEqual(spin.cx, ref["cx"], places=12, msg=label)
            self.assertAlmostEqual(spin.cy, ref["cy"], places=12, msg=label)

        return compared

    @property
    def fixture_params(self) -> dict:
        return {f["name"]: f["params"] for f in self.fixture["faces"]}

    def test_every_face_matches_the_typescript(self) -> None:
        compared = 0
        for entry in self.fixture["faces"]:
            with self.subTest(face=entry["name"], finish="clean"):
                compared += self._assert_geometry_matches(entry["name"], "clean", entry["geometry"])
        self.assertGreater(compared, 200, "the fixture stopped exercising the engine")

    def test_every_face_matches_the_typescript_chalk_finish(self) -> None:
        # Chalk is the shelf default, so this is the render that actually
        # ships. Every primitive the wobble touches — the outline, every eye
        # shape, both new marks, the mouth's width-scaled bow — goes through
        # here on every entry the fixture carries.
        compared = 0
        for entry in self.fixture["faces"]:
            self.assertIn(
                "geometryChalk", entry, f"{entry['name']}: fixture is missing the chalk render"
            )
            with self.subTest(face=entry["name"], finish="chalk"):
                compared += self._assert_geometry_matches(entry["name"], "chalk", entry["geometryChalk"])
        self.assertGreater(compared, 200, "the fixture stopped exercising the wobble")

    def test_chalk_wobble_is_deterministic(self) -> None:
        # Same face in, same wobbled face out — every time, not just once.
        # A port that leaked any non-determinism (dict ordering, float
        # formatting quirks) would still match the fixture by luck on a
        # single run; calling it twice here catches that.
        for entry in self.fixture["faces"][:8]:
            params = FaceParams.from_dict(entry["params"])
            once = build_face(params, "chalk")
            again = build_face(params, "chalk")
            self.assertEqual(
                [_text_of(p) for p in once.rest],
                [_text_of(p) for p in again.rest],
                entry["name"],
            )

    def test_clean_finish_is_the_default(self) -> None:
        # build_face(params) with no finish argument has to mean the same
        # thing as build_face(params, "clean") — every existing caller in
        # this package relies on that default.
        params = FaceParams.from_dict(self.fixture["faces"][0]["params"])
        implicit = build_face(params)
        explicit = build_face(params, "clean")
        self.assertEqual([_text_of(p) for p in implicit.rest], [_text_of(p) for p in explicit.rest])

    def test_limits_are_the_same_numbers(self) -> None:
        for key, (lo, hi) in self.fixture["limits"].items():
            self.assertIn(key, FACE_LIMITS, f"{key} is missing from the port")
            self.assertEqual((lo, hi), tuple(FACE_LIMITS[key]), key)
        self.assertEqual(set(self.fixture["limits"]), set(FACE_LIMITS))

    def test_clamping_survives_a_hostile_design_file(self) -> None:
        # A design file is a file: it can arrive with anything in it.
        wild = FaceParams.from_dict(
            {
                "width": float("nan"),
                "height": 1e9,
                "gap": -400,
                "tilt": "sideways",
                "eyes": {"shape": "laser", "size": -3, "squint": 4},
                "mouth": {"open": float("inf")},
                "marks": ["tear", "tear", "not-a-mark", 7],
            }
        )
        face = clamp_face(wild)
        self.assertEqual(face.width, FACE_LIMITS["width"][0])  # NaN falls to the low end
        self.assertEqual(face.height, FACE_LIMITS["height"][1])
        self.assertEqual(face.gap, FACE_LIMITS["gap"][0])
        self.assertEqual(face.tilt, 0)  # unparseable, so the default stands
        self.assertEqual(face.eyes.shape, "bar")  # unknown shape, not a crash
        self.assertEqual(face.eyes.size, FACE_LIMITS["eyeSize"][0])
        self.assertEqual(face.marks, ("tear",))
        # And it still draws.
        self.assertTrue(list(build_face(face).all_prims()))


class SockMetricsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load()

    def test_measurements_match_the_mesh(self) -> None:
        for sock in self.fixture["socks"]:
            with self.subTest(height=sock["heightId"]):
                m = sock_metrics(sock["legCm"])
                self.assertAlmostEqual(m.length_cm, sock["metrics"]["lengthCm"], places=9)
                # Circumference is measured off a Float32Array in the viewer, so
                # the reference value is float32-quantised while this one is not.
                # The gap is ~5e-8 cm; anything larger is a real divergence.
                self.assertLess(
                    abs(m.circumference_cm - sock["metrics"]["circumferenceCm"]),
                    1e-6,
                    "circumference drifted beyond float32 noise",
                )
                self.assertAlmostEqual(m.landmarks.cuff_end, sock["landmarks"]["cuffEnd"], places=12)
                self.assertAlmostEqual(m.landmarks.heel, sock["landmarks"]["heel"], places=12)
                self.assertAlmostEqual(m.landmarks.toe_start, sock["landmarks"]["toeStart"], places=12)

    def test_heights_are_ordered_and_real(self) -> None:
        lengths = [sock_metrics(h.leg_cm).length_cm for h in catalog.HEIGHTS]
        self.assertEqual(lengths, sorted(lengths), "a taller sock has to be longer")
        for h, length in zip(catalog.HEIGHTS, lengths):
            # Sanity against the physical world: no sock is 4cm or 2m long.
            self.assertTrue(25 < length < 70, f"{h.id} came out {length:.1f}cm")


class PlacementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load()

    def test_every_placement_lands_where_the_preview_shows_it(self) -> None:
        by_height = {s["heightId"]: s for s in self.fixture["socks"]}
        for case in self.fixture["spots"]:
            with self.subTest(height=case["heightId"], placement=case["placementId"]):
                landmarks = sock_metrics(by_height[case["heightId"]]["legCm"]).landmarks
                mine = catalog.print_spots(case["placementId"], landmarks)
                self.assertEqual(len(mine), len(case["spots"]))
                for a, b in zip(mine, case["spots"]):
                    self.assertAlmostEqual(a.u, b["u"], places=12)
                    self.assertAlmostEqual(a.v, b["v"], places=12)
                    self.assertAlmostEqual(a.cm, b["cm"], places=12)

    def test_prints_stay_on_the_sock(self) -> None:
        for height in catalog.HEIGHTS:
            metrics = sock_metrics(height.leg_cm)
            for placement in catalog.PLACEMENTS:
                for spot in catalog.print_spots(placement.id, metrics.landmarks):
                    with self.subTest(height=height.id, placement=placement.id):
                        self.assertTrue(0 <= spot.u <= 1)
                        # Nothing may print onto the cuff ribbing or past the toe.
                        self.assertGreater(spot.v, metrics.landmarks.cuff_end)
                        self.assertLess(spot.v, 1.0)

    def test_catalog_matches_the_storefront(self) -> None:
        ref = self.fixture["catalog"]
        self.assertEqual(catalog.MM_PER_UNIT, ref["MM_PER_UNIT"])
        self.assertEqual(catalog.DONATION_RATE, ref["DONATION_RATE"])
        self.assertEqual(catalog.PRICE, ref["PRICE"])
        self.assertEqual([h.id for h in catalog.HEIGHTS], [h["id"] for h in ref["heights"]])
        self.assertEqual([h.leg_cm for h in catalog.HEIGHTS], [h["legCm"] for h in ref["heights"]])
        self.assertEqual([c.id for c in catalog.COLORWAYS], [c["id"] for c in ref["colorways"]])
        for mine, theirs in zip(catalog.COLORWAYS, ref["colorways"]):
            # A colourway whose ink differed here would print the face in the
            # wrong colour, which no test downstream would catch.
            self.assertEqual((mine.base, mine.accent, mine.ink), (theirs["base"], theirs["accent"], theirs["ink"]))
        self.assertEqual([p.id for p in catalog.PLACEMENTS], [p["id"] for p in ref["placements"]])
        self.assertEqual([p.size for p in catalog.PLACEMENTS], [p["size"] for p in ref["placements"]])
        self.assertEqual([s[0] for s in catalog.SIZES], [s["id"] for s in ref["sizes"]])

    def test_print_millimetres_are_the_quoted_ones(self) -> None:
        cuff = catalog.placement_by_id("cuff")
        # The studio quotes this figure to the customer; it is also Stance's
        # footprint, which is the whole reason the placement exists.
        self.assertAlmostEqual(catalog.print_mm(cuff), 28.9, places=6)


class DesignFileTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load()

    def test_cuff_text_matches_the_knitted_alphabet(self) -> None:
        self.assertEqual(GRINLINE_CHARS, frozenset(self.fixture["grinline"]["chars"]))
        self.assertEqual(CUFF_TEXT_MAX, self.fixture["grinline"]["cuffTextMax"])

    def test_cuff_text_is_normalised_not_rejected(self) -> None:
        self.assertEqual(normalise_cuff_text("hey there"), "HEY THERE")
        # Characters with no glyph are dropped rather than printed as a gap.
        self.assertEqual(normalise_cuff_text("okay★then"), "OKAYTHEN")
        self.assertEqual(len(normalise_cuff_text("A" * 40)), CUFF_TEXT_MAX)

    def test_defaults_survive_an_empty_file(self) -> None:
        d = Design.from_dict({})
        self.assertEqual(d.height_id, "crew")
        self.assertEqual(d.placement_id, "cuff")
        self.assertEqual(d.finish, "chalk")
        self.assertIsNone(d.photo)

    def test_unknown_ids_fall_back_rather_than_raise(self) -> None:
        d = Design.from_dict(
            {"heightId": "thigh", "colorwayId": "chartreuse", "placementId": "sole", "sizeId": "xxl"}
        )
        self.assertEqual(d.height_id, "crew")
        self.assertEqual(d.colorway_id, "bone")
        self.assertEqual(d.placement_id, "cuff")
        self.assertEqual(d.size_id, "m")

    def test_only_data_urls_are_accepted_as_photos(self) -> None:
        # A design file that could name a remote image would be a design file
        # that could make the pipeline fetch one.
        for src in ("https://example.com/a.png", "file:///etc/passwd", "data:text/html,<script>"):
            with self.subTest(src=src):
                self.assertIsNone(Design.from_dict({"photo": {"src": src}}).photo)
        good = Design.from_dict({"photo": {"src": "data:image/png;base64,iVBORw0KGgo=", "scale": 99}})
        self.assertIsNotNone(good.photo)
        self.assertEqual(good.photo.scale, 2.6)  # clamped, as in the app

    def test_slug_is_filesystem_safe(self) -> None:
        d = Design.from_dict({"label": "Mum's 60th / party!!"})
        self.assertEqual(d.slug(), "mum-s-60th-party")
        self.assertEqual(Design.from_dict({"label": "///"}).slug(), "design")

    def test_round_trip_through_json(self) -> None:
        for entry in self.fixture["faces"][:6]:
            with self.subTest(face=entry["name"]):
                original = Design.from_dict({"face": entry["params"], "colorwayId": "moss"})
                again = Design.from_dict(json.loads(json.dumps(original.to_dict())))
                self.assertEqual(original.face, again.face)
                self.assertEqual(original.colorway_id, again.colorway_id)


if __name__ == "__main__":
    unittest.main()
