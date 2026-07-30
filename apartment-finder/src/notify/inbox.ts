/**
 * Telegram as an inbox: forward a listing to the bot and it gets tracked.
 *
 * This is the compliant answer to "Facebook has the best listings". Facebook
 * groups cannot be scraped — the Groups API was withdrawn in 2020 and automated
 * collection breaches Meta's terms, at the cost of your personal account — but
 * nothing stops you from *sharing* a post you can already see. Forwarding it to
 * the bot is one tap on a phone, where the web paste form means switching apps
 * and copying text by hand.
 *
 * Forwarded messages go through exactly the same parse → fingerprint → score →
 * alert path as a scraped listing, so a flat spotted in a group is tracked for
 * price drops like any other.
 *
 * Implemented by polling `getUpdates` during each scan rather than by a webhook,
 * because a webhook needs a public HTTPS endpoint and this app has no server
 * when it runs on GitHub Actions. Polling also means messages sent overnight are
 * simply waiting to be collected by the morning run.
 */

import type { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { log } from '../logger';
import { parseManualPost } from '../sources/manual';
import { ingest, type IngestResult } from '../pipeline/ingest';
import type { SearchCriteria, RawListing } from '../types';

/** The subset of a Telegram update this cares about. */
interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: { id: number; type: string };
  forward_origin?: unknown;
  forward_from_chat?: unknown;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
}

/**
 * Telegram retains updates for 24 hours and only drops them once acknowledged,
 * so the read offset has to be persisted — otherwise every run would re-ingest
 * the same forwards. The cursor lives in the Criteria table's row space under a
 * reserved id, which keeps it in the snapshot without another model.
 */
const CURSOR_ID = 'telegram-offset';

async function readCursor(prisma: PrismaClient): Promise<number> {
  const row = await prisma.criteria.findUnique({ where: { id: CURSOR_ID } });
  const parsed = Number(row?.json);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function writeCursor(prisma: PrismaClient, offset: number): Promise<void> {
  await prisma.criteria.upsert({
    where: { id: CURSOR_ID },
    create: { id: CURSOR_ID, json: String(offset) },
    update: { json: String(offset) },
  });
}

async function fetchUpdates(offset: number): Promise<TelegramUpdate[]> {
  const { botToken } = config.notify.telegram;
  if (!botToken) return [];

  const url = `https://api.telegram.org/bot${botToken}/getUpdates?${new URLSearchParams({
    // `offset` acknowledges everything before it, so Telegram stops resending.
    offset: String(offset),
    timeout: '0',
    allowed_updates: JSON.stringify(['message', 'channel_post', 'edited_message']),
  })}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`getUpdates responded ${response.status}`);

  const body = (await response.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!body.ok) throw new Error(body.description ?? 'getUpdates failed');

  return body.result ?? [];
}

/** Messages that are commands or chatter rather than a forwarded listing. */
function isIngestable(text: string): boolean {
  if (text.startsWith('/')) return false; // /start, /help and friends
  // A listing needs enough substance to parse; "ok" or "👍" does not.
  return text.trim().length >= 30;
}

export interface InboxResult {
  seen: number;
  ingested: number;
  skipped: number;
  result?: IngestResult;
}

/**
 * Collects anything forwarded to the bot and ingests it.
 *
 * Returns the ingest result so the caller can fold any resulting alerts into
 * the same digest — a forwarded listing that matches should be reported in the
 * morning summary like anything else, not silently absorbed.
 */
export async function collectForwardedListings(
  prisma: PrismaClient,
  criteria: SearchCriteria
): Promise<InboxResult> {
  const empty: InboxResult = { seen: 0, ingested: 0, skipped: 0 };

  if (!config.notify.telegram.botToken || !config.inbox.enabled) return empty;

  let updates: TelegramUpdate[];
  try {
    updates = await fetchUpdates(await readCursor(prisma));
  } catch (err) {
    // An inbox outage must not cost the scan; the messages stay queued for 24h.
    log.warn('telegram inbox unavailable', err instanceof Error ? err.message : err);
    return empty;
  }

  if (updates.length === 0) return empty;

  const listings: RawListing[] = [];
  let skipped = 0;
  let highestUpdateId = 0;

  for (const update of updates) {
    highestUpdateId = Math.max(highestUpdateId, update.update_id);

    const message = update.message ?? update.channel_post ?? update.edited_message;
    const text = message?.text ?? message?.caption;
    if (!message || !text || !isIngestable(text)) {
      skipped += 1;
      continue;
    }

    const parsed = parseManualPost(text, undefined, new Date(message.date * 1000));
    if (!parsed) {
      skipped += 1;
      continue;
    }

    // Tag the origin so the feed can tell a forward from a scrape.
    parsed.contact = parsed.contact ?? 'via Telegram';
    listings.push(parsed);
  }

  // Acknowledge regardless of whether anything parsed: an unparseable message
  // re-read every run would be a permanent, growing tax on each scan.
  if (highestUpdateId > 0) await writeCursor(prisma, highestUpdateId + 1);

  if (listings.length === 0) {
    log.info(`telegram inbox: ${updates.length} messages, none were listings`);
    return { seen: updates.length, ingested: 0, skipped };
  }

  const result = await ingest(prisma, listings, criteria);
  log.info(
    `telegram inbox: ${updates.length} messages → ${result.created} new, ${result.updated} updated, ${result.rejected} rejected`
  );

  return { seen: updates.length, ingested: listings.length, skipped, result };
}
