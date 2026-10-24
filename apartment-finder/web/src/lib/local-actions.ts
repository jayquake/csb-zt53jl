import type { UserActionStatus } from './types';

const KEY = 'apartment-finder:actions';

export function loadLocalActions(): Record<string, UserActionStatus> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveLocalAction(id: string, status: UserActionStatus | null): void {
  const actions = loadLocalActions();
  if (status) actions[id] = status;
  else delete actions[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(actions));
  } catch {
    // private browsing or a full quota — the feed still works, just unsaved
  }
}
