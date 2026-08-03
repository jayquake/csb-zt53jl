/**
 * The morning scan.
 *
 * Ordering matters: every source is fetched and ingested before anything is
 * sent, so a single digest covers the whole market rather than one message per
 * site. Failures are collected and reported rather than thrown, so one dead
 * source still leaves you with results from the other.
 */

import { prisma, loadCriteria } from '../db';
import { config } from '../config';
import { log } from '../logger';
import { resolveSources } from '../sources';
import { closeBrowser } from '../sources/browser';
import { ingest, markStale, pruneOutOfScope, type PendingAlert } from './ingest';
import { geocodeMissing } from '../geocode';
import { collectForwardedListings } from '../notify/inbox';
import { buildNotifiers, ConsoleNotifier, type Notifier } from '../notify';
import { formatDigest, formatStatus } from '../notify/format';
import type { RawListing } from '../types';

export interface ScanOptions {
  /** Scrape and score, but neither write alerts nor send messages. */
  dryRun?: boolean;
  /** Override the configured source list. */
  sources?: string[];
  /** Inject pre-fetched listings instead of scraping. Used by tests and by the manual ingest endpoint. */
  injected?: RawListing[];
}

export interface ScanSummary {
  runId: string;
  ok: boolean;
  seen: number;
  created: number;
  updated: number;
  rejected: number;
  alerts: number;
  errors: string[];
  sourceStats: Record<string, number>;
}

export async function runScan(options: ScanOptions = {}): Promise<ScanSummary> {
  const startedAt = new Date();
  const run = await prisma.scanRun.create({ data: { startedAt } });

  const criteria = await loadCriteria();
  const errors: string[] = [];
  const sourceStats: Record<string, number> = {};
  const scraped: RawListing[] = [];

  try {
    if (options.injected) {
      scraped.push(...options.injected);
      sourceStats.injected = options.injected.length;
    } else {
      const sources = resolveSources(options.sources ?? config.sources);
      if (sources.length === 0) errors.push('no valid sources configured');

      for (const source of sources) {
        try {
          const result = await source.fetch(criteria);
          scraped.push(...result.listings);
          sourceStats[source.name] = result.listings.length;
          errors.push(...result.errors);
          log.info(`${source.name}: ${result.listings.length} listings scraped`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sourceStats[source.name] = 0;
          errors.push(`${source.name}: ${message}`);
          log.error(`${source.name} failed entirely`, message);
        }
      }
    }

    // Forwarded listings are collected first so a flat you sent overnight is
    // deduplicated against tonight's scrape rather than arriving as a second
    // copy of the same apartment.
    const forwarded = await collectForwardedListings(prisma, criteria);
    if (forwarded.ingested > 0) sourceStats.telegram = forwarded.ingested;

    const result = await ingest(prisma, scraped, criteria, startedAt);

    // Alerts from forwards belong in the same digest — a listing you sent in
    // that turns out to match should be reported, not silently absorbed.
    if (forwarded.result) {
      result.alerts.unshift(...forwarded.result.alerts);
      result.created += forwarded.result.created;
      result.updated += forwarded.result.updated;
      result.alerts = result.alerts.slice(0, criteria.maxAlertsPerRun);
    }
    log.info(
      `ingest: ${result.created} new, ${result.updated} updated, ${result.rejected} rejected, ${result.alerts.length} to alert`
    );

    // After ingest so only listings that survived the filters are geocoded,
    // and before notifying so a fresh listing can be mapped straight away.
    try {
      await geocodeMissing(prisma);
    } catch (err) {
      // A geocoding outage must not cost the whole scan — the listings are
      // still useful, they just have no pin yet, and the next run retries.
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`geocode: ${message}`);
      log.warn('geocoding failed', message);
    }

    // Before staleness, so a narrowed search takes effect immediately rather
    // than waiting out staleAfterDays.
    await pruneOutOfScope(prisma, criteria);

    const staleCount = await markStale(prisma, config.staleAfterDays, startedAt);
    if (staleCount > 0) log.info(`marked ${staleCount} listings inactive`);

    if (result.alerts.length > 0) {
      await deliver(result.alerts, options.dryRun ?? false);
    } else if (config.notify.heartbeat) {
      // Deliberately not silent. A scan that scrapes nothing at all produces
      // zero alerts, which is indistinguishable from a genuinely quiet
      // morning if nothing is sent — that is how a dead scraper went unnoticed
      // for days. The status message reports the per-source counts and any
      // errors, so a broken run announces itself the same morning.
      await deliverStatus(
        {
          activeCount: await prisma.listing.count({ where: { isActive: true } }),
          sourceStats,
          errors,
        },
        options.dryRun ?? false
      );
    } else {
      log.info('nothing worth alerting on — staying quiet');
    }

    const summary: ScanSummary = {
      runId: run.id,
      ok: true,
      seen: result.seen,
      created: result.created,
      updated: result.updated,
      rejected: result.rejected,
      alerts: result.alerts.length,
      errors,
      sourceStats,
    };

    await prisma.scanRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        ok: true,
        seenCount: result.seen,
        newCount: result.created,
        dropCount: result.alerts.filter((a) => a.kind === 'PRICE_DROP').length,
        errors: errors.length ? JSON.stringify(errors) : null,
        sourceStats: JSON.stringify(sourceStats),
      },
    });

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    log.error('scan failed', message);

    await prisma.scanRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, errors: JSON.stringify(errors) },
    });

    return {
      runId: run.id,
      ok: false,
      seen: scraped.length,
      created: 0,
      updated: 0,
      rejected: 0,
      alerts: 0,
      errors,
      sourceStats,
    };
  } finally {
    // The browser is only closed at the very end so all sources share one
    // session — and therefore one solved bot challenge.
    if (!options.injected) await closeBrowser();
  }
}

