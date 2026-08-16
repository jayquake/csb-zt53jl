# Production tooling

Turns a design — the same JSON the storefront stores and exports — into the
files a manufacturer needs.

```bash
cd smiley-socks/tools
python3 -m smileysocks export design.json --out ./orders
```

```
Smitten — Crew, Midnight
  placement   Cuff hit · 28.9 mm × 1
  canvas      188.02 × 374.75 mm  (1110 × 2213 px @ 150 DPI)
  first hit   20.28 mm below the cuff opening
  print.png   orders/smitten-wrap-print.png
  print.svg   orders/smitten-wrap-print.svg
  proof.pdf   orders/smitten-wrap-proof.pdf
  manifest.json orders/smitten-wrap-manifest.json
  ! Canvas measured from our own sock geometry, not a supplier template.
    Check it against the vendor's file guidelines before ordering.
```

No dependencies. Python 3.11+, standard library only — no Pillow, no cairo, no
reportlab. The rasteriser, the PNG encoder and the PDF writer are all in here,
because a production tool that dies on `pip install` in somebody else's
environment is a production tool that does not work.

## Why this exists in Python at all

The site can already draw a sock. What it cannot do is hand a factory a file:
the browser is where the customer designs, not where the order gets fulfilled.
A print file has to be producible from a design record alone — in a queue
worker, a CI step, a script run against a day's orders — with no screen
involved. That is this package.

## The four files

| File | What it is for |
| --- | --- |
| `*-print.png` | The raster the supplier's uploader accepts, at their DPI, with the density written into the file so it cannot be opened at the wrong size. |
| `*-print.svg` | The same artwork as vector, sized in millimetres so it opens on a real-size artboard. |
| `*-proof.pdf` | A4, artwork at true scale where it fits, with the trim line, the print circles at their real diameter, the measured drop from the cuff, and every warning. This is the one a human signs. |
| `*-manifest.json` | Every number somebody would otherwise measure off a screen: canvas in mm and px, print centres, landmarks, colours, the design hash. |

Pass `--formats png,json` to write only some of them.

## Templates

```bash
python3 -m smileysocks templates
```

- **`wrap`** — the sock laid flat and opened out. Width is the leg
  circumference, height is the centreline from cuff opening to toe. Prints the
  sock's own colour, for sublimation onto a white blank. 150 DPI by default.
- **`panel`** — cuff down to the heel, artwork only, for placement print onto a
  finished sock.
- **`artwork`** — the face alone at its true printed size, for vinyl, DTG or
  embroidery digitising.

### Read this before you send anything to a supplier

**The canvas sizes are our derivation, not any vendor's template.** They are
honest — a full wrap really is the circumference by the length, measured from
the same sock geometry the site previews — but print-on-demand suppliers
publish their own template pack per product, and the sizes differ between
vendors and change over time. Printful, for one, tells you to download the
template from the product's own *File guidelines* tab rather than quoting a
single number for socks.

So fetch the template for the exact product you are ordering and pass its
dimensions:

```bash
python3 -m smileysocks export design.json --width-mm 190 --height-mm 380 --dpi 300
```

Every export where the canvas was measured rather than supplied says so, in the
manifest and on the proof. That warning is meant to stay noisy.

What the geometry buys you regardless of vendor is **proportion**: whatever
canvas you specify, the print lands the correct number of millimetres below the
cuff at the millimetre size the customer was quoted, because both come from the
same measurements the studio quotes from.

150 DPI is the floor most suppliers publish for all-over print and 300 is the
usual recommendation, which is why `wrap` defaults to 150 (a crew wrap at 300
is a 9-megapixel file that some uploaders reject) and the other templates to
300. Anything below 150 warns.

## The whole shelf at once

```bash
python3 -m smileysocks moods --out ./shelf
```

Writes all 26 template faces as artwork — for a lookbook, a size check, or
handing a manufacturer the range in one go. It reads the shelf from the fixture
the app writes, so the range here is the range on the site.

## Known limits, stated rather than hidden

- **Uploaded photos are not composited.** A design carrying a photo exports the
  face only, and the manifest and proof both say so. Compositing belongs in
  pre-press where someone can see the result.
- **Cuff text is positioned, not lettered.** Grinline is a stroked alphabet with
  no font file; porting its glyph table would be a third copy of the truth for
  the sake of ten characters. The proof carries boxes at the correct cap height
  and position and the manifest carries the string. The boxes are **not** in the
  print file — a placeholder that ships inside the artwork is a placeholder that
  gets printed onto somebody's sock.
- **`panel` drops prints that fall past the heel**, and warns with a count. Use
  `wrap` for a genuine all-over.

## How this stays honest

`smileysocks/face.py`, `sock.py` and `catalog.py` are ports of `src/brand/face.ts`,
`src/three/sockMesh.ts` and `src/store/catalog.ts`. A port is a second copy of
the truth and second copies drift, so there is a mechanism, not a promise:

1. `npm test` runs `tests/production-fixtures.test.ts`, which executes the
   **real TypeScript** and writes what it produces to
   `tools/tests/fixtures/geometry.json` — 46 faces (every template, every eye
   shape, every mark, both extremes of every limit, plus deliberately
   out-of-range input), the sock metrics for all three heights, every
   placement's spots, the catalog and the knitted alphabet.
2. `python3 -m unittest discover -s tests -t .` asserts this package reproduces
   all of it — **path string for path string**, not within a tolerance, because
   those strings go into the print file verbatim.

Change a curve in `face.ts` and the Python tests go red until the port catches
up. Neither side can move alone.

```bash
cd smiley-socks && npm test                       # 102 tests, rewrites the fixture
cd tools && python3 -m unittest discover -s tests -t .   # 45 tests
```

The one deliberate tolerance is the sock circumference: the 3D viewer measures
it off a `Float32Array`, so its value is float32-quantised while this one is
not. The gap is about 5×10⁻⁸ cm and the test fails on anything larger.
