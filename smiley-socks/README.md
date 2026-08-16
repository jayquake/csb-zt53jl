# Smiley Socks

A storefront for socks with a face on them. The face says how the wearer
actually feels, so choosing it *is* the product decision — you start from a
mood and then pull the face around until it's yours. The brand mark is a small
cuff hit, and 10% of every order funds mental health support.

Live-ish demo: build it and open `dist/index.html`, or run `npm run dev`.

```
npm install
npm run dev        # vite dev server
npm test           # 83 unit tests, no browser needed
npm run build      # typecheck + production build into dist/
```

## What's actually here

| Screen | Route | What it does |
| --- | --- | --- |
| Home | `#/` | The pitch, three-packs, the reel, the 24-face catalog, FAQ |
| Shop | `#/shop` | Listing page: 24 pairs, search and colourway filters (in the URL) |
| Product | `#/p/:id` | Gallery (flat + 3D), variants, live price, spec, add to bag |
| Mockup | `#/mockup` | Brand tool: put a face onto a photo of a real sock |
| Studio | `#/studio` | Design a pair: face editor, sock, photo, cuff text |
| The 10% | `#/10-percent` | What the pledge means, in plain terms |
| Bag | `#/bag` | Line items, pack pricing, live donation line, demo checkout |

**This is a demo storefront.** There is no payment, no order, no shipping and
no partner charity — the Mission page says so on the page itself rather than in
the small print. Uploaded photos never leave the browser.

## The four pieces worth knowing about

### 1. The face is a bag of numbers (`src/brand/face.ts`)

A face is `FaceParams` — outline size and stretch, eye shape/position/size/
squint/tilt, brow height and angle, mouth width/curve/open/wobble, plus marks
(tear, sweat, blush, static, sleep, sparkle). `buildFace()` turns that into
drawing primitives, and `Face.tsx` turns primitives into SVG. Nothing else
knows how a face is drawn.

The twenty-eight templates in `templates.ts` are presets of those same numbers,
which is why editing one costs nothing: there is no "preset mode" to leave.

`FACE_LIMITS` is the single source of truth for what each number may be. The
editor clamps against it, `clampFace()` sanitises anything restored from
storage against it, and the tests check both ends of every range.

### 2. Direct manipulation, not sliders (`src/editor/`)

