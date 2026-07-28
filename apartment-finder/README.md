# Tel Aviv Apartment Finder

Watches Israeli rental listings every morning, scores them against your criteria, and sends a single WhatsApp digest with new listings and price drops. Browse and triage everything from a mobile web UI.

```
┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌────────────────┐
│   Sources    │   │    Ingest     │   │    Score     │   │     Notify     │
│ Komo         │──▶│ normalize     │──▶│ hard filters │──▶│ WhatsApp       │
│ Yad2         │   │ fingerprint   │   │ soft ranking │   │ Telegram       │
│ Homeless     │   │ price history │   │ 0-100        │   │ console        │
│ manual paste │   │               │   │              │   │                │
└──────────────┘   └───────────────┘   └──────────────┘   └────────────────┘
                            │
                     ┌──────▼───────┐
                     │ SQLite + web │
                     │ UI on :8080  │
                     └──────────────┘
```

## Quick start

```bash
cd apartment-finder
cp .env.example .env
npm run setup           # install deps, install Chromium via the Playwright CLI,
                        # generate the Prisma client, create the database

npm run notify:test     # prints a sample digest to the console
npm run scan:dry        # real scrape, scores everything, sends nothing
npm run dev             # web UI + scheduler on http://localhost:8080
```

The morning scan runs at **07:30 Asia/Jerusalem** by default (`SCAN_CRON`).

## Running it online (GitHub Actions + Pages)

GitHub Pages is **static hosting** — it cannot run Express, cron, Playwright or
SQLite, so the app cannot "run" there. What works is splitting the two halves:

```
GitHub Actions (scheduled)          GitHub Pages (static)
  import snapshot  ─┐
  scan sources      │  ──▶ data.json + UI ──▶  read-only site on your phone
  send WhatsApp     │
  export snapshot  ─┘
  commit + deploy
```

Actions does the scraping and sends the WhatsApp digest. Pages serves the
result as a read-only page. `npm run snapshot:export` produces both the
committed state file and the published `site/`.

**Setup** (in the repository hosting the app — not a user Pages repo that is
already publishing something else):

1. Copy `.github-workflow-apartment-finder.yml` to
   `.github/workflows/apartment-finder.yml`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions, add `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO`
   (or the two `TELEGRAM_*` ones).
4. Run the workflow once by hand (Actions → Apartment Finder → Run workflow,
   with *dry run* ticked) to confirm it works before it starts messaging you.

The site lands at `https://<user>.github.io/<repo>/`.

### What state persistence buys you

`data/snapshot.json` is committed back after every run. Each Actions job starts
from a fresh checkout with no database, so without it every scan would treat
every listing as new and re-alert all of them, every single morning. Verified:
a scan immediately after a restore reports `created: 0, alerts: 0`.

JSON rather than the SQLite file because it diffs readably in git instead of as
an opaque binary blob — and it doubles as the exact data file the static UI
reads, so one artifact does both jobs.

### Two limitations, stated plainly

**Actions runners are datacenter IPs.** GitHub-hosted runners sit in Azure
ranges, which Radware and Cloudflare challenge far harder than a home
connection. Komo needs no browser and should be fine; **Yad2 and Homeless may
well be blocked there.** The workflow carries on and reports per-source counts
in the job summary rather than failing. If those two prove unreliable, either
set `sources` to `komo`, or run the scan from a machine at home and use Pages
only for viewing.

**The published page is read-only.** With no server there is nothing to POST
to, so *Scan now* and the *Add* tab are hidden and the criteria form is
disabled. Save/Hide/Contacted still work, kept in the browser's localStorage.
To change criteria or paste a Facebook post, run the app locally and commit the
updated snapshot.

Also note the cron is UTC: `30 4 * * *` is 07:30 Israel time in summer (IDT)
and 06:30 in winter (IST). GitHub cron has no timezone support.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

The `apartment-data` volume holds both the SQLite database (your price history) and the browser profile. Don't delete it — see the bot-protection note below for why the profile matters.

---

## How listings are ranked

Two separate stages, deliberately kept apart:

