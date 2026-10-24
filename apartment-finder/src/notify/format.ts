/**
 * Alert message formatting.
 *
 * Written for WhatsApp's constraints: no markdown links (a bare URL is what
 * becomes tappable), `*bold*` rather than `**bold**`, and a hard practical
 * limit around 1600 characters per message before Twilio splits it. The
 * formatter therefore truncates the listing list rather than letting a busy
 * morning produce a message that gets chopped mid-listing.
 */

import type { PendingAlert } from '../pipeline/ingest';
import { formatPhoneLocal, whatsappLink } from '../sources/parse';

/**
 * Per-channel rendering.
 *
 * WhatsApp and Telegram are not interchangeable targets. WhatsApp takes
 * `*bold*`, linkifies bare URLs, and splits past ~1600 characters. Telegram
 * takes real HTML, renders proper strikethrough, allows 4096 characters, and —
 * unlike WhatsApp — has no 24-hour session window and no template approval, so
 * a scheduled digest can simply be sent. That extra headroom is worth using:
 * it fits roughly twice as many listings in one message.
 */
export type Flavor = 'whatsapp' | 'telegram';

const LIMITS: Record<Flavor, number> = {
  whatsapp: 1500,
  telegram: 3500,
};

/** Telegram parses HTML, so anything interpolated into it must be escaped. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

interface Style {
  bold: (t: string) => string;
  strike: (t: string) => string;
  link: (url: string, label?: string) => string;
  text: (t: string) => string;
}

const STYLES: Record<Flavor, Style> = {
  whatsapp: {
    bold: (t) => `*${t}*`,
    strike: (t) => `~${t}~`,
    // A bare URL is what WhatsApp makes tappable; markdown link syntax would
    // render literally.
    link: (url) => url,
    text: (t) => t,
  },
  telegram: {
    bold: (t) => `<b>${t}</b>`,
    strike: (t) => `<s>${t}</s>`,
    link: (url, label) => `<a href="${escapeHtml(url)}">${escapeHtml(label ?? url)}</a>`,
    text: escapeHtml,
  },
};

function shekels(amount: number | null | undefined): string {
  if (amount == null) return 'price not listed';
  return `₪${amount.toLocaleString('en-US')}`;
}

/** "3 rooms · 78m² · floor 2" — only the parts that are actually known. */
function specLine(listing: PendingAlert['listing']): string {
  const parts: string[] = [];
  if (listing.rooms != null) parts.push(`${listing.rooms} rooms`);
  if (listing.sizeSqm != null) parts.push(`${listing.sizeSqm}m²`);
  if (listing.floor != null) parts.push(listing.floor === 0 ? 'ground floor' : `floor ${listing.floor}`);
  return parts.join(' · ');
}

/**
 * Location in English where known, with the Hebrew kept alongside — the English
 * is what you skim, the Hebrew is what you paste into Waze or quote to a
 * landlord. Falls back to Hebrew alone rather than showing nothing.
 */
function locationLine(listing: PendingAlert['listing']): string {
  const hebrew = [listing.neighborhood, listing.city].filter(Boolean).join(', ');
  const english = [listing.neighborhoodEn, listing.cityEn].filter(Boolean).join(', ');

  if (!english) return hebrew;
  if (!hebrew) return english;
  return `${english}  ·  ${hebrew}`;
}

function formatOne(alert: PendingAlert, index: number, style: Style): string {
  const { listing } = alert;
  const lines: string[] = [];
  const title = style.text(listing.title);

  if (alert.kind === 'PRICE_DROP' && alert.oldPrice != null && alert.newPrice != null) {
    const dropPct = Math.round(((alert.oldPrice - alert.newPrice) / alert.oldPrice) * 100);
    lines.push(`${index}. 📉 ${style.bold(`Price drop ${dropPct}%`)} — ${title}`);
    lines.push(`   ${style.strike(shekels(alert.oldPrice))} → ${style.bold(shekels(alert.newPrice))}`);
  } else {
    lines.push(`${index}. 🏠 ${style.bold(title)}`);
    lines.push(`   ${style.bold(shekels(listing.priceIls))}/mo`);
  }

  const specs = specLine(listing);
  if (specs) lines.push(`   ${specs}`);

  // The mamad gets its own line rather than being folded into the spec list.
  // Most Tel Aviv flats predate the 1992 rule and do not have one, so this is
  // the rare exception worth spotting at a glance — costing one line for a
  // listing that has one, and nothing at all for the many that do not.
  if (listing.hasSafeRoom === true) lines.push(`   🛡️ ${style.bold('Mamad')}`);

  const location = locationLine(listing);
  if (location) lines.push(`   📍 ${style.text(location)}`);

  if (listing.scoreReasons.length > 0) {
    lines.push(`   ✨ ${style.text(listing.scoreReasons.slice(0, 2).join(' · '))}`);
  }

  lines.push(`   ${style.link(listing.url, 'Open listing')}`);

  // A tappable chat link is the difference between "interesting" and "I have
  // messaged them" — in this market that gap is measured in hours.
  // No prefilled text: URL-encoded Hebrew runs to ~200 characters, which would
  // eat the message budget and push real listings out of the digest.
  const chat = whatsappLink(listing.contactPhone);
  if (chat) lines.push(`   💬 ${style.link(chat, formatPhoneLocal(listing.contactPhone) ?? 'WhatsApp')}`);

  return lines.join('\n');
}

