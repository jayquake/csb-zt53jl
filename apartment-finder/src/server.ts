import express from 'express';
import * as path from 'path';
import cron from 'node-cron';
import { config } from './config';
import { log } from './logger';
import { api } from './api';
import { runScan } from './pipeline/run';
import { prisma } from './db';
import { findPublicDir } from './paths';

const publicDir = findPublicDir(__dirname);

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use(express.static(publicDir));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Any unmatched non-API route serves the app shell, so deep links work.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = app.listen(config.port, () => {
  log.info(`apartment finder listening on http://localhost:${config.port}`);
  log.info(`scan schedule: ${config.scanCron} (${config.timezone})`);
  log.info(`sources: ${config.sources.join(', ')} — channels: ${config.notify.channels.join(', ')}`);
});

if (!cron.validate(config.scanCron)) {
  log.error(`SCAN_CRON "${config.scanCron}" is not a valid cron expression — the scheduled scan is disabled`);
} else {
  cron.schedule(
    config.scanCron,
    () => {
      log.info('scheduled scan starting');
      runScan().catch((err) => log.error('scheduled scan threw', err));
    },
    { timezone: config.timezone }
  );
}

if (config.scanOnStartup) {
  log.info('SCAN_ON_STARTUP is set — running an initial scan');
  runScan().catch((err) => log.error('startup scan threw', err));
}

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