**Hard filters** decide eligibility. Fail one and the listing is dropped: over budget, wrong city, a blocked keyword, a roommate post, or a *confirmed* missing must-have.

**Soft scoring** ranks survivors 0–100 across six weighted factors:

| Factor | Weight | Notes |
|---|---|---|
| Price vs. your ideal | 30 | Full marks at the ideal price, zero at your ceiling |
| Size vs. ideal m² | 20 | |
| Favourite neighbourhood | 15 | |
| Amenities present | 15 | elevator, parking, balcony, safe room, furnished |
| Freshness | 10 | Posted today ≫ posted two weeks ago |
| Bonus keywords | 10 | |

One rule drives most of the design: **unknown never rejects.** Israeli listings routinely omit size, floor and amenities, so treating "missing" as "fails" would throw away most of the market. Missing data costs points instead. The single exception is price — if you set a budget, an unpriced listing is dropped, because "call for price" posts are overwhelmingly agency spam.

Every score comes with readable reasons (`at or under ideal budget (₪5,700) · favorite area: פלורנטין`), shown in both the UI and the WhatsApp message.

## What triggers an alert

- **NEW** — fires once per apartment, ever.
- **PRICE_DROP** — only on a real decrease clearing `minPriceDropPercent` (default 3%), and never twice for the same price.

Deduplication is what makes this hold. Listings are fingerprinted on location, size, rooms and floor — deliberately **not** price, since price is the thing we want to see change. So the same flat cross-posted to Komo, Yad2 and Homeless, or re-posted next month with a new ID, collapses onto one record instead of alerting again. A 0.8% "reduction" that an agent made to bump their ad back to the top of the feed is ignored.

If nothing qualifies, **nothing is sent**. No daily "no results" message.

---

## Sources, and the bot-protection reality

Each source was probed directly rather than assumed. They differ sharply:

| Source | Protection | robots.txt | Approach |
|---|---|---|---|
| **Komo** | **none** — plain HTTP returns real listings | only `/api/` disallowed (not used) | `fetch` + cheerio, no browser at all |
| **Yad2** | Radware Bot Manager — returns HTTP 200 whose body is a loader page | `/api/` and `/ajax/` disallowed; search pages are not | Render the public search page in a real browser, read `__NEXT_DATA__` |
| **Homeless** | Cloudflare — returns 403 "Just a moment…" | permissive (2 paths) | Real browser, parse the server-rendered HTML |
| **Madlan** | — | disallows `/search/`, `/homes/`, `/property/` | **Not implemented** — robots.txt forbids it |

**Komo is the best of the three and runs first.** It needs no browser, so it is
an order of magnitude faster, and it keeps working even with no Chromium
installed. It also filters *server-side*, which beats filtering after the fact:
price range, room range, owner-vs-agent, and the amenity requirements are all
pushed into the query, so fewer pages are fetched for the same result. Its
result cards carry a structured `city, neighborhood, street` title — better
location data than either other source exposes.

Deep pagination on Komo is deliberately skipped: it marks pager links
`rel="nofollow"`, disallows `/*currPage=` for named crawlers, and serves a plain
client an empty page 2 regardless. The tight server-side filters mean the first
page is already the relevant slice.

Consequences worth knowing up front:

- **A `fetch()`-based scraper cannot work for Yad2 or Homeless.** Playwright with a real browser is required for those two. Komo is exempt.
- **Browsers come from the Playwright CLI**: `npx playwright install chromium` (wired into `npm run setup`; `npm run browser:deps` also pulls OS libraries). Set `CHROMIUM_PATH` only to override.
- **One consistent identity.** The User-Agent is configurable via `SCRAPE_USER_AGENT` and is pinned at the browser-context level, so it is sent on every navigation, XHR and asset — not just the first document. `Accept-Language`, `sec-ch-ua` client hints, timezone and `navigator.userAgent` are all kept in agreement with it; a UA header that disagrees with the JS view, or that vanishes after the first request, is a strong bot signal. The plain-HTTP Komo adapter reuses the same identity, so all three sources look like one client rather than three.
- **Yad2's private `gw.yad2.co.il` API is not used**, even though it would be convenient — it lives behind the robots-disallowed `/api/` path. The public search page carries the same data.
- **Run this from a home IP.** Datacenter ranges get challenged much harder. This is the main reason the recommended deployment is local or a home server rather than a cloud VPS.
- **The browser profile is persistent** (`BROWSER_PROFILE_DIR`). The clearance cookie from the first solved challenge is reused, so later scans skip the challenge — faster, and far less bot-like. Deleting the profile means re-solving from scratch.
- `SCRAPE_THROTTLE_MS` (default 4s between page loads) is what keeps this polite. Don't lower it.

