"""
The command line.

    python -m smileysocks export design.json --out ./orders
    python -m smileysocks export design.json --template artwork --dpi 300
    python -m smileysocks templates
    python -m smileysocks moods --out ./shelf

``moods`` exists because the commonest thing anyone wants from this package is
not one design but the whole shelf as artwork — for a lookbook, a size check, or
handing a manufacturer the range in one go.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .design import Design
from .export import export_design
from .template import CHOSEN_SUPPLIER, MIN_ALLOVER_DPI, TEMPLATES, template_by_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="smileysocks",
        description="Turn a Smiley Socks design into supplier-ready print files.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    export = sub.add_parser("export", help="export one design file")
    export.add_argument("design", type=Path, help="design JSON, as exported by the studio")
    export.add_argument("--out", type=Path, default=Path("out"), help="output directory")
    export.add_argument("--template", default="wrap", help="print template id (see: templates)")
    export.add_argument("--stem", help="override the output filename stem")
    export.add_argument("--dpi", type=int, help="override the template's DPI")
    export.add_argument("--width-mm", type=float, help="supplier canvas width, in millimetres")
    export.add_argument("--height-mm", type=float, help="supplier canvas height, in millimetres")
    export.add_argument("--bleed-mm", type=float, help="override the bleed")
    background = export.add_mutually_exclusive_group()
    background.add_argument(
        "--background",
        dest="background",
        action="store_true",
        default=None,
        help="print the sock's own colour (sublimation onto a white blank)",
    )
    background.add_argument(
        "--no-background",
        dest="background",
        action="store_false",
        help="artwork only, for a sock already the right colour",
    )
    export.add_argument(
        "--formats",
        default="png,svg,pdf,json",
        help="comma-separated subset of png,svg,pdf,json",
    )

    sub.add_parser("templates", help="list the print templates")

    moods = sub.add_parser("moods", help="export every template face as artwork")
    moods.add_argument("--out", type=Path, default=Path("out/moods"))
    moods.add_argument("--template", default="artwork")
    moods.add_argument("--dpi", type=int)
    moods.add_argument("--formats", default="png,json")

    args = parser.parse_args(argv)

    if args.command == "templates":
        return _list_templates()
    if args.command == "export":
        return _export(args)
    if args.command == "moods":
        return _moods(args)
    return 2


def _list_templates() -> int:
    v = CHOSEN_SUPPLIER
    print(f"Printing with: {v.supplier} — {v.product} (${v.price_usd:.2f}/pair, {v.size_count} sizes)")
    print(f"  {v.url}")
    print(f"  {v.reasoning}")
    print(f"  STILL NEEDED: {v.still_needed}")
    print()
    for t in TEMPLATES:
        print(f"{t.id:<9} {t.name}")
        print(f"{'':<9} {t.notes}")
        print(
            f"{'':<9} {t.dpi} DPI · {t.bleed_mm} mm bleed · "
            f"{'prints the sock colour' if t.background else 'artwork only'}"
        )
        if t.width_mm is None:
            print(f"{'':<9} canvas measured from the sock geometry — verify against your supplier")
        print()
    print(f"Suppliers commonly require at least {MIN_ALLOVER_DPI} DPI for all-over print.")
    print("Pass --width-mm/--height-mm/--dpi to match a vendor's own template pack.")
    return 0


def _resolve_template(args):
    try:
        template = template_by_id(args.template)
    except KeyError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
    return template.with_overrides(
        width_mm=getattr(args, "width_mm", None),
        height_mm=getattr(args, "height_mm", None),
        dpi=getattr(args, "dpi", None),
        bleed_mm=getattr(args, "bleed_mm", None),
        background=getattr(args, "background", None),
    )


def _export(args) -> int:
    if not args.design.exists():
        print(f"no such design file: {args.design}", file=sys.stderr)
        return 1
    try:
        design = Design.load(args.design)
    except (ValueError, json.JSONDecodeError) as error:
        print(f"{args.design}: {error}", file=sys.stderr)
        return 1

    result = export_design(
        design,
        _resolve_template(args),
        args.out,
        stem=args.stem,
        formats=tuple(f.strip() for f in args.formats.split(",") if f.strip()),
    )
    print(result.summary())
    return 0


def _moods(args) -> int:
    """Every template face, as artwork. Reads the shelf from the fixture the
    app writes, so the range here is the range on the site."""
    fixture = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "geometry.json"
    if not fixture.exists():
        print(
            "the shelf fixture is missing — run `npm test` in smiley-socks/ to write it",
            file=sys.stderr,
        )
        return 1
    with open(fixture, "r", encoding="utf-8") as handle:
        faces = json.load(handle)["faces"]

    template = _resolve_template(args)
    formats = tuple(f.strip() for f in args.formats.split(",") if f.strip())
    count = 0
    for entry in faces:
        if not entry["name"].startswith("template-"):
            continue
        mood = entry["name"][len("template-") :]
        design = Design.from_dict({"label": mood.title(), "templateId": mood, "face": entry["params"]})
        export_design(design, template, args.out, stem=mood, formats=formats)
        count += 1
    print(f"{count} moods written to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
