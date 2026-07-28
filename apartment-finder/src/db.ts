import { PrismaClient } from '@prisma/client';
import { config } from './config';
import { DEFAULT_CRITERIA, type SearchCriteria } from './types';
import { log } from './logger';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});

/**
 * Reads the saved criteria, falling back to the defaults on first run or if the
 * stored JSON has been corrupted. Stored fields are merged over the defaults so
 * that adding a new criterion in a later version does not break existing rows.
 */
export async function loadCriteria(): Promise<SearchCriteria> {
  const row = await prisma.criteria.findUnique({ where: { id: 'default' } });
  if (!row) return DEFAULT_CRITERIA;
  try {
    const parsed = JSON.parse(row.json) as Partial<SearchCriteria>;
    return {
      ...DEFAULT_CRITERIA,
      ...parsed,
      preferences: { ...DEFAULT_CRITERIA.preferences, ...(parsed.preferences ?? {}) },
    };
  } catch (err) {
    log.warn('stored criteria are not valid JSON, using defaults', err);
    return DEFAULT_CRITERIA;
  }
}

export async function saveCriteria(criteria: SearchCriteria): Promise<void> {
  const json = JSON.stringify(criteria);
  await prisma.criteria.upsert({
    where: { id: 'default' },
    create: { id: 'default', json },
    update: { json },
  });
}
