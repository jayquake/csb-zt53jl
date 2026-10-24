# Apartment Finder — orientation for a new session

This repo's actual project lives in **`apartment-finder/`**. Everything at
the repo root (`index.html`, `app.js`/`assets/*.js`/`*.css`, `data.json`) is
the *published* static site — generated output the CI workflow copies up
from `apartment-finder/public/` + `apartment-finder/data/snapshot.json` on
every run. Edit the source in `apartment-finder/`, never the root copies
directly; they get overwritten by the next scan.

**The UI is React + TypeScript + Tailwind v4 now** (shadcn-style components
over Radix primitives), not the old vanilla JS. Source is
`apartment-finder/web/`; `npm run web:build` (Vite) builds it into
`apartment-finder/public/`, which is itself generated output now too
(gitignored, like `site/`) — don't hand-edit anything under `public/`.
`npm run site:build` (what CI runs) does `web:build` then `snapshot:export`.
Local dev: `npm run web:dev` (Vite, HMR, proxies `/api` to :8080) alongside
`npm run dev` (the Express backend) running separately.
`apartment-finder/vite.config.mts` sets `base: './'` deliberately — Pages
serves this at `jayquake.github.io/csb-zt53jl/`, a subpath, not a domain
root, so Vite's default absolute `/assets/...` base 404s everything. If the
live site ever goes blank with asset 404s in the console, check that first.

A few other root files (`animal1`, `i hate this song.mp3`/`.mp4`,
`sandbox.config.json`, root `package.json`) are leftovers from the
CodeSandbox demo this repo used to be. They are dead weight, not part of the
app — ignore them unless the user asks to clean them up.

Read `apartment-finder/README.md` first — it documents the architecture,
scoring model, source design and every non-obvious decision in depth.
`apartment-finder/SETUP-PAGES.md` covers deployment specifically.

## What this is

A Tel Aviv apartment listing tracker: scrapes Komo/Yad2/Homeless (+ manual
Telegram forwards for Facebook posts, since Facebook itself is never
scraped — ToS/ban risk), scores against saved criteria, tracks price drops,
and sends a daily digest to Telegram. Runs on a GitHub Actions schedule and
publishes a read-only static UI to GitHub Pages at
`https://jayquake.github.io/csb-zt53jl/`. No PRs/branches in this repo's
workflow — commit and push straight to `gh-pages`, which is the default
branch (required for `schedule:` triggers to fire at all).

Telegram bot: `@jayquake_tlv_bot`, channel "Apartment findings"
(`chat_id -1003917871499`). Its token was pasted in plaintext earlier in
chat history and should be treated as compromised — confirm with the user
whether it's been rotated via BotFather `/revoke` before relying on it.

## Current state / immediate next step

A self-hosted runner (label `apartment-finder`) is registered and running as
a Windows service on the user's PC (`jayquake-pc`) — set up on the theory
that a residential IP would clear Yad2/Homeless's bot challenges where a
GitHub-hosted datacenter IP couldn't. That theory was tested directly and
disproven: a residential IP alone clears neither. The actual signal both
vendors key on is the CDP connection any browser-automation tool uses to
drive Chrome. A patched, CDP-leak-free Chrome (the `patchright` package,
already wired into `src/sources/browser.ts`) does get through — but **only
in a real headed window**, since headless mode is a separate dead end and
still shows a captcha regardless of the CDP fix. A headed window needs an
interactive desktop session, which the self-hosted runner's Windows service
does not have (Session 0).

Net effect: `.github/workflows/apartment-finder.yml` now scans **Komo only**,
back on `ubuntu-latest` — the self-hosted runner buys it nothing anymore, so
that dependency was removed. Yad2/Homeless currently only work run by hand,
logged in: `HEADLESS=false npm run scan` (optionally
`SOURCES=yad2,homeless` to skip re-scanning Komo). Full details in
`apartment-finder/README.md`, "Sources, and the bot-protection reality", and
`apartment-finder/SETUP-PAGES.md` §7.

Also fixed in the same pass: `src/sources/yad2.ts`'s `toRawListing` was
silently dropping rooms/size (nested under `additionalDetails`, a container
its field-picker never checked), floor and house number (nested two levels
under `address.house`), the real coordinates (`address.coords`, not
`address.coordinates` — Yad2 listings were being geocoded from a
neighborhood-centroid guess instead of the exact address it already had),
and the agency name / tag-based amenities (`customer.agencyName`, `tags`).
There was no test coverage for this parser at all before — there is now
(`tests/yad2.test.ts`, fixtures in `tests/fixtures/yad2-listings.json`, real
captured payloads). `src/geocode.ts` also gained a neighborhood-level
fallback for listings with no `street` (which is most of Yad2's, by design —
it doesn't expose exact addresses on the public search page), so they show
up on the Map tab too, just at coarser precision than Komo's street-level
pins.

The self-hosted runner itself is still registered and running — just idle
from this workflow's perspective. Fine to leave as-is; only relevant again
if a future logged-in-session setup (not a Windows service) makes scheduled
Yad2/Homeless scanning possible.

Also fixed: `markStale` (`src/pipeline/ingest.ts`) now takes the list of
sources a run actually scanned and only expires listings from those sources.
Before this, the Komo-only CI run would silently mark every Yad2/Homeless
listing inactive after `staleAfterDays` (14), since their `lastSeenAt` never
refreshes on a run that never looks at them — nothing was actually confirmed
gone, CI just structurally can't re-check them. A manual run that does scan
Yad2/Homeless still ages them out normally. Test:
`tests/ingest.test.ts` — "markStale with scannedSources only expires the
sources actually scanned".

**Watch for a stray auto-commit tool on this machine.** Mid-session, three
commits with garbled, mismatched messages (content didn't match the message)
appeared on `gh-pages` under the user's own git identity, which the user
didn't knowingly make — something here auto-commits staged changes
periodically (possibly tied to the `caveman` plugin, unconfirmed). Never
assumed to be malicious, but check `git log` for recent unexplained commits
before trusting `git status` at session start, and don't be surprised if
something gets committed without an explicit `git commit` from you.

## Working agreements from prior sessions

- Never scrape Facebook (Groups or Marketplace) — Meta ToS bans automated
  collection platform-wide; personal account ban risk. The compliant path
  is the Telegram-forward inbox (`apartment-finder/src/notify/inbox.ts`).
- Never scrape robots.txt-disallowed paths.
- Amenities (elevator/parking/balcony/safe room/furnished) are tri-state
  (`true`/`false`/`undefined`) throughout — `undefined` means "never
  mentioned" and must never be treated as `false` for a "must have" filter.
- Generated files (`apartment-finder/data/snapshot.json`, and the published
  root site files) conflict wholesale on a normal git merge/rebase because
  CI regenerates them wholesale each run. Don't try to merge them by hand;
  the workflow's publish step resets onto the remote tip and re-applies
  freshly generated copies, and locally a plain `git fetch` + `rebase` is
  usually conflict-free as long as your own commit doesn't also touch those
  generated paths.
- Run `npx tsc --noEmit` and `npm test` (90+ tests, `apartment-finder/`)
  before considering any backend change done.
