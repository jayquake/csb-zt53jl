import * as React from 'react';
import {
  DEFAULT_FILTERS,
  type AreaOption,
  type FeedFilters,
  type Snapshot,
  type StatusResponse,
} from './types';
import {
  detectServerMode,
  fetchAreasServer,
  fetchSnapshot,
  fetchStatusServer,
  staticStatus,
  areaOptionsFromListings,
  fromSnapshot,
} from './api';
import { loadLocalActions } from './local-actions';

export type Mode = 'loading' | 'server' | 'static';

interface AppContextValue {
  mode: Mode;
  snapshot: Snapshot | null;
  areas: AreaOption[];
  status: StatusResponse | null;
  refreshStatus: () => Promise<void>;
  filters: FeedFilters;
  setFilters: React.Dispatch<React.SetStateAction<FeedFilters>>;
  resetFilters: () => void;
  bootError: string | null;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = React.useState<Mode>('loading');
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [areas, setAreas] = React.useState<AreaOption[]>([]);
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [filters, setFilters] = React.useState<FeedFilters>(DEFAULT_FILTERS);
  const [bootError, setBootError] = React.useState<string | null>(null);

  const refreshStatus = React.useCallback(async () => {
    if (mode === 'server') {
      try {
        setStatus(await fetchStatusServer());
      } catch {
        setStatus(null);
      }
    } else if (mode === 'static' && snapshot) {
      setStatus(staticStatus(snapshot));
    }
  }, [mode, snapshot]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const isServer = await detectServerMode();
      if (cancelled) return;

      if (isServer) {
        setMode('server');
        try {
          setAreas(await fetchAreasServer());
        } catch {
          setAreas([]);
        }
        return;
      }

      try {
        const snap = await fetchSnapshot();
        if (cancelled) return;
        setSnapshot(snap);
        const actions = loadLocalActions();
        const listings = (snap.listings || []).map((row) => fromSnapshot(row, actions));
        setAreas(areaOptionsFromListings(listings));
        setMode('static');
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (mode !== 'loading') void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, snapshot]);

  const resetFilters = React.useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const value: AppContextValue = {
    mode,
    snapshot,
    areas,
    status,
    refreshStatus,
    filters,
    setFilters,
    resetFilters,
    bootError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppDataProvider');
  return ctx;
}
