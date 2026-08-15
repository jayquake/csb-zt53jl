# Smiley Socks

A storefront for socks with a face on them. The face says how the wearer
actually feels, so choosing it *is* the product decision — you start from a
mood and then pull the face around until it's yours. The brand mark is a small
cuff hit, and 10% of every order funds mental health support.

Live-ish demo: build it and open `dist/index.html`, or run `npm run dev`.

```
npm install
npm run dev        # vite dev server
npm test           # 47 unit tests, no browser needed
npm run build      # typecheck + production build into dist/
```

## What's actually here

| Screen | Route | What it does |
| --- | --- | --- |
| Home | `#/` | The pitch, the 12 starting moods, pack pricing, FAQ |
| Studio | `#/studio` | Design a pair: face editor, sock, photo, cuff text |
| The 10% | `#/10-percent` | What the pledge means, in plain terms |
| Bag | `#/bag` | Line items, pack pricing, live donation line, demo checkout |

**This is a demo storefront.** There is no payment, no order, no shipping and
no partner charity — the Mission page says so on the page itself rather than in
the small print. Uploaded photos never leave the browser.

## The three pieces worth knowing about

### 1. The face is a bag of numbers (`src/brand/face.ts`)

A face is `FaceParams` — outline size and stretch, eye shape/position/size/
squint/tilt, brow height and angle, mouth width/curve/open/wobble, plus marks
(tear, sweat, blush, static, sleep, sparkle). `buildFace()` turns that into
drawing primitives, and `Face.tsx` turns primitives into SVG. Nothing else
knows how a face is drawn.

The twelve templates in `templates.ts` are presets of those same numbers, which
is why editing one costs nothing: there is no "preset mode" to leave.

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

### 3. Grinline, the house alphabet (`src/brand/grinline.ts`)

A mono-line geometric display face, drawn as stroke paths rather than installed
as a font: no webfont request, no fallback that could render instead, and the
tiny wordmark knitted on the sock cuff is the same geometry as the headline.
Round glyphs (O, Q, 0, 8) carry the "open loop" — a gap in the top-right of the
counter, echoing the gap in every face outline. Body copy stays in system type,
where it belongs.

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