export interface DigestOptions {
  /** Link back to the web UI, appended so the full list is one tap away. */
  appUrl?: string;
  /** Total matches found, when more were found than are shown. */
  totalMatched?: number;
  /** Which channel this is being rendered for. Defaults to WhatsApp. */
  flavor?: Flavor;
}

/**
 * Builds the morning digest. Returns null when there is nothing to report —
 * callers should send nothing rather than a "no results" message every day.
 */
export function formatDigest(alerts: PendingAlert[], options: DigestOptions = {}): string | null {
  if (alerts.length === 0) return null;

  const flavor: Flavor = options.flavor ?? 'whatsapp';
  const style = STYLES[flavor];
  const maxChars = LIMITS[flavor];

  const drops = alerts.filter((a) => a.kind === 'PRICE_DROP');
  const fresh = alerts.filter((a) => a.kind === 'NEW');

  const header: string[] = [style.bold('🔍 Morning apartment update')];
  const summary: string[] = [];
  if (fresh.length) summary.push(`${fresh.length} new`);
  if (drops.length) summary.push(`${drops.length} price drop${drops.length > 1 ? 's' : ''}`);
  header.push(summary.join(' · '));

  const body: string[] = [];
  let index = 1;
  let used = header.join('\n').length;
  let omitted = 0;

  // Price drops first: they are the more actionable signal.
  for (const alert of [...drops, ...fresh]) {
    const block = formatOne(alert, index, style);
    if (used + block.length + 2 > maxChars) {
      omitted += 1;
      continue;
    }
    body.push(block);
    used += block.length + 2;
    index += 1;
  }

  const footer: string[] = [];
  if (omitted > 0) footer.push(`…and ${omitted} more`);
  if (options.appUrl) footer.push(`All results: ${style.link(options.appUrl, options.appUrl)}`);

  return [header.join('\n'), '', body.join('\n\n'), footer.length ? `\n${footer.join('\n')}` : '']
    .filter((s) => s !== '')
    .join('\n')
    .trim();
}

export interface StatusOptions {
  appUrl?: string;
  flavor?: Flavor;
  /** Listings currently active, so a quiet morning still shows the feed size. */
  activeCount?: number;
  /** Per-source counts from this run, e.g. `{ komo: 0 }`. */
  sourceStats?: Record<string, number>;
  /** Errors collected during the run. */
  errors?: string[];
}

/**
 * The morning status message, sent when a scan produced no alerts.
 *
 * This exists because silence is ambiguous. A scan that scrapes nothing at all
 * — a source blocked, a network failure, a selector that stopped matching —
 * produces zero alerts, which used to send exactly the same thing as a genuinely
 * quiet morning: nothing. That failure mode is invisible for as long as it
 * takes someone to notice the site has gone stale, which was days.
 *
 * So a run that finds nothing still says so, and says *why* it found nothing
 * when it knows. A daily "all quiet, 28 listings tracked" is a small price for
 * never again mistaking a broken scraper for a slow market.
 */
export function formatStatus(options: StatusOptions = {}): string {
  const flavor: Flavor = options.flavor ?? 'whatsapp';
  const style = STYLES[flavor];

  const errors = options.errors ?? [];
  const stats = options.sourceStats ?? {};
  const sources = Object.entries(stats);
  // A source that ran and returned nothing is as much a red flag as one that
  // threw: Komo returning 0 for Tel Aviv means something broke, not that the
  // city emptied out.
  const empty = sources.filter(([, count]) => count === 0).map(([name]) => name);
  const healthy = errors.length === 0 && sources.length > 0 && empty.length === 0;

  const lines: string[] = [];

  lines.push(style.bold(healthy ? '🔍 Morning apartment update' : '⚠️ Morning scan problem'));
  lines.push(healthy ? 'No new listings or price drops today.' : 'The scan ran but brought back nothing.');
  lines.push('');

  if (sources.length) {
    lines.push(sources.map(([name, count]) => `${name}: ${count}`).join(' · '));
  }
  if (options.activeCount != null) {
    lines.push(`${options.activeCount} listings still tracked.`);
  }

  if (errors.length) {
    lines.push('');
    // Verbatim, not a friendly paraphrase — the raw message is what makes this
    // diagnosable without opening the Actions log.
    for (const error of errors.slice(0, 5)) lines.push(`• ${style.text(error)}`);
    if (errors.length > 5) lines.push(`…and ${errors.length - 5} more`);
  } else if (empty.length) {
    lines.push('');
    lines.push(`No errors reported, but ${empty.join(', ')} returned 0 — likely blocked or changed.`);
  }

  if (options.appUrl) {
    lines.push('');
    lines.push(`All results: ${style.link(options.appUrl, options.appUrl)}`);
  }

  return lines.join('\n').trim();
}

/** Single-listing message, used by the "notify me about this one" action. */
export function formatSingle(alert: PendingAlert, appUrl?: string, flavor: Flavor = 'whatsapp'): string {
  const block = formatOne(alert, 1, STYLES[flavor]);
  return appUrl ? `${block}\n\n${appUrl}` : block;
}
