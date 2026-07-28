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
import { ingest, markStale, type PendingAlert } from './ingest';
import { buildNotifiers, ConsoleNotifier, type Notifier } from '../notify';
import { formatDigest } from '../notify/format';
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

    const result = await ingest(prisma, scraped, criteria, startedAt);
    log.info(
      `ingest: ${result.created} new, ${result.updated} updated, ${result.rejected} rejected, ${result.alerts.length} to alert`
    );

    const staleCount = await markStale(prisma, config.staleAfterDays, startedAt);
    if (staleCount > 0) log.info(`marked ${staleCount} listings inactive`);

    if (result.alerts.length > 0) {
      await deliver(result.alerts, options.dryRun ?? false);
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
 * Sends the digest and records what was sent. Recording happens per channel so
 * a Telegram success is not lost because WhatsApp failed.
 */
async function deliver(alerts: PendingAlert[], dryRun: boolean): Promise<void> {
  const message = formatDigest(alerts, {
    appUrl: config.publicBaseUrl,
    totalMatched: alerts.length,
  });
  if (!message) return;

  const notifiers: Notifier[] = dryRun ? [new ConsoleNotifier()] : buildNotifiers();

  for (const notifier of notifiers) {
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