`handles.ts` defines each grab point as two pure functions: where it sits on
the current face, and what the face becomes when you drag it to a point. That
one shape gives us pointer dragging, arrow-key nudging (drag to "here plus 2")
and per-feature reset (drag back to the template's value) from the same code.

Three details are load-bearing on a phone, and all three are easy to get wrong:

- **Pointer Events with capture**, so a fast drag that outruns the handle keeps
  tracking instead of dropping.
- **`getScreenCTM().inverse()`** to convert client coordinates into SVG user
  space. The preview is fluid, so pixel-delta maths would drift.
- **`touch-action: none`** on the canvas, or a drag scrolls the page instead of
  moving the handle.

The feel is "keep pulling": when a parameter hits its limit the extra travel
spills into a second one, so the crown stretches after the face stops growing
and the mouth opens once the frown bottoms out.

### 3. It moves (`src/brand/animation.ts`)

Animating a face is interpolating numbers, because a face is already numbers.
No sprite sheets, no keyframes, no second set of artwork. Three ideas:

- **morph** — `lerpFace()` tweens every value between two moods. Things that
  cannot be half-way (eye shape, brows on/off, which marks show) switch at the
  midpoint, while the surrounding numbers are still moving and the swap is
  hardest to catch.
- **blink** — jittered inside each period rather than on a fixed beat, roughly
  one in four a double. A metronome blink is worse than none.
- **boil** — the line is redrawn slightly differently 8 times a second, the way
  hand-drawn animation is never twice the same. Every wobble is derived from
  the frame number, so it repeats exactly rather than drifting, and it is what
  makes the faces read as ink rather than vector art.

All of it is pure and deterministic — same elapsed time, same face — which is
why motion is unit-tested rather than eyeballed.

Rendering-side: one shared `requestAnimationFrame` loop for the whole page
(`ticker.ts`), which stops when nothing is subscribed or the tab is hidden;
faces pause when scrolled off screen; React renders are throttled to 24fps for
morphs and 8fps for a face that is only wobbling. `prefers-reduced-motion`
holds everything still on the first pose.

The product preview in the studio does **not** animate. It is a print proof,
and "what you see is the size you get" only holds if it sits still.

### 4. Grinline, the house alphabet (`src/brand/grinline.ts`)

A mono-line geometric display face, drawn as stroke paths rather than installed
as a font: no webfont request, no fallback that could render instead, and the
tiny wordmark knitted on the sock cuff is the same geometry as the headline.
Round glyphs (O, Q, 0, 8) carry the "open loop" — a gap in the top-right of the
counter. It is the same gap the logo mark wears, and the same parameter that,
opened all the way, leaves a face with no outline at all. Body copy stays in
system type, where it belongs.

## Drawn, not generated-looking

The catalog is **28 emotions**, drawn in a chalk finish: Sunny through
Crushed, by way of Fuzzy, Bored, Smug, Queasy, Lonely, Flirty and Unbothered.
It is a face set, not a mood scale — most days are not on a happy-to-sad line.

Chalk finish is two things stacked, one on the page and one in the geometry
itself:

- **`src/brand/Chalk.tsx`** — two SVG filter primitives, no new artwork.
  `feTurbulence` + `feDisplacementMap` make the edge wander;
  `feTurbulence` + `luminanceToAlpha` give the line its tooth. Six filter
  variants live once at the root of the app and each face picks one from its
  own signature, so a grid of them looks drawn rather than stamped. This part
  is browser-only — an SVG filter means nothing to a PNG or a PDF.
- **The wobble in `face.ts` itself** — a small, seeded jitter baked into the
  path data before any renderer sees it: the outline bows along its own
  radius, every eye shape and mark nudges off its "ideal" point by a unit or
  two, and the mouth bows by an amount scaled to its own width so a short flat
  mouth doesn't zigzag the way a wide curved one can afford to. It is
  deterministic — the same face always wobbles the same way, keyed off
  `faceSignature()` — so a re-render, the 3D texture, the photo mockup and the
  exported print file all draw the identical "hand". This is the part that
  makes "hand-drawn" true of the sock itself and not just the page: the
  Python production pipeline reads the same `d` strings, so the wobble ships
  on the actual print.

`finish` is part of the design (`chalk` by default, `clean` available), and
now reaches every surface that draws a face — the flat proof, the 3D preview,
the photo mockup and the production export — not just the page.

The editor canvas stays clean on purpose — you cannot aim a drag handle at a
wandering line.

The face vocabulary comes from a pen-on-paper sketch, and a few details carry
most of that character:

- **tick eyes** — an eye as one short flicked stroke.
- **lash eyes** — a closed-eye arc with two short flicks fanned off the outer
  corner, for the flirty/laughing moods.
- **shades** — a mark, not an eye shape: two rounded lenses and a bridge that
  sit over whatever eyes are underneath, sized off `eyes.size` so they always
  fit.
- **the flick** — smiles carry the upswept tail of a pen leaving the paper
  (`mouth.flick`). It is the most recognisable thing about a hand-drawn smile
  and costs one line segment.
- **no outline, by default** — `gap` opens the face's loop, and at 360° there
  is no outline left at all: two eyes and a mouth, floating, the way anyone
  actually doodles a face. That is where every template now starts. It is not a
  separate mode, just the open loop taken to its limit; the crown/chin/side
  handles hide themselves when there is nothing to pull, and the studio's
  Outline control puts a circle back for anyone who wants one.

  Two consequences worth knowing. Marks (sweat, sparkle, z's, static) used to
  hang off the rim of the face; with no rim they tuck in against the features
  instead, or they float in space. And the logo mark is the deliberate
  exception — it keeps its loop, because at 26px in the header a bare face is
  two dots and a hairline.

A wink is the one asymmetry allowed. Eyes are otherwise always mirrored,
because independent eyes read as a bug rather than a choice.

## Putting the print on a real sock

`#/mockup` composites a face onto a photograph. Pasting artwork flat always
looks pasted, so two operations do the work a Photoshop smart object would:

- **Displacement.** The photo's own luminance is a rough height map of the
  cloth, and sampling the artwork along the *gradient* of that map bends the
  print into the folds. The map is computed from the photo, so there is no
  second file to keep in sync.
- **Multiply.** Compositing the ink with multiply lets the photo's shadows show
  through, so the print sits in the weave instead of on top of it.

The warp is **normalised against each photo's own contrast**. The gradient of a
blurred luminance map is tiny — around 0.002 per pixel on a softly lit sock —
so a slider in "pixels" moved the art by a fraction of one and did nothing at
all on gentle photographs. Scaling by the strongest slope present makes the
number mean what the label says. Where the print lands on genuinely flat cloth
there are no folds and the warp correctly does nothing.

**It ships with no photograph on purpose.** Every usable sock photo belongs to
somebody: a licensed mockup, a supplier's image you may use, or one you shot.
The page spells out the three routes and the two traps (someone else's branded
sock is a trademark regardless of licence; a knitted cuff hit needs a mill and
a minimum order, where print-on-demand renders it as surface ink).

## Getting it made (`tools/`)

The site can draw a sock; it cannot hand a factory a file. `tools/` is a
standard-library-only Python package that turns a design record into production
artwork with no browser in the loop — a queue worker, a CI step, a script over a
day's orders.

```bash
cd tools && python3 -m smileysocks export design.json --out ./orders
```

Out comes a print PNG at the supplier's DPI, the same artwork as vector SVG, an
A4 proof PDF at true scale with the trim line and the measured drop from the
cuff, and a manifest of every number pre-press would otherwise measure off a
screen. The studio's **Text** tab has a *Download design file* button that
writes the input.

Two decisions worth knowing:

- **The canvas sizes are our own derivation, not a vendor's template.** A full
  wrap really is the leg circumference by the centreline length, measured from
  the same geometry the site previews — but suppliers publish their own template
  per product and those change. Every export where the canvas was measured
  rather than supplied says so, in the manifest and on the proof, and
  `--width-mm/--height-mm/--dpi` take the vendor's numbers. What the geometry
  buys you regardless is proportion: the print lands the right number of
  millimetres below the cuff at the size the customer was quoted.
- **The port cannot drift silently.** `face.py`, `sock.py` and `catalog.py`
  duplicate `face.ts`, `sockMesh.ts` and `catalog.ts`, so `npm test` runs the
  real TypeScript and writes what it produces to a fixture, and the Python suite
  asserts it reproduces all of it — path string for path string, 55 faces in
  both finishes, every eye shape and mark, both extremes of every limit.
  Change a curve on either side and the other goes red.

Full detail, including the deliberate limits (photos are not composited; cuff
text is positioned rather than lettered) is in [`tools/README.md`](tools/README.md).

## It behaves like a shop

The studio is the point of the brand, but designing something is not the only
way people buy. `store/products.ts` puts the 24 faces on a shelf as pairs that
already exist — a product is a face plus a colourway, and height/size/print
stay variants chosen on the product page. It is the same `Design` the studio
edits, so "Change the face" hands the product straight to the editor.

Two details that make it a storefront rather than a grid:

- **Filters live in the URL** (`#/shop?colour=midnight`), so a filtered shelf
  can be linked, shared and survives a refresh and the back button.
- **The product page price is live.** Height and print placement genuinely cost
  different amounts, so a page quoting one fixed number would be lying by the
  time you reached the bag. Verified end to end: $18 → $20 knee-high → $23
  all-over, and the bag charges $23.

## Sold in threes

Socks in this category sell as three-packs, and the pack rate already existed
in `catalog.ts` — but it only appeared once you had guessed your way to three
pairs in the bag. `store/packs.ts` makes it a product: three curated trios,
one price, one tap.

A trio is three template ids and three colourways; everything else comes from
the design defaults, so a pack is a shortcut into the studio's data model
rather than a parallel one. **There is no second price list** — a test asserts
the shelf's price equals what the bag charges for the same three pairs, because
a shelf advertising a number the checkout won't honour is the classic way this
breaks.

## The 3D view

The studio's preview switches between **Flat** and **3D**. They do different
jobs and the copy says so: the flat SVG is the *print proof*, drawn to scale
and deliberately still, and the 3D sock is for seeing the thing on a shape.

- `src/three/sockMesh.ts` — a procedural sock: a tube swept along a centreline
  that bends through the ankle, with an elliptical cross-section whose
  flattening rotates from front-to-back on the leg to top-to-bottom on the
  foot, a one-sided heel bulge, and a rounded toe. **No three.js import**, so
  the shape is unit-tested in Node (11 tests: closed toe, UVs in range, sock
  proportions, landmarks in order) and the big library stays lazy.

  The centreline is resampled by **arc length**. A spline's own parameter is
  not distance, and without that step `v` spends as much of the texture on the
  last 3cm of shin as on the first 7 — which put the cuff hit down by the
  ankle.

- `src/three/texture.ts` — paints the design into a canvas in UV space. The
  reuse that makes this cheap: the face engine and Grinline emit SVG path
  strings, and Canvas2D's `Path2D` parses exactly that syntax, so the face on
  the 3D sock is the *same geometry* as the SVG, not a copy. Texture scale
  comes from the mesh's own measured length and circumference, so a 2.9cm
  print is 2.9cm on the model.

- `src/three/SockThree.tsx` — scene, lights, turntable, teardown. three.js is
  `import()`ed only when you tap 3D (it is a 717kB chunk, more than twice the
  rest of the app). No WebGL, or the import fails? Say so and keep the flat
  view. On unmount, geometry, material, texture and the GL context are all
  disposed — none of that is garbage collected on its own.

One three.js gotcha worth remembering: textures are flipped vertically by
default (`flipY = true`), which is right for image files and wrong for a canvas
painted in the same direction as the mesh's `v`. Left on, the sock wears its
toe block at the cuff.

## Placement is a product fact, not styling

`catalog.ts` draws the sock in a 380×480 box where **one unit ≈ 0.85 mm**, from
a 100-unit leg panel ≈ 85 mm laid flat (a standard adult crew). Print sizes are
in those same units, so the quoted millimetres are real:

- **Cuff hit** (default) — outer cuff, ~29 mm: the spot and footprint Stance
  uses for its logo.
- **Big leg hit** — ~49 mm, mid-leg.
- **Stacked** — the same face up the leg; an ankle sock quietly fits fewer
  rather than printing onto the heel.
- **All-over** — tiled and clipped to the silhouette.

## Mobile-first, structurally

Built at 360px first; the two media queries only widen things. The studio is
one column with the sock pinned above the controls, so what you're changing is
never off screen while you change it — at ≥900px that becomes two columns with
the same components. Nothing depends on `:hover`, every target clears 44px, and
on short screens the preview gives up room rather than the editor.

Verified rather than assumed: the layouts were screenshotted and measured at
360×640, 360×780, 390×844, 768 and 1280 — no horizontal overflow at any width,
and the editor fits between the sticky preview and the buy bar at all three
phone heights.

## Notes on the data

- The bag lives in `localStorage`. Everything read back goes through
  `sanitiseDesign()`, which re-checks catalog ids and re-clamps every number —
  a bad restore should cost you a customisation, never a crash on load.
- Uploaded photos are downscaled to 512px **before** they become part of a
  design. That's not an optimisation: one modern phone photo as a data URL
  exceeds the ~5MB storage quota on its own, and this is what keeps "add to
  bag, refresh, still there" true.
- Only `data:image/` sources survive a restore, so a stored design can't point
  the preview at someone else's server.

## Repo notes

This directory is self-contained and unrelated to the apartment finder that
owns the rest of this repository. The scheduled workflow at
`.github/workflows/apartment-finder.yml` resets the branch and copies its own
built site to the repo root, staging entries by name from that build — it never
touches `smiley-socks/`.

`dist/` is committed so the branch is viewable without an install, and so
publishing later is a no-op. It is generated output: change `src/`, run
`npm run build`, commit the result. `vite.config.ts` sets `base: './'` and the
app uses `HashRouter`, so the build works from a subpath such as
`/csb-zt53jl/smiley-socks/` with no server rewrite rules.
