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

const MAX_MESSAGE_CHARS = 1500;

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

function formatOne(alert: PendingAlert, index: number): string {
  const { listing } = alert;
  const lines: string[] = [];

  if (alert.kind === 'PRICE_DROP' && alert.oldPrice != null && alert.newPrice != null) {
    const dropPct = Math.round(((alert.oldPrice - alert.newPrice) / alert.oldPrice) * 100);
    lines.push(`${index}. 📉 *Price drop ${dropPct}%* — ${listing.title}`);
    lines.push(`   ~${shekels(alert.oldPrice)}~ → *${shekels(alert.newPrice)}*`);
  } else {
    lines.push(`${index}. 🏠 *${listing.title}*`);
    lines.push(`   *${shekels(listing.priceIls)}*/mo`);
  }

  const specs = specLine(listing);
  if (specs) lines.push(`   ${specs}`);

  const location = locationLine(listing);
  if (location) lines.push(`   📍 ${location}`);

  if (listing.scoreReasons.length > 0) {
    lines.push(`   ✨ ${listing.scoreReasons.slice(0, 2).join(' · ')}`);
  }

  lines.push(`   ${listing.url}`);

  // A tappable chat link is the difference between "interesting" and "I have
  // messaged them" — in this market that gap is measured in hours.
  // No prefilled text: URL-encoded Hebrew runs to ~200 characters, which would
  // eat the message budget and push real listings out of the digest.
  const chat = whatsappLink(listing.contactPhone);
  if (chat) lines.push(`   💬 ${formatPhoneLocal(listing.contactPhone)} — ${chat}`);

  return lines.join('\n');
}

export interface DigestOptions {
  /** Link back to the web UI, appended so the full list is one tap away. */
  appUrl?: string;
  /** Total matches found, when more were found than are shown. */
  totalMatched?: number;
}

/**
 * Builds the morning digest. Returns null when there is nothing to report —
 * callers should send nothing rather than a "no results" message every day.
 */
export function formatDigest(alerts: PendingAlert[], options: DigestOptions = {}): string | null {
  if (alerts.length === 0) return null;

  const drops = alerts.filter((a) => a.kind === 'PRICE_DROP');
  const fresh = alerts.filter((a) => a.kind === 'NEW');

  const header: string[] = ['*🔍 Morning apartment update*'];
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
    const block = formatOne(alert, index);
    if (used + block.length + 2 > MAX_MESSAGE_CHARS) {
      omitted += 1;
      continue;
    }
    body.push(block);
    used += block.length + 2;
    index += 1;
  }

  const footer: string[] = [];
  if (omitted > 0) footer.push(`…and ${omitted} more`);
  if (options.appUrl) footer.push(`All results: ${options.appUrl}`);

  return [header.join('\n'), '', body.join('\n\n'), footer.length ? `\n${footer.join('\n')}` : '']
    .filter((s) => s !== '')
    .join('\n')
    .trim();
}

/** Single-listing message, used by the "notify me about this one" action. */
export function formatSingle(alert: PendingAlert, appUrl?: string): string {
  const block = formatOne(alert, 1);
  return appUrl ? `${block}\n\n${appUrl}` : block;
}
