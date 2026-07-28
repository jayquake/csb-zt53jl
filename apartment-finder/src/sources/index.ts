import type { ListingSource } from './types';
import { Yad2Source } from './yad2';
import { HomelessSource } from './homeless';
import { KomoSource } from './komo';

const REGISTRY: Record<string, () => ListingSource> = {
  yad2: () => new Yad2Source(),
  homeless: () => new HomelessSource(),
  komo: () => new KomoSource(),
};

/** Instantiates the configured sources, ignoring unknown names with a warning. */
export function resolveSources(names: string[]): ListingSource[] {
  const sources: ListingSource[] = [];
  for (const name of names) {
    const factory = REGISTRY[name.trim().toLowerCase()];
    if (factory) sources.push(factory());
  }
  return sources;
}

export function knownSourceNames(): string[] {
  return Object.keys(REGISTRY);
}

export * from './types';