/**
 * Sends the morning status message — the "nothing to report" counterpart to the
 * digest.
 *
 * Nothing is written to the Alert table: that table records which *listings*
 * have been alerted on, and a status message is about none of them. Writing
 * rows there would corrupt the alert-once bookkeeping.
 *
 * A failure here is logged and swallowed. The status message is a courtesy on
 * top of a scan that has already succeeded; failing the run because a heartbeat
 * could not be delivered would turn a working scan into a red one.
 */
async function deliverStatus(
  status: { activeCount: number; sourceStats: Record<string, number>; errors: string[] },
  dryRun: boolean
): Promise<void> {
  const notifiers: Notifier[] = dryRun ? [new ConsoleNotifier()] : buildNotifiers();

  for (const notifier of notifiers) {
    const message = formatStatus({
      appUrl: config.publicBaseUrl,
      flavor: notifier.flavor,
      activeCount: status.activeCount,
      sourceStats: status.sourceStats,
      errors: status.errors,
    });

    try {
      await notifier.send(message);
      log.info(`sent status via ${notifier.channel}`);
    } catch (err) {
      log.error(`failed to send status via ${notifier.channel}`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Sends the digest and records what was sent. Recording happens per channel so
 * a Telegram success is not lost because WhatsApp failed.
 */
async function deliver(alerts: PendingAlert[], dryRun: boolean): Promise<void> {
  const notifiers: Notifier[] = dryRun ? [new ConsoleNotifier()] : buildNotifiers();

  for (const notifier of notifiers) {
    // Rendered per channel: Telegram gets HTML and twice the length budget,
    // WhatsApp gets its own markup and a tighter cap.
    const message = formatDigest(alerts, {
      appUrl: config.publicBaseUrl,
      totalMatched: alerts.length,
      flavor: notifier.flavor,
    });
    if (!message) return;

    let ok = true;
    let error: string | null = null;

    try {
      await notifier.send(message);
      log.info(`sent digest via ${notifier.channel}`);
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
      log.error(`failed to send via ${notifier.channel}`, error);
    }

    // In a dry run nothing is persisted, so re-running produces the same output
    // instead of silently marking listings as already-alerted.
    if (dryRun) continue;

    await prisma.alert.createMany({
      data: alerts.map((alert) => ({
        listingId: alert.listingId,
        kind: alert.kind,
        oldPrice: alert.oldPrice ?? null,
        newPrice: alert.newPrice ?? null,
        channel: notifier.channel,
        ok,
        error,
      })),
    });
  }
}