Scraped-site markup changes. When a source breaks it fails soft — the scan continues, the error appears in `/api/status` and in the UI status line, and the other sources still deliver. The Yad2 adapter mines its JSON by *shape* rather than a fixed path like `props.pageProps.feed.private`, specifically so a Yad2 internal reshuffle doesn't break it, and falls back to DOM parsing if the JSON is gone entirely.

### Balcony, safe room and the other amenities

Komo's **result cards carry no amenity data whatsoever** — measured, not
assumed: parsing 8 cards yielded zero known amenities. So each matching
listing's detail page is fetched, which does carry a structured feature list:

```html
<li class='mamad'>ממד</li>          <!-- absent  -->
<li class='mizug add'>מיזוג</li>    <!-- present -->
```

The `add` modifier means present. That polarity was verified against four live
listings by cross-checking against the free text — one said `ללא ממ"ד` (no safe
room) and had `mamad` without `add`; another said `מרוהטת` (furnished) and had
`riut add`. Reading it backwards would have labelled flats as having a ממ"ד
when they explicitly say they do not, so it was checked rather than assumed.

Enrichment is bounded (`KOMO_ENRICH_LIMIT`, default 25) and only runs for
listings that already passed the price and room filters — there is no point
spending a request to learn the amenities of a flat that is over budget.

**Amenities are tri-state**, and this is what makes the filters trustworthy:

| Value | Meaning | Effect on a "must have balcony" filter |
|---|---|---|
| `true` | the listing says it has one | keeps |
| `false` | the listing says it does **not** | rejects |
| `null` | the listing never said | **keeps** |

A description that does not mention a balcony is not a description of a flat
without one — most simply do not enumerate features. Collapsing that to "no"
would reject almost the whole market on no evidence. Only the structured detail
list, or an explicit `ללא מרפסת`, can assert absence.

### Hebrew and English

Cities and neighbourhoods are translated at ingest and stored alongside the
Hebrew, so the feed is skimmable in English while the Hebrew stays available —
that is what you paste into Waze or quote to a landlord. Score reasons are in
English too ("favourite area: Florentin").

Lookup tables rather than machine translation: the vocabulary of a rental
listing is small and closed, so a table is exact, free and offline where an API
would be approximate, paid and another failure mode. An unrecognised
neighbourhood keeps its Hebrew.

There is deliberately **no transliteration fallback**. Hebrew is an abjad, so a
letter-by-letter mapping produces unreadable consonant clusters — `חרוזים`
becomes "Chrvzym", which is no more skimmable than the original.

### Phone numbers

Where a poster publishes their number in the listing text or a pasted Facebook
post, it is normalised to E.164 and rendered as a **WhatsApp** button and a
tap-to-call link in the UI, plus a `wa.me` link in the digest.

**Komo does not publish phone numbers.** They sit behind a "הצגת מספר טלפון"
control that is login-gated (`isLogin:'false'`) and resolves through an
endpoint under `/api/`, which Komo's robots.txt disallows. Automating past a
login to reach a disallowed endpoint is not something this does, so Komo
listings show the listing link instead and you tap through to reveal the number
yourself. Verified: zero phone numbers appear anywhere in a detail page's
public text.

### Realtors vs. owners

A broker's fee in Israel is typically **one month's rent**, so who posted a
listing changes what it actually costs — not just who answers the phone. The
filter runs at two levels:

