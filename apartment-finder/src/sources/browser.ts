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
 * Three things make the challenge pass reliably:
 *
 *  - A persistent user-data directory, so the clearance cookie issued after the
 *    first solve is reused on later runs.
 *  - A consistent identity: the same User-Agent, `Accept-Language`,
 *    `sec-ch-ua` client hints and timezone on *every* request. A UA that is set
 *    on the first document but missing from subsequent navigations and XHRs is
 *    a strong bot signal, so it is pinned at the context level and reasserted
 *    on each new page.
 *  - No `navigator.webdriver` flag.
 *
 * Expect this to work from a home/residential IP. Datacenter ranges are
 * challenged harder, which is why the intended deployment is local.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { config } from '../config';
import { log } from '../logger';

let context: BrowserContext | null = null;

/**
 * Client hints must agree with the User-Agent string. Chromium sends these
 * automatically for its own UA, but once the UA is overridden the hints are
 * left describing the real build, and the mismatch is trivially detectable.
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

export async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  const userAgent = config.browser.userAgent;

  context = await chromium.launchPersistentContext(config.browser.userDataDir, {
    // Undefined means "use the browser the Playwright CLI installed", which is
    // the normal path: `npx playwright install chromium`.
    executablePath: config.browser.executablePath,
    headless: config.browser.headless,
    proxy: config.browser.proxy ? { server: config.browser.proxy } : undefined,
    userAgent,
    locale: config.browser.locale,
    timezoneId: config.browser.timezone,
    viewport: { width: 1366, height: 900 },
    // Applied to every request the context makes — documents, XHR and assets
    // alike — so the identity does not drift mid-session.
    extraHTTPHeaders: {
      'Accept-Language': `${config.browser.locale},he;q=0.9,en;q=0.8`,
      ...clientHintHeaders(userAgent),
    },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });

  context.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);

  // `navigator.webdriver` is still true even with the launch flag; and the JS
  // view of the UA must match the header, or the two disagree on the same page.
  await context.addInitScript(
    ({ ua, lang }: { ua: string; lang: string }) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => [lang, 'he', 'en'] });
      Object.defineProperty(navigator, 'userAgent', { get: () => ua });
    },
    { ua: userAgent, lang: config.browser.locale }
  );

  log.debug(`browser session started as: ${userAgent}`);
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

/** The identity used for browser requests, so plain-HTTP sources can match it. */
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
