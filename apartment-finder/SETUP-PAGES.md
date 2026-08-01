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

This workflow scans **Komo only**, and Komo returns results regardless of
where the job runs — it was never blocked, on GitHub-hosted or otherwise.

## 7. Yad2 and Homeless are not part of this workflow

Both were originally expected to work from a self-hosted runner instead of
GitHub-hosted, on the theory that a residential IP would clear their bot
challenges where a datacenter IP couldn't. That turned out to be wrong:
verified directly, a residential connection doesn't clear either challenge
either. The actual signal both vendors key on is the CDP connection any
browser-automation tool uses to drive Chrome, not the IP. A patched,
CDP-leak-free Chrome (patchright) does get through — but only in a real
**headed** window, since headless carries its own separate tells and still
shows a captcha regardless of the CDP fix. A headed window needs an
interactive desktop session, which no CI runner has — self-hosted or not,
and whether it's installed as a Windows service or a Linux systemd unit.

So there is currently no way to run Yad2/Homeless on a schedule. The
practical path is manual: on a machine you're logged into,
`HEADLESS=false npm run scan` (or `SOURCES=yad2,homeless HEADLESS=false npm
run scan` to skip re-scanning Komo). See `apartment-finder/README.md`,
"Sources, and the bot-protection reality", for the full story. If you
previously registered a self-hosted runner for this, it's no longer needed
by this workflow — Komo runs fine on `ubuntu-latest` — but it isn't harmful
to leave registered either, in case a future logged-in-session setup makes
scheduled Yad2/Homeless scanning possible.