- **At scan time** (Criteria → *Posted by*): `any`, owners only, or realtors
  only. Komo applies this server-side via its own `privateOnly` / `iskiOnly`
  parameters; the other sources are filtered locally from the listing text.
- **In the feed** (*Anyone* / *No realtors* / *Realtors only*), to re-slice what
  you have already collected without re-scanning.

Detection is three-valued — agent, owner, or **unknown** — and the distinction
is load-bearing. Most listings never say, so unknown is kept by default;
treating it as "agent" would hide most of the market and treating it as "owner"
would be a claim the data doesn't support. Tick *Also drop listings that don't
say* to demand a confirmed answer.

The Hebrew is order-sensitive: `ללא תיווך` ("no agent fee") contains the word
`תיווך` ("agent"), so the negative forms are matched first — otherwise every
no-fee listing would be filed as an agency post. Cards badge a confirmed
**Realtor** or **Owner**, and show nothing when the listing didn't say.

### Facebook groups

**Not scraped, by design.** The Groups API was withdrawn in 2020 and automated collection breaches Meta's terms — people get their personal accounts banned for it.

The compliant substitute is the **Add** tab: paste a group post and the parser pulls out price, rooms, size, floor, city and neighbourhood, then runs it through the same dedupe → score → alert path as a scraped listing. So a flat you spotted in a group gets tracked for price drops exactly like a Yad2 one. Also available as `POST /api/ingest/manual`.

---

## WhatsApp setup (Twilio)

1. Open the [Twilio WhatsApp sandbox](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn).
2. Send the join code from your phone to `+1 415 523 8886`.
3. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_TO`, and set `NOTIFY_CHANNELS=whatsapp`.
4. `npm run notify:test`

**Cost:** $0.005/message to Twilio plus Meta's per-template fee (utility templates run roughly $0.0008–$0.046 by country). At one digest a day that is **cents per month**, and Twilio's trial credit covers a long while.

**The 24-hour window.** WhatsApp only allows free-form messages within 24h of your last reply to the bot. A 07:30 scheduled digest usually falls outside that, so Twilio returns error **63016**. Two fixes:

- Reply to the bot from your phone occasionally (fine for the sandbox), or
- Register an approved message template and set `TWILIO_CONTENT_SID`.

The error message in the logs names this explicitly rather than just echoing the code.

### Telegram

Strictly easier than WhatsApp for a scheduled digest: free, no per-message
cost, **no 24-hour session window** and no template approval. Setup:

1. Message [@BotFather](https://t.me/botfather) → `/newbot` → copy the token.
2. **Send your bot a message.** A bot cannot open a conversation with you, so
   without this first message every send fails with `chat not found`.
3. Message [@userinfobot](https://t.me/userinfobot) for your numeric chat ID.
4. Set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, put `telegram` in
   `NOTIFY_CHANNELS`, then `npm run notify:test`.

Both channels can run at once — the digest is rendered per channel, so each
gets markup it actually understands:

| | WhatsApp | Telegram |
|---|---|---|
| Markup | `*bold*`, bare URLs | HTML — real strikethrough, named links |
| Length | ~1,500 chars | 3,500 chars (≈2× the listings) |
| Session window | 24h, needs a template outside it | none |
| Cost | ~cents/month | free |

Listing titles are HTML-escaped for Telegram — one unescaped `<` in a title
would make Telegram reject the entire digest with "can't parse entities".

## Map

The **Map** tab plots listings as pins coloured by match score, honouring the
same filters as the feed. Tap a pin for price, size, area and a link out.

No source publishes coordinates — Komo's detail pages carry none — so addresses
are geocoded with Nominatim (OpenStreetMap). Notes that matter:

- **Queries go out in Hebrew.** Transliterated English is materially worse:
  "Sheinkin, Tel Aviv" resolves to a street in *Givatayim*, the wrong city;
  the Hebrew form lands correctly.
- **Every address is cached forever**, including failures, so an address is
  looked up once ever and an unresolvable one is not retried each morning.
- Requests are throttled to ~1/sec with an identifying User-Agent, and capped
  per run (`GEOCODE_LIMIT`), per Nominatim's usage policy. Don't lower the
  throttle — it's a free community service.
- Geocoding runs *after* filtering, so only listings you might actually want
  cost a lookup.
- A backlog is worked through a batch at a time, and the map states its own
  coverage ("24 of 55 shown") rather than quietly implying the rest don't exist.

Leaflet is vendored into `public/vendor/` rather than loaded from a CDN, so the
published page has no third-party runtime dependency. Map tiles come from
OpenStreetMap.

---

## The web UI

Mobile-first, no build step, works in light and dark. English interface with Hebrew listing content passed through using `dir="auto"`, so RTL text renders correctly inline.

- **Feed** — filter by **price range**, poster (no realtors / realtors only), source and free text; sort by match, price (either direction), size, rooms, newest, oldest or recently updated. Each card shows a price-trend sparkline.
- **Saved** — your shortlist
- **Add** — paste a Facebook-group post
- **Criteria** — edit budget, rooms, size, cities, must-haves and alert thresholds from your phone; changes apply on the next scan

Save / Hide / Contacted on each card; hidden listings drop out of the feed but stay in the database.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/listings` | Feed. `minPrice`, `maxPrice`, `minRooms`, `maxRooms`, `minSize`, `poster` (`private`/`agency`), `source`, `status`, `minScore`, `q`, `sort`, `limit`, `offset` |
| `GET /api/listings/:id` | One listing with full price history |
| `POST /api/listings/:id/action` | `{"status":"SAVED"\|"HIDDEN"\|"CONTACTED"}`; omit to clear |
| `GET` / `PUT /api/criteria` | Read / update search criteria |
| `POST /api/scan` | Trigger a scan (`{"dryRun":true}` to send nothing) |
| `POST /api/ingest/manual` | `{"text":"…","url":"…"}` |
| `GET /api/status` | Last run, counts, whether a scan is in flight |

