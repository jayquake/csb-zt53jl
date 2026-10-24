import { toast } from 'sonner';
import { postActionServer } from './api';
import { saveLocalAction } from './local-actions';
import type { UserActionStatus } from './types';
import type { Mode } from './app-context';

/** Tapping the active status clears it, so the same button un-sets it. */
export function nextStatus(current: UserActionStatus | null, requested: UserActionStatus): UserActionStatus | null {
  return current === requested ? null : requested;
}

export async function applyAction(mode: Mode, id: string, status: UserActionStatus | null): Promise<void> {
  try {
    if (mode === 'static') saveLocalAction(id, status);
    else await postActionServer(id, status);
    toast(status === 'HIDDEN' ? 'Hidden' : status ? 'Updated' : 'Cleared');
  } catch (err) {
    toast(`Error: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
