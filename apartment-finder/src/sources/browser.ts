/**
 * Shared browser session.
 *
 * Yad2 (Radware Bot Manager) and Homeless (Cloudflare) both return a challenge
 * page rather than listings to a plain HTTP client. Verified directly: a curl
 * against a Yad2 search URL returns HTTP 200 whose body is a Radware loader,
 * and Homeless returns 403 "Just a moment...". A `fetch()`-based scraper cannot
 * work for those two; a real browser is required.
 *
 * (Komo needs none of this — see `komo.ts`.)
 *
 * A residential IP alone does not clear either challenge. Verified directly:
 * from this machine's home connection, stock Playwright Chromium sat on
 * Yad2's "Verifying your browser…" spinner indefinitely (never a solvable
 * captcha, just a permanent stall) and on Homeless's Cloudflare Turnstile
 * checkbox, in both headless and headed mode. Seeding a real, manually-solved
 * clearance cookie into the profile did not help either — replaying it
 * through Playwright still re-triggered the challenge. The actual signal
 * being fingerprinted is the CDP connection Playwright uses to drive the
 * browser (specifically the `Runtime.enable` call), not the IP or the cookie
 * jar: the identical profile passes instantly in a normal, non-automated
 * Chrome window.
 *
 * `patchright` (a patched Playwright build, same API) avoids that CDP leak.
 * Verified: from a brand-new profile, headed `patchright` Chrome loaded both
 * sites clean, no challenge at all. Headless is a separate dead end though —
 * confirmed both `headless: true` and `headless: false` + `--headless=new`
 * still show a captcha, patchright or not, because headless Chrome carries
 * its own tells beyond the CDP leak. So this only works with a real,
 * `headless: false` Chrome window, which needs an actual interactive desktop
 * session — it cannot run under a Windows service (Session 0) or a
 * display-less CI runner.
 */

import { chromium, type BrowserContext, type Page } from 'patchright';
import { config } from '../config';
import { log } from '../logger';

let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  context = await chromium.launchPersistentContext(config.browser.userDataDir, {
    // Real installed Chrome, not the bundled Chromium — patchright patches
    // Chrome's own binary/CDP handling, and the genuine Chrome fingerprint is
    // part of what clears the challenge. Overriding the User-Agent or other
    // navigator properties on top of it (as the pre-patchright version of
    // this file did) reintroduces exactly the kind of mismatch that gets
    // flagged, so this deliberately leaves Chrome's real identity alone.
    channel: 'chrome',
    headless: config.browser.headless,
    proxy: config.browser.proxy ? { server: config.browser.proxy } : undefined,
    locale: config.browser.locale,
    timezoneId: config.browser.timezone,
    viewport: { width: 1366, height: 900 },
  });

  context.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);

  log.debug('browser session started (patchright, channel=chrome)');
  return context;
}

export async function closeBrowser(): Promise<void> {
  if (!context) return;
  await context.close().catch(() => undefined);
  context = null;
}

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Heuristics for "this is a bot wall, not the page I asked for". */
function looksLikeChallenge(html: string, title: string): boolean {
  const t = title.toLowerCase();
  if (t.includes('just a moment') || t.includes('radware') || t.includes('attention required')) return true;
  return /_Incapsula_Resource|__uzdbm_|challenge-platform|cf-browser-verification/.test(html);
}

/**
 * Navigates to `url` and waits for any bot challenge to resolve.
 *
 * Challenge pages self-redirect once their JS finishes, so the strategy is to
 * load and then poll for the markers to disappear rather than trust a fixed
 * sleep.
 */
export async function openPage(url: string, waitForSelector?: string): Promise<Page> {
  const ctx = await getContext();
  const page = await ctx.newPage();

  // A referer makes the navigation look like it came from within the site
  // rather than materialising out of nowhere.
  const origin = new URL(url).origin;
  await page.setExtraHTTPHeaders({ Referer: `${origin}/` });

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const deadline = Date.now() + config.browser.navigationTimeoutMs;
  while (Date.now() < deadline) {
    const [html, title] = await Promise.all([page.content(), page.title()]);
    if (!looksLikeChallenge(html, title)) break;
    log.debug(`bot challenge in progress at ${url}, waiting…`);
    await sleep(2500);
  }

  if (waitForSelector) {
    await page
      .waitForSelector(waitForSelector, { timeout: 20_000 })
      .catch(() => log.warn(`selector ${waitForSelector} never appeared at ${url}`));
  }

  await autoScroll(page);
  return page;
}

/** Listing grids lazy-load below the fold; scroll so later cards render. */
async function autoScroll(page: Page): Promise<void> {
  await page
    .evaluate<void>(async () => {
      await new Promise<void>((resolve) => {
        let total = 0;
        const step = 600;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          total += step;
          if (total >= document.body.scrollHeight || total > 12000) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    })
    .catch(() => undefined);
}

/** Polite delay between page loads. */
export function throttle(): Promise<void> {
  return sleep(config.browser.throttleMs);
}

/**
 * Client hints must agree with the User-Agent string, or the mismatch is a
 * bot signal in itself. Only used for Komo's plain `fetch()` identity below —
 * the patchright-driven browser above sends Chrome's own genuine hints.
 */
function clientHintHeaders(userAgent: string): Record<string, string> {
  const version = userAgent.match(/Chrome\/(\d+)/)?.[1];
  if (!version) return {};

  const platform =
    /Macintosh/.test(userAgent) ? '"macOS"'
    : /Windows/.test(userAgent) ? '"Windows"'
    : '"Linux"';

  return {
    'sec-ch-ua': `"Chromium";v="${version}", "Not(A:Brand";v="24", "Google Chrome";v="${version}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': platform,
  };
}

/** The identity used for Komo's plain-HTTP requests (Yad2/Homeless use the real Chrome identity instead). */
export function browserIdentity(): { userAgent: string; headers: Record<string, string> } {
  const userAgent = config.browser.userAgent;
  return {
    userAgent,
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': `${config.browser.locale},he;q=0.9,en;q=0.8`,
      ...clientHintHeaders(userAgent),
    },
  };
}
