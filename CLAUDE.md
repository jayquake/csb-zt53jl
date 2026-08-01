# Apartment Finder — orientation for a new session

This repo's actual project lives in **`apartment-finder/`**. Everything at
the repo root (`index.html`, `app.js`, `styles.css`, `data.json`, `vendor/`)
is the *published* static site — generated output the CI workflow copies up
from `apartment-finder/public/` + `apartment-finder/data/snapshot.json` on
every run. Edit the source in `apartment-finder/`, never the root copies
directly; they get overwritten by the next scan.

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

The `scan` job in `.github/workflows/apartment-finder.yml` was just switched
from `runs-on: ubuntu-latest` to `runs-on: [self-hosted, apartment-finder]`,
because GitHub-hosted runners' Azure IPs get hard-blocked by Yad2/Homeless's
bot protection (Komo is unaffected either way). **Until a self-hosted
runner with the `apartment-finder` label is registered, every scan —
including the daily cron — will sit queued indefinitely and nothing will
update.** Registration steps are in `apartment-finder/SETUP-PAGES.md` §7.
This was mid-setup (deciding which machine to register) when the user moved
to this IDE — that's very likely the next thing to pick up.

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
- Run `npx tsc --noEmit` and `npm test` (81+ tests, `apartment-finder/`)
  before considering any backend change done.
