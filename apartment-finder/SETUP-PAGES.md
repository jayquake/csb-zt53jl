# Going live on GitHub Pages

Checklist for hosting this in its own repository.

## 1. Workflow

If the app is at the **repo root**, use `.github/workflows/apartment-finder.yml`
with `working-directory: .` and artifact `path: ./site`.

If it is in a **subdirectory**, keep `working-directory: apartment-finder` and
`path: apartment-finder/site`.

> **The cron only fires from the default branch.** GitHub ignores `schedule:`
> triggers on any other branch. The workflow must be merged to `main` (or
> whatever the default is) or the morning scan will never run on its own —
> `workflow_dispatch` will still work by hand, which is a common way to be
> confused for a week.

## 2. Enable Pages

Settings → Pages → **Source: GitHub Actions**.

Not "Deploy from a branch" — the workflow publishes an artifact, so the branch
option does not apply.

## 3. Secrets

Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Needed for |
|---|---|
| `TWILIO_ACCOUNT_SID` | WhatsApp |
| `TWILIO_AUTH_TOKEN` | WhatsApp |
| `TWILIO_WHATSAPP_FROM` | WhatsApp (`whatsapp:+14155238886` for the sandbox) |
| `TWILIO_WHATSAPP_TO` | WhatsApp (`whatsapp:+9725XXXXXXXX`) |
| `TELEGRAM_BOT_TOKEN` | Telegram (optional alternative) |
| `TELEGRAM_CHAT_ID` | Telegram (optional alternative) |

Secrets are never exposed to the published page — they exist only inside the
Actions runner.

## 4. Variables

Same screen, **Variables** tab:

| Variable | Value |
|---|---|
| `PUBLIC_BASE_URL` | `https://<user>.github.io/<repo>` — the link in the WhatsApp message |
| `NOTIFY_CHANNELS` | `whatsapp`, `telegram`, or `whatsapp,telegram` |

## 5. First run

Actions → Apartment Finder → **Run workflow**, with **dry run ticked**.

Dry run scrapes and scores but sends nothing, so a misconfigured phone number
or an over-broad set of criteria surfaces before it messages you. Check the job
summary for per-source counts, then re-run without dry run.

## 6. Repo visibility

A **private** repo can still publish a public Pages site on paid plans; on the
free plan Pages requires the repo to be public. If the repo is public, note
that `data/snapshot.json` is public too. It contains only public listing data
and your search criteria — no credentials — but the criteria do reveal your
budget and preferred neighbourhoods.

## Expected first-run outcome

Komo should return results. Yad2 and Homeless may be challenged, because
GitHub-hosted runners use Azure datacenter IP ranges that Radware and
Cloudflare treat far more suspiciously than a home connection. The job reports
per-source counts rather than failing, so check the summary. If those two are
blocked, either narrow `sources` to `komo` or run the scan from home and use
Pages only for viewing.