## Commands

| Command | Purpose |
|---|---|
| `npm run scan` / `scan:dry` | Scrape, score, alert (dry run sends nothing) |
| `npm run dev` | Web UI + scheduler on :8080 |
| `npm run snapshot:import` | Restore state from `data/snapshot.json` |
| `npm run snapshot:export` | Write the snapshot and assemble `site/` |
| `npm run notify:test` | Send a sample digest to check credentials |
| `npm run browser:install` | `playwright install chromium` |

## Tests

```bash
npm test    # 74 tests
```

Covers Hebrew parsing (prices with mixed separators, `3.5 חדרים`, `קרקע`/`מרתף` floors, relative dates like `לפני 3 ימים`, and amenity negation — `ללא מעלית` must not read as *has* elevator), scoring and rejection rules, fingerprint dedupe, message formatting, and an integration suite that runs the real ingest pipeline against a throwaway SQLite database to prove the alert-once rules hold.

## Layout

```
src/
  criteria.ts          hard filters + 0-100 scoring
  sources/
    browser.ts         shared Playwright session, bot-challenge handling
    yad2.ts            shape-based JSON mining + DOM fallback
    homeless.ts        server-rendered HTML parsing
    komo.ts            plain-HTTP + cheerio parsing (no browser)
    manual.ts          free-text parser for pasted posts
    parse.ts           Hebrew price/rooms/floor/date/amenity parsing
  pipeline/
    fingerprint.ts     cross-source dedupe
    ingest.ts          persistence, price history, alert decisions
    run.ts             scan orchestration
  notify/              Twilio WhatsApp, Telegram, console + message formatting
  snapshot.ts          JSON state persistence + static site assembly
  paths.ts             locates public/ across run modes
  api.ts, server.ts, cli.ts
public/                mobile UI (no build step)
```

## Known limits

- Scraping breaks when sites change their markup. Failures are visible in `/api/status`, not silent.
- Datacenter IPs get challenged harder than residential ones — run it at home.
- Yad2 and Homeless city-code maps cover Gush Dan; other cities fall back to a text query, which is less precise.
- SQLite and a single criteria profile — this is built as a single-user tool.
